import { Habit, HabitCategory, HabitCompletionEvent } from '../types';
import { isSupabaseConfigured, supabase } from './supabase';
import { habitCategoryBadge } from '../utils/categories';
import { getTodayDayIndex, isoDateForDayIndex, toISODate } from '../utils/dates';
import { HabitLogRow, mapHabitLogRowToEvent } from '../utils/momentum';
import { isSeedHabitId, SEED_HABIT_IDS } from '../data/initialHabits';
import { MAX_ACTIVE_HABITS } from './protection';

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
    scheduledDays: (() => {
      const raw = Array.isArray(row.scheduled_days)
        ? row.scheduled_days.map(Number)
        : Array.isArray(row.scheduledDays)
          ? row.scheduledDays.map(Number)
          : [];
      return raw.length > 0 ? raw : undefined;
    })(),
    intervalDays: row.interval_days != null ? Number(row.interval_days) : undefined,
    weeklyTargetCount: row.weekly_target_count != null ? Number(row.weekly_target_count) : undefined,
    isKeystone: Boolean(row.is_keystone ?? row.isKeystone),
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
    is_keystone: Boolean(habit.isKeystone),
    updated_at: new Date().toISOString(),
  };
}

export async function fetchHabitsFromTable(userId?: string | null): Promise<{
  ok: boolean;
  habits: Habit[];
  error?: string;
}> {
  if (!canSync(userId) || !supabase) {
    return { ok: false, habits: [], error: 'Supabase is not connected' };
  }
  try {
    const { data, error } = await supabase
      .from('habits')
      .select('*')
      .eq('user_id', userId as string);

    if (error) {
      console.warn('Habits fetch failed:', error.message);
      return { ok: false, habits: [], error: error.message };
    }

    const habits = (data as Record<string, unknown>[] | null || [])
      .map(rowToHabit)
      .filter((habit): habit is Habit => habit !== null && !habit.archived && !isSeedHabitId(habit.id));

    return { ok: true, habits };
  } catch (err) {
    console.warn('Habits fetch offline:', err);
    return { ok: false, habits: [], error: 'Offline or network error' };
  }
}

export async function fetchActiveHabits(userId?: string | null): Promise<Habit[]> {
  const result = await fetchHabitsFromTable(userId);
  return result.ok ? result.habits : [];
}

