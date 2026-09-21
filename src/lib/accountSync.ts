import { Habit, HabitCompletionEvent, MomentumEvent, UserSession } from '../types';
import { isSeedHabitId } from '../data/initialHabits';
import { fetchUserProfile, persistUserProfile } from './profile';
import { fetchHabitsFromTable, omitDeletedHabitRefs, omitDeletedHabits, persistHabitsToTable, purgeSeedHabitsFromTable } from './habitsApi';
import {
  fetchHabitLogsFromTable,
  mergeCompletionEvents,
  mergeMomentumEvents,
  upsertHabitLog,
} from '../utils/momentum';
import { fetchMomentumEventsFromTable, pushMomentumEventsRemote } from './momentumEvents';
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

async function pushLocalLogs(userId: string, events: HabitCompletionEvent[]): Promise<void> {
  if (!events.length) return;
  await Promise.all(events.map((event) => upsertHabitLog(userId, event)));
}

export async function persistMomentumHistory(
  userId: string,
  score: number,
  dayIndex: number = getTodayDayIndex()
): Promise<void> {
  if (!isSupabaseConfigured || !supabase || !userId || userId.startsWith('guest_')) return;
  try {
    const recordedOn = toISODate();
    const { error } = await supabase.from('momentum_history').upsert(
      {
        user_id: userId,
        score: Math.round(score),
        day_index: dayIndex,
        recorded_on: recordedOn,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,recorded_on' }
    );
    if (error) console.warn('momentum_history upsert failed:', error.message);
  } catch (err) {
    console.warn('momentum_history upsert offline:', err);
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
  if (!session || session.isGuest || session.id.startsWith('guest_')) {
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
  await persistUserProfile(session, {
    interests,
    has_completed_tutorial: Boolean(hasCompletedTutorial),
  });

  await purgeSeedHabitsFromTable(session.id);

  const remoteHabitsResult = await fetchHabitsFromTable(session.id);
  if (!remoteHabitsResult.ok) {
    return {
      habits: omitDeletedHabits(withoutSeedHabits(input.habits)),
      completionEvents: omitDeletedHabitRefs(input.completionEvents),
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
  const mergedLogs = omitDeletedHabitRefs(
    mergeCompletionEvents(input.completionEvents, remoteLogs).filter(
      (event) => !isSeedHabitId(event.habitId)
    )
  );
  await pushLocalLogs(session.id, mergedLogs);

  const remoteMomentum = await fetchMomentumEventsFromTable(session.id);
  const mergedMomentum = mergeMomentumEvents(input.momentumEvents, remoteMomentum).filter(
    (event) => !isSeedHabitId(event.habitId)
  );
  await pushMomentumEventsRemote(session.id, mergedMomentum);

  await persistMomentumHistory(session.id, input.momentumScore);

  return {
    habits: mergedHabits,
    completionEvents: mergedLogs,
    momentumEvents: mergedMomentum,
    ok: true,
  };
}
