import { Habit, HabitCompletionEvent, UserSession } from '../types';
import { INITIAL_HABITS } from '../data/initialHabits';
import { fetchUserProfile, persistUserProfile } from './profile';
import { fetchActiveHabits, persistHabitsToTable } from './habitsApi';
import {
  fetchHabitLogsFromTable,
  mergeCompletionEvents,
  upsertHabitLog,
} from '../utils/momentum';
import { getTodayDayIndex } from '../utils/dates';
import { isSupabaseConfigured, supabase } from './supabase';

const SEED_HABIT_IDS = new Set(INITIAL_HABITS.map((habit) => habit.id));

export interface AccountSyncInput {
  session: UserSession;
  habits: Habit[];
  completionEvents: HabitCompletionEvent[];
  interests: string[];
  hasCompletedTutorial: boolean;
  momentumScore: number;
}

export interface AccountSyncResult {
  habits: Habit[];
  completionEvents: HabitCompletionEvent[];
}

export { persistHabitsToTable };

function mergeHabits(local: Habit[], remote: Habit[]): Habit[] {
  if (remote.length === 0) return local;

  const merged = new Map<string, Habit>();
  remote.forEach((habit) => merged.set(habit.id, habit));
  local.forEach((habit) => {
    if (SEED_HABIT_IDS.has(habit.id) && !merged.has(habit.id)) return;
    if (!merged.has(habit.id)) merged.set(habit.id, habit);
  });
  return Array.from(merged.values());
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
    const recordedOn = new Date().toISOString().slice(0, 10);
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
    return { habits: input.habits, completionEvents: input.completionEvents };
  }

  const profile = await fetchUserProfile(session, input.interests);
  const interests = profile.interests.length > 0 ? profile.interests : input.interests;
  const hasCompletedTutorial = profile.has_completed_tutorial || input.hasCompletedTutorial;
  await persistUserProfile(session, {
    interests,
    has_completed_tutorial: hasCompletedTutorial,
  });

  const remoteHabits = await fetchActiveHabits(session.id);
  const mergedHabits = mergeHabits(input.habits, remoteHabits);
  await persistHabitsToTable(session.id, mergedHabits);

  const remoteLogs = await fetchHabitLogsFromTable(session.id);
  const mergedLogs = mergeCompletionEvents(input.completionEvents, remoteLogs);
  await pushLocalLogs(session.id, mergedLogs);

  await persistMomentumHistory(session.id, input.momentumScore);

  return { habits: mergedHabits, completionEvents: mergedLogs };
}