export async function persistHabitsToTable(userId: string, habits: Habit[]): Promise<boolean> {
  if (!canSync(userId) || !supabase) return false;
  const userHabits = habits.filter((habit) => !isSeedHabitId(habit.id));
  if (userHabits.length === 0) return true;
  try {
    const { error } = await supabase.from('habits').upsert(userHabits.map((habit) => habitToRow(habit, userId)));
    if (error) {
      console.warn('Habits upsert failed:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('Habits upsert offline:', err);
    return false;
  }
}

/** Remove leftover demo seed rows so they never rehydrate onto a new or existing account. */
export async function purgeSeedHabitsFromTable(userId?: string | null): Promise<void> {
  if (!canSync(userId) || !supabase || !userId) return;
  const seedIds = Array.from(SEED_HABIT_IDS);
  try {
    const logs = await supabase.from('habit_logs').delete().eq('user_id', userId).in('habit_id', seedIds);
    if (logs.error) console.warn('Seed habit_logs purge failed:', logs.error.message);
    const habits = await supabase.from('habits').delete().eq('user_id', userId).in('id', seedIds);
    if (habits.error) console.warn('Seed habits purge failed:', habits.error.message);
    const onboardingLogs = await supabase
      .from('habit_logs')
      .delete()
      .eq('user_id', userId)
      .like('habit_id', 'habit-onboarding-%');
    if (onboardingLogs.error) console.warn('Onboarding habit_logs purge failed:', onboardingLogs.error.message);
    const onboardingHabits = await supabase
      .from('habits')
      .delete()
      .eq('user_id', userId)
      .like('id', 'habit-onboarding-%');
    if (onboardingHabits.error) console.warn('Onboarding habits purge failed:', onboardingHabits.error.message);
  } catch (err) {
    console.warn('Seed habit purge offline:', err);
  }
}

export async function countActiveHabitsRemote(userId?: string | null): Promise<number | null> {
  if (!canSync(userId) || !supabase || !userId) return null;
  try {
    const { count, error } = await supabase
      .from('habits')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .or('archived.is.null,archived.eq.false');

    if (error) {
      console.warn('Active habit count failed:', error.message);
      return null;
    }
    return count ?? 0;
  } catch (err) {
    console.warn('Active habit count offline:', err);
    return null;
  }
}

export async function insertHabitToSupabase(
  userId: string | null | undefined,
  habit: Habit
): Promise<boolean> {
  if (isSeedHabitId(habit.id)) return false;
  if (!canSync(userId) || !supabase) return false;
  const remoteCount = await countActiveHabitsRemote(userId);
  if (remoteCount != null && remoteCount >= MAX_ACTIVE_HABITS && !habit.archived) {
    console.warn(`Maximum limit of ${MAX_ACTIVE_HABITS} active habits reached.`);
    return false;
  }
  try {
    const { error } = await supabase.from('habits').upsert(habitToRow(habit, userId as string));
    if (error) {
      console.warn('Habit insert failed:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('Habit insert offline:', err);
    return false;
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

export async function fetchHabitLogsForDate(
  userId?: string | null,
  loggedDate: string = toISODate()
): Promise<HabitCompletionEvent[]> {
  if (!canSync(userId) || !supabase) return [];
  try {
    let { data, error } = await supabase
      .from('habit_logs')
      .select('*')
      .eq('user_id', userId as string)
      .eq('logged_date', loggedDate);

    if (error) {
      const fallback = await supabase
        .from('habit_logs')
        .select('*')
        .eq('user_id', userId as string)
        .eq('date', loggedDate);
      data = fallback.data;
      error = fallback.error;
    }

    if (error) {
      console.warn('habit_logs date fetch failed:', error.message);
      return [];
    }

    return (data as HabitLogRow[] | null || [])
      .map((row) => mapHabitLogRowToEvent(row))
      .filter((event): event is HabitCompletionEvent => event !== null && !isSeedHabitId(event.habitId));
  } catch (err) {
    console.warn('habit_logs date fetch offline:', err);
    return [];
  }
}

export async function fetchTodayHabitLogs(
  userId?: string | null,
  dayIndex: number = getTodayDayIndex(),
  origin: Date = new Date()
): Promise<HabitCompletionEvent[]> {
  return fetchHabitLogsForDate(userId, isoDateForDayIndex(dayIndex, origin));
}

export async function persistHabitLogFrictionReason(
  userId: string | null | undefined,
  habitId: string,
  loggedDate: string,
  reason: string
): Promise<void> {
  if (!canSync(userId) || !supabase || !userId) return;
  const trimmed = reason.trim();
  if (!trimmed) return;
  try {
    const updated = await supabase
      .from('habit_logs')
      .update({ friction_reason: trimmed })
      .eq('user_id', userId)
      .eq('habit_id', habitId)
      .eq('logged_date', loggedDate)
      .select('id');

    if (!updated.error && Array.isArray(updated.data) && updated.data.length > 0) return;

    const fallbackDate = await supabase
      .from('habit_logs')
      .update({ friction_reason: trimmed })
      .eq('user_id', userId)
      .eq('habit_id', habitId)
      .eq('date', loggedDate)
      .select('id');
    if (!fallbackDate.error && Array.isArray(fallbackDate.data) && fallbackDate.data.length > 0) return;

    const { error } = await supabase.from('habit_logs').upsert(
      {
        user_id: userId,
        habit_id: habitId,
        logged_date: loggedDate,
        date: loggedDate,
        type: 'missed',
        completion: 0,
        value: 0,
        friction_reason: trimmed,
        timestamp: Date.now(),
      },
      { onConflict: 'habit_id,logged_date' }
    );
    if (error) console.warn('habit_logs friction_reason upsert failed:', error.message);
  } catch (err) {
    console.warn('habit_logs friction_reason persist offline:', err);
  }
}

export async function fetchFrictionReasonsFromTable(
  userId?: string | null
): Promise<Array<{ habitId: string; loggedDate: string; reason: string }>> {
  if (!canSync(userId) || !supabase || !userId) return [];
  try {
    const { data, error } = await supabase
      .from('habit_logs')
      .select('habit_id, logged_date, date, friction_reason')
      .eq('user_id', userId)
      .not('friction_reason', 'is', null);

    if (error) {
      console.warn('habit_logs friction fetch failed:', error.message);
      return [];
    }

    return (data || [])
      .map((row) => {
        const habitId = String(row.habit_id || '');
        const loggedDate = String(row.logged_date || row.date || '').slice(0, 10);
        const reason = String(row.friction_reason || '').trim();
        if (!habitId || !loggedDate || !reason) return null;
        return { habitId, loggedDate, reason };
      })
      .filter((row): row is { habitId: string; loggedDate: string; reason: string } => row !== null);
  } catch (err) {
    console.warn('habit_logs friction fetch offline:', err);
    return [];
  }
}

export interface HabitLogExportRow {
  id: string;
  habitId: string;
  loggedDate: string;
  eventType: string;
  frictionReason: string;
  note: string;
  timestamp: string;
}

export async function fetchHabitLogsForExport(userId?: string | null): Promise<HabitLogExportRow[]> {
  if (!canSync(userId) || !supabase || !userId) return [];
  try {
    const { data, error } = await supabase.from('habit_logs').select('*').eq('user_id', userId);
    if (error) {
      console.warn('habit_logs export fetch failed:', error.message);
      return [];
    }
    return (data || [])
      .map((row) => {
        const habitId = String(row.habit_id || row.habitId || '');
        const loggedDate = String(row.logged_date || row.date || '').slice(0, 10);
        if (!habitId || !loggedDate) return null;
        const timestampRaw = row.timestamp ?? row.created_at ?? row.completed_at;
        let timestamp = '';
        if (typeof timestampRaw === 'number') timestamp = new Date(timestampRaw).toISOString();
        else if (typeof timestampRaw === 'string' && timestampRaw) timestamp = timestampRaw;
        return {
          id: String(row.id || `${habitId}-${loggedDate}`),
          habitId,
          loggedDate,
          eventType: String(row.type || row.completion_type || row.event_type || ''),
          frictionReason: String(row.friction_reason || '').trim(),
          note: String(row.note || '').trim(),
          timestamp,
        } satisfies HabitLogExportRow;
      })
      .filter((row): row is HabitLogExportRow => row !== null);
  } catch (err) {
    console.warn('habit_logs export fetch offline:', err);
    return [];
  }
}
