import { Habit, HabitCompletionEvent, UserSession } from '../types';
import { INITIAL_HABITS } from '../data/initialHabits';
import { isSupabaseConfigured, supabase } from './supabase';
import { fetchUserProfile, persistUserProfile } from './profile';
import {
  fetchHabitLogsFromTable,
  mergeCompletionEvents,
  upsertHabitLog,
} from '../utils/momentum';
import { getTodayDayIndex } from '../utils/dates';

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

function asBooleanArray(value: unknown, fallback: boolean[]): boolean[] {
  return Array.isArray(value) && value.length === 7
    ? value.map(Boolean)
    : fallback;
}

function rowToHabit(row: Record<string, unknown>): Habit | null {
  if (!row?.id || !row?.name) return null;
  const category = row.category === 'self_improvement' ? 'self_improvement' : 'work';
  return {
    id: String(row.id),
    name: String(row.name),
    category,
    timestamp: String(row.timestamp || ''),
    days: asBooleanArray(row.days, [false, false, false, false, false, false, false]),
    microDays: asBooleanArray(row.micro_days ?? row.microDays, [false, false, false, false, false, false, false]),
    fallbackMicroHabit: row.fallback_micro_habit ? String(row.fallback_micro_habit) : undefined,
    purposeAnchor: row.purpose_anchor ? String(row.purpose_anchor) : undefined,
    identityStatement: String(row.identity_statement || row.identityStatement || ''),
    targetDaysPerWeek: Number(row.target_days_per_week ?? row.targetDaysPerWeek ?? 7) || 7,
    color: row.color ? String(row.color) : undefined,
    archived: Boolean(row.archived),
    tags: Array.isArray(row.tags) ? row.tags.map(String) : undefined,
    priority: (row.priority as Habit['priority']) || undefined,
    scheduleType: (row.schedule_type as Habit['scheduleType']) || (row.scheduleType as Habit['scheduleType']) || undefined,
    scheduledDays: Array.isArray(row.scheduled_days)
      ? row.scheduled_days.map(Number)
      : Array.isArray(row.scheduledDays)
        ? row.scheduledDays.map(Number)
        : undefined,
    intervalDays: row.interval_days != null ? Number(row.interval_days) : undefined,
    weeklyTargetCount: row.weekly_target_count != null ? Number(row.weekly_target_count) : undefined,
  };
}

function habitToRow(habit: Habit, userId: string) {
  return {
    id: habit.id,
    user_id: userId,
    name: habit.name,
    category: habit.category,
    timestamp: habit.timestamp,
    days: habit.days,
    micro_days: habit.microDays ?? null,
    fallback_micro_habit: habit.fallbackMicroHabit ?? null,
    purpose_anchor: habit.purposeAnchor ?? null,
    identity_statement: habit.identityStatement,
    target_days_per_week: habit.targetDaysPerWeek,
    color: habit.color ?? null,
    archived: Boolean(habit.archived),
    tags: habit.tags ?? null,
    priority: habit.priority ?? null,
    schedule_type: habit.scheduleType ?? null,
    scheduled_days: habit.scheduledDays ?? null,
    interval_days: habit.intervalDays ?? null,
    weekly_target_count: habit.weeklyTargetCount ?? null,
    updated_at: new Date().toISOString(),
  };
}

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

async function fetchRemoteHabits(userId: string): Promise<Habit[]> {
  if (!isSupabaseConfigured || !supabase) return [];
  try {
    const { data, error } = await supabase.from('habits').select('*').eq('user_id', userId);
    if (error || !data) return [];
    return (data as Record<string, unknown>[])
      .map(rowToHabit)
      .filter((habit): habit is Habit => habit !== null);
  } catch {
    return [];
  }
}

async function upsertRemoteHabits(userId: string, habits: Habit[]): Promise<void> {
  if (!isSupabaseConfigured || !supabase || habits.length === 0) return;
  try {
    await supabase.from('habits').upsert(habits.map((habit) => habitToRow(habit, userId)));
  } catch {
    // Local habits remain source of truth if the table is missing or RLS blocks.
  }
}

export async function persistHabitsToTable(userId: string, habits: Habit[]): Promise<void> {
  await upsertRemoteHabits(userId, habits);
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
    await supabase.from('momentum_history').upsert(
      {
        user_id: userId,
        score: Math.round(score),
        day_index: dayIndex,
        recorded_on: recordedOn,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,recorded_on' }
    );
  } catch {
    // Optional history table — ignore if it is not provisioned yet.
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

  const remoteHabits = await fetchRemoteHabits(session.id);
  const mergedHabits = mergeHabits(input.habits, remoteHabits);
  await upsertRemoteHabits(session.id, mergedHabits);

  const remoteLogs = await fetchHabitLogsFromTable(session.id);
  const mergedLogs = mergeCompletionEvents(input.completionEvents, remoteLogs);
  await pushLocalLogs(session.id, mergedLogs);

  await persistMomentumHistory(session.id, input.momentumScore);

  return { habits: mergedHabits, completionEvents: mergedLogs };
}
