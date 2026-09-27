import { Habit, HabitCompletionEvent, MomentumEvent, UserSession } from '../types';
import { isSeedHabitId } from '../data/initialHabits';
import { fetchUserProfile, persistUserProfile } from './profile';
import { fetchHabitsFromTable, omitDeletedHabits, persistHabitsToTable, purgeSeedHabitsFromTable } from './habitsApi';
import {
  fetchHabitLogsFromTable,
  mergeCompletionEvents,
  mergeMomentumEvents,
} from '../utils/momentum';
import { fetchMomentumEventsFromTable, pushMomentumEventsRemote } from './momentumEvents';
import { pushHabitLogRemote } from './offlineSync';
import { mergeHabitsByUpdatedAt } from './syncMerge';
import { getTodayDayIndex, toISODate } from '../utils/dates';
import { isSupabaseConfigured, supabase } from './supabase';

export interface AccountSyncInput {
  session: UserSession;
  habits: Habit[];
  completionEvents: HabitCompletionEvent[];
  momentumEvents: MomentumEvent[];
  interests: string[];
  hasCompletedTutorial: boolean;
  momentumScore: number;
  /** Re-read local habits after remote fetch so in-flight edits are not dropped. */
  getLatestHabits?: () => Habit[];
}

export interface AccountSyncResult {
  habits: Habit[];
  completionEvents: HabitCompletionEvent[];
  momentumEvents: MomentumEvent[];
  ok: boolean;
  error?: string;
}

export { persistHabitsToTable, mergeHabitsByUpdatedAt };

function withoutSeedHabits(habits: Habit[]): Habit[] {
  return habits.filter((habit) => !isSeedHabitId(habit.id));
}

async function pushLocalLogs(userId: string, events: HabitCompletionEvent[]): Promise<boolean> {
  if (!events.length) return true;
  const results = await Promise.all(events.map((event) => pushHabitLogRemote(userId, event)));
  return results.every(Boolean);
}

export async function persistMomentumHistory(
  userId: string,
  score: number,
  _dayIndex: number = getTodayDayIndex()
): Promise<boolean> {
  if (!isSupabaseConfigured || !supabase || !userId || userId.startsWith('guest_')) return false;
  try {
    const recordedDate = toISODate();
    const { error } = await supabase.from('momentum_history').upsert(
      {
        user_id: userId,
        score: Math.round(score),
        recorded_date: recordedDate,
      },
      { onConflict: 'user_id,recorded_date' }
    );
    if (error) {
      console.warn('momentum_history upsert failed:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('momentum_history upsert offline:', err);
    return false;
  }
}

/**
 * Guest → authenticated (and returning-user) hydration.
 * Pulls profiles / habits / habit_logs / momentum_history, merges with local guest
 * work, then writes the union back so the new auth uid owns the data.
 */
export async function syncAuthenticatedAccount(
  input: AccountSyncInput
): Promise<AccountSyncResult> {
  const { session } = input;
  if (!session || session?.isGuest || session?.id?.startsWith('guest_')) {
    return {
      habits: withoutSeedHabits(input.habits),
      completionEvents: input.completionEvents,
      momentumEvents: input.momentumEvents,
      ok: false,
      error: 'Guest sessions stay local',
    };
  }

  const profile = await fetchUserProfile(session, input.interests);
  const interests = profile.interests.length > 0 ? profile.interests : input.interests;
  const hasCompletedTutorial = profile.has_completed_tutorial || input.hasCompletedTutorial;
  // Sticky: once completed locally or remotely, never push false back to profiles.
  const profilePersisted = await persistUserProfile(session, {
    interests,
    has_completed_tutorial: Boolean(hasCompletedTutorial),
  });

  await purgeSeedHabitsFromTable(session.id);

  const remoteHabitsResult = await fetchHabitsFromTable(session.id);
  if (!remoteHabitsResult.ok) {
    return {
      habits: omitDeletedHabits(withoutSeedHabits(input.habits)),
      completionEvents: input.completionEvents,
      momentumEvents: input.momentumEvents,
      ok: false,
      error: remoteHabitsResult.error || 'Could not read habits from Supabase',
    };
  }

  const mergedHabits = omitDeletedHabits(
    mergeHabitsByUpdatedAt(input.getLatestHabits?.() ?? input.habits, remoteHabitsResult.habits)
  );
  const wroteHabits = await persistHabitsToTable(session.id, mergedHabits);
  if (!wroteHabits) {
    return {
      habits: mergedHabits,
      completionEvents: input.completionEvents,
      momentumEvents: input.momentumEvents,
      ok: false,
      error: 'Could not write habits to Supabase',
    };
  }

  const remoteLogs = await fetchHabitLogsFromTable(session.id);
  const mergedLogs = mergeCompletionEvents(
  input.completionEvents,
  remoteLogs
).filter((event) => !isSeedHabitId(event.habitId));
  const logsPersisted = await pushLocalLogs(session.id, mergedLogs);

  const remoteMomentum = await fetchMomentumEventsFromTable(session.id);
  const mergedMomentum = mergeMomentumEvents(input.momentumEvents, remoteMomentum).filter(
    (event) => !isSeedHabitId(event.habitId)
  );
  const momentumPersisted = await pushMomentumEventsRemote(session.id, mergedMomentum);

  const historyPersisted = await persistMomentumHistory(session.id, input.momentumScore);

  if (!profilePersisted || !logsPersisted || !momentumPersisted || !historyPersisted) {
    return {
      habits: mergedHabits,
      completionEvents: mergedLogs,
      momentumEvents: mergedMomentum,
      ok: false,
      error: 'Some account data could not be confirmed in Supabase. Check your connection and retry sync.',
    };
  }

  return {
    habits: mergedHabits,
    completionEvents: mergedLogs,
    momentumEvents: mergedMomentum,
    ok: true,
  };
}
