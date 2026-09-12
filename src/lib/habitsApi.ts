import { Habit, HabitCategory, HabitCompletionEvent } from '../types';
import { isSupabaseConfigured, supabase } from './supabase';
import { habitCategoryBadge } from '../utils/categories';
import { getTodayDayIndex, isoDateForDayIndex } from '../utils/dates';
import { HabitLogRow, mapHabitLogRowToEvent } from '../utils/momentum';

function canSync(userId?: string | null): boolean {
  return Boolean(isSupabaseConfigured && supabase && userId && !userId.startsWith('guest_'));
}

export function toDbCategory(category: HabitCategory): 'W' | 'SI' {
  return habitCategoryBadge(category) === 'W' ? 'W' : 'SI';
}

export function fromDbCategory(raw: unknown): HabitCategory {
  const value = String(raw || '').trim().toUpperCase();
  if (value === 'W' || value === 'WORK') return 'work';
  return 'self_improvement';
}

function asBooleanArray(value: unknown, fallback: boolean[]): boolean[] {
  return Array.isArray(value) && value.length === 7 ? value.map(Boolean) : fallback;
}

export function rowToHabit(row: Record<string, unknown>): Habit | null {
  const title = row.title || row.name;
  if (!row?.id || !title) return null;
  const emptyWeek = [false, false, false, false, false, false, false];
  return {
    id: String(row.id),
    name: String(title),
    category: fromDbCategory(row.category),
    timestamp: String(row.timestamp || ''),
    days: asBooleanArray(row.days, emptyWeek),
    microDays: asBooleanArray(row.micro_days ?? row.microDays, emptyWeek),
    fallbackMicroHabit: row.fallback_micro_habit ? String(row.fallback_micro_habit) : undefined,
    purposeAnchor: row.purpose_anchor ? String(row.purpose_anchor) : undefined,
    identityStatement: String(row.identity_statement || row.identityStatement || ''),
    targetDaysPerWeek: Number(row.target_days_per_week ?? row.targetDaysPerWeek ?? 7) || 7,
    color: row.color ? String(row.color) : undefined,
    archived: Boolean(row.archived),
    tags: Array.isArray(row.tags) ? row.tags.map(String) : [toDbCategory(fromDbCategory(row.category))],
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

export function habitToRow(habit: Habit, userId: string) {
  const category = toDbCategory(habit.category);
  return {
    id: habit.id,
    user_id: userId,
    title: habit.name,
    name: habit.name,
    category,
    timestamp: habit.timestamp,
    days: habit.days,
    micro_days: habit.microDays ?? null,
    fallback_micro_habit: habit.fallbackMicroHabit ?? null,
    purpose_anchor: habit.purposeAnchor ?? null,
    identity_statement: habit.identityStatement,
    target_days_per_week: habit.targetDaysPerWeek,
    color: habit.color ?? null,
    archived: Boolean(habit.archived),
    tags: habit.tags ?? [category],
    priority: habit.priority ?? null,
    schedule_type: habit.scheduleType ?? null,
    scheduled_days: habit.scheduledDays ?? null,
    interval_days: habit.intervalDays ?? null,
    weekly_target_count: habit.weeklyTargetCount ?? null,
    updated_at: new Date().toISOString(),
  };
}

export async function fetchActiveHabits(userId?: string | null): Promise<Habit[]> {
  if (!canSync(userId) || !supabase) return [];
  try {
    const { data, error } = await supabase
      .from('habits')
      .select('*')
      .eq('user_id', userId as string);

    if (error) {
      console.warn('Habits fetch failed:', error.message);
      return [];
    }

    return (data as Record<string, unknown>[] | null || [])
      .map(rowToHabit)
      .filter((habit): habit is Habit => habit !== null && !habit.archived);
  } catch (err) {
    console.warn('Habits fetch offline:', err);
    return [];
  }
}

export async function persistHabitsToTable(userId: string, habits: Habit[]): Promise<void> {
  if (!canSync(userId) || !supabase || habits.length === 0) return;
  try {
    const { error } = await supabase.from('habits').upsert(habits.map((habit) => habitToRow(habit, userId)));
    if (error) console.warn('Habits upsert failed:', error.message);
  } catch (err) {
    console.warn('Habits upsert offline:', err);
  }
}

export async function insertHabitToSupabase(
  userId: string | null | undefined,
  habit: Habit
): Promise<void> {
  if (!canSync(userId) || !supabase) return;
  try {
    const { error } = await supabase.from('habits').upsert(habitToRow(habit, userId as string));
    if (error) console.warn('Habit insert failed:', error.message);
  } catch (err) {
    console.warn('Habit insert offline:', err);
  }
}

export async function deleteHabitCascade(
  userId: string | null | undefined,
  habitId: string
): Promise<void> {
  if (!canSync(userId) || !supabase) return;
  try {
    const logs = await supabase
      .from('habit_logs')
      .delete()
      .eq('user_id', userId as string)
      .eq('habit_id', habitId);
    if (logs.error) console.warn('habit_logs cascade delete failed:', logs.error.message);

    const habits = await supabase
      .from('habits')
      .delete()
      .eq('user_id', userId as string)
      .eq('id', habitId);
    if (habits.error) console.warn('habits cascade delete failed:', habits.error.message);
  } catch (err) {
    console.warn('Habit cascade delete offline:', err);
  }
}

export async function fetchTodayHabitLogs(
  userId?: string | null,
  dayIndex: number = getTodayDayIndex()
): Promise<HabitCompletionEvent[]> {
  if (!canSync(userId) || !supabase) return [];
  const loggedDate = isoDateForDayIndex(dayIndex);
  try {
    let query = supabase
      .from('habit_logs')
      .select('*')
      .eq('user_id', userId as string)
      .eq('logged_date', loggedDate);

    let { data, error } = await query;
    if (error) {
      const fallback = await supabase
        .from('habit_logs')
        .select('*')
        .eq('user_id', userId as string)
        .eq('day_index', dayIndex);
      data = fallback.data;
      error = fallback.error;
    }

    if (error) {
      console.warn('Today habit_logs fetch failed:', error.message);
      return [];
    }

    return (data as HabitLogRow[] | null || [])
      .map(mapHabitLogRowToEvent)
      .filter((event): event is HabitCompletionEvent => event !== null);
  } catch (err) {
    console.warn('Today habit_logs fetch offline:', err);
    return [];
  }
}
