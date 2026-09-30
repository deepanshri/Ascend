  import { Habit, HabitCategory, HabitCompletionEvent } from '../types';
import { parseTimeOfDay, resolveHabitTimeOfDay } from '../utils/timeOfDay';
import { isSupabaseConfigured, supabase } from './supabaseClient';
import { habitCategoryBadge } from '../utils/categories';
import { getTodayDayIndex, isoDateForDayIndex, toISODate, getLocalDateString } from '../utils/dates';
import { HabitLogRow, isUuid, mapHabitLogRowToEvent } from '../utils/momentum';
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

export function normalizeHabitPriority(raw: unknown): Habit['priority'] {
  if (!raw) return undefined;
  const val = String(raw).toLowerCase().trim();
  if (val === 'high') return 'high';
  if (val === 'mid' || val === 'medium') return 'mid';
  if (val === 'low') return 'low';
  return undefined;
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
    archived: Boolean(row.archived ?? row.is_archived),
    tags: Array.isArray(row.tags) ? row.tags.map(String) : [toDbCategory(fromDbCategory(row.category))],
    priority: normalizeHabitPriority(row.priority),
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
    timeOfDay: parseTimeOfDay(row.time_of_day ?? row.timeOfDay, String(row.timestamp || '')),
    targetTime: row.target_time
      ? String(row.target_time).slice(0, 5)
      : row.targetTime
        ? String(row.targetTime).slice(0, 5)
        : undefined,
    updatedAt: row.updated_at ? Date.parse(String(row.updated_at)) || undefined : undefined,
  };
}

/** Session-local tombstones so a deleted habit cannot be resurrected by fetch/upsert. */
const DELETED_HABITS_STORAGE_KEY = 'ascend_deleted_habit_ids';
const deletedHabitIds = new Set<string>();

function hydrateDeletedHabitIds(): void {
  try {
    const raw = localStorage.getItem(DELETED_HABITS_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return;
    parsed.forEach((id) => {
      if (typeof id === 'string' && id) deletedHabitIds.add(id);
    });
  } catch {
    // private mode
  }
}

function persistDeletedHabitIds(): void {
  try {
    localStorage.setItem(DELETED_HABITS_STORAGE_KEY, JSON.stringify([...deletedHabitIds]));
  } catch {
    // private mode
  }
}

hydrateDeletedHabitIds();

export function rememberDeletedHabit(habitId: string): void {
  if (!habitId) return;
  deletedHabitIds.add(habitId);
  persistDeletedHabitIds();
}

export function isDeletedHabitId(habitId: string): boolean {
  return Boolean(habitId) && deletedHabitIds.has(habitId);
}

export function omitDeletedHabits<T extends { id: string }>(habits: T[]): T[] {
  if (deletedHabitIds.size === 0) return habits;
  return habits.filter((habit) => !deletedHabitIds.has(habit.id));
}

export function omitDeletedHabitRefs<T extends { habitId?: string }>(rows: T[]): T[] {
  if (deletedHabitIds.size === 0) return rows;
  return rows.filter((row) => !row.habitId || !deletedHabitIds.has(row.habitId));
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
    is_archived: Boolean(habit.archived),
    tags: habit.tags ?? [category],
    priority: habit.priority ?? null,
    schedule_type: habit.scheduleType ?? null,
    scheduled_days: habit.scheduledDays ?? null,
    interval_days: habit.intervalDays ?? null,
    weekly_target_count: habit.weeklyTargetCount ?? null,
    is_keystone: Boolean(habit.isKeystone),
    time_of_day: resolveHabitTimeOfDay(habit),
    target_time: habit.targetTime || null,
    updated_at: new Date(habit.updatedAt || Date.now()).toISOString(),
  };
}

function stripTimeOfDayColumn<T extends { time_of_day?: unknown; target_time?: unknown }>(row: T): Omit<T, 'time_of_day' | 'target_time'> {
  const { time_of_day: _ignored, target_time: _ignoredTarget, ...rest } = row;
  return rest;
}

function isMissingTimeOfDayColumn(message: string): boolean {
  return /time_of_day|target_time/i.test(message);
}

async function withTimeout<T>(promise: PromiseLike<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve(promise),
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
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
    const { data, error } = await withTimeout(
      supabase.from('habits').select('*').eq('user_id', userId as string),
      12_000,
      'habits fetch'
    );

    if (error) {
      if (import.meta.env.DEV) console.warn('Habits fetch failed:', error.message);
      return { ok: false, habits: [], error: error.message };
    }

    const habits = omitDeletedHabits(
  (data as Record<string, unknown>[] | null || [])
    .map(rowToHabit)
    .filter(
      (habit): habit is Habit =>
        habit !== null &&
        !isSeedHabitId(habit.id)
    )
);

    return { ok: true, habits };
  } catch (err) {
    if (import.meta.env.DEV) console.warn('Habits fetch offline:', err);
    return { ok: false, habits: [], error: 'Offline or network error' };
  }
}

export async function fetchActiveHabits(
  userId?: string | null
): Promise<Habit[]> {
  const result = await fetchHabitsFromTable(userId);
  return result.ok
    ? result.habits.filter((habit) => !habit.archived)
    : [];
}

export async function persistHabitsToTable(userId: string, habits: Habit[]): Promise<boolean> {
  if (!canSync(userId) || !supabase) return false;
  const userHabits = omitDeletedHabits(habits.filter((habit) => !isSeedHabitId(habit.id)));
  if (userHabits.length === 0) return true;
  const rows = userHabits.map((habit) => habitToRow(habit, userId));
  try {
    let { error } = await supabase.from('habits').upsert(rows);
    if (error && isMissingTimeOfDayColumn(error.message)) {
      const retry = await supabase.from('habits').upsert(rows.map(stripTimeOfDayColumn));
      error = retry.error;
    }
    if (error) {
      if (import.meta.env.DEV) console.warn('Habits upsert failed:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    if (import.meta.env.DEV) console.warn('Habits upsert offline:', err);
    return false;
  }
}

/** Remove leftover demo seed rows so they never rehydrate onto a new or existing account. */
export async function purgeSeedHabitsFromTable(userId?: string | null): Promise<void> {
  if (!canSync(userId) || !supabase || !userId) return;
  const seedIds = Array.from(SEED_HABIT_IDS);
  const uuidSeedIds = seedIds.filter(isUuid);
  try {
    const logs = await supabase.from('habit_logs').delete().eq('user_id', userId).in('habit_id', seedIds);
    if (logs.error && import.meta.env.DEV) console.warn('Seed habit_logs purge failed:', logs.error.message);
    if (uuidSeedIds.length > 0) {
      const habits = await supabase.from('habits').delete().eq('user_id', userId).in('id', uuidSeedIds);
      if (habits.error && import.meta.env.DEV) console.warn('Seed habits purge failed:', habits.error.message);
    }
    const onboardingLogs = await supabase
      .from('habit_logs')
      .delete()
      .eq('user_id', userId)
      .like('habit_id', 'habit-onboarding-%');
    if (onboardingLogs.error && import.meta.env.DEV) console.warn('Onboarding habit_logs purge failed:', onboardingLogs.error.message);
  } catch (err) {
    if (import.meta.env.DEV) console.warn('Seed habit purge offline:', err);
  }
}

export async function countActiveHabitsRemote(userId?: string | null): Promise<number | null> {
  if (!canSync(userId) || !supabase || !userId) return null;
  try {
    let { count, error } = await supabase
      .from('habits')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .or('archived.is.null,archived.eq.false');

    if (error && /archived/i.test(error.message)) {
      const retry = await supabase
        .from('habits')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .or('is_archived.is.null,is_archived.eq.false');
      count = retry.count;
      error = retry.error;
    }

    if (error) {
      if (import.meta.env.DEV) console.warn('Active habit count failed:', error.message);
      return null;
    }
    return count ?? 0;
  } catch (err) {
    if (import.meta.env.DEV) console.warn('Active habit count offline:', err);
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
    if (import.meta.env.DEV) console.warn(`Maximum limit of ${MAX_ACTIVE_HABITS} active habits reached.`);
    return false;
  }
  try {
    const row = habitToRow(habit, userId as string);
    let { error } = await supabase.from('habits').upsert(row);
    if (error && isMissingTimeOfDayColumn(error.message)) {
      const retry = await supabase.from('habits').upsert(stripTimeOfDayColumn(row));
      error = retry.error;
    }
    if (error) {
      if (import.meta.env.DEV) console.warn('Habit insert failed:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    if (import.meta.env.DEV) console.warn('Habit insert offline:', err);
    return false;
  }
}

/**
 * Delete a single habit invoking the delete_habit_cascade RPC to bypass the
 * momentum_events append-only trigger lock, with a direct table fallback.
 */
export async function deleteHabit(
  habitIdOrUserId: string | null | undefined,
  maybeHabitId?: string
): Promise<boolean> {
  const habitId = maybeHabitId || (typeof habitIdOrUserId === 'string' ? habitIdOrUserId : '');
  if (!habitId) return false;

  rememberDeletedHabit(habitId);

  try {
    // Primary: Call backend cascade RPC
    const { error: rpcErr } = await supabase.rpc('delete_habit_cascade', {
      p_habit_id: habitId,
    });

    if (!rpcErr) return true;

    if (import.meta.env.DEV) console.warn('delete_habit_cascade RPC failed, attempting direct table delete:', rpcErr);

    // Fallback: Direct table deletion
    const { error } = await supabase
      .from('habits')
      .delete()
      .eq('id', habitId);

    if (error) {
      if (import.meta.env.DEV) console.error('Direct habit deletion failed:', error);
      return false;
    }
    return true;
  } catch (err) {
    if (import.meta.env.DEV) console.error('Error during habit deletion:', err);
    return false;
  }
}

export async function deleteHabitCascade(
  _userId: string | null | undefined,
  habitId: string
): Promise<boolean> {
  return deleteHabit(habitId);
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
      if (import.meta.env.DEV) console.warn('habit_logs date fetch failed:', error.message);
      return [];
    }

    return (data as HabitLogRow[] | null || [])
      .map((row) => mapHabitLogRowToEvent(row))
      .filter((event): event is HabitCompletionEvent => event !== null && !isSeedHabitId(event.habitId));
  } catch (err) {
    if (import.meta.env.DEV) console.warn('habit_logs date fetch offline:', err);
    return [];
  }
}

/** Inclusive habit_logs fetch for Bowl / Reports cycle window (startIso → endIso).
 * Matches both `logged_date` and legacy `date` columns, then client-filters to the
 * window. Read-only — never writes or resets cycle epoch.
 */
export async function fetchHabitLogsForDateRange(
  userId: string | null | undefined,
  startIso: string,
  endIso: string
): Promise<HabitCompletionEvent[]> {
  if (!canSync(userId) || !supabase) return [];
  if (!startIso || !endIso || startIso > endIso) return [];
  try {
    const uid = userId as string;
    const byLogged = await supabase
      .from('habit_logs')
      .select('*')
      .eq('user_id', uid)
      .gte('logged_date', startIso)
      .lte('logged_date', endIso);

    // Legacy / partially-migrated rows may only have `date` populated.
    // Run this even when logged_date query "succeeds" with a partial set.
    const byDate = await supabase
      .from('habit_logs')
      .select('*')
      .eq('user_id', uid)
      .gte('date', startIso)
      .lte('date', endIso);

    if (byLogged.error && byDate.error) {
      if (import.meta.env.DEV) {
        console.warn(
          'habit_logs range fetch failed:',
          byLogged.error.message || byDate.error.message
        );
      }
      return [];
    }

    const rowsById = new Map<string, HabitLogRow>();
    const ingest = (rows: HabitLogRow[] | null | undefined) => {
      for (const row of rows || []) {
        const key = String(row.id || `${row.habit_id || row.habitId}-${row.logged_date || row.date || ''}`);
        if (!rowsById.has(key)) rowsById.set(key, row);
      }
    };
    if (!byLogged.error) ingest(byLogged.data as HabitLogRow[] | null);
    if (!byDate.error) ingest(byDate.data as HabitLogRow[] | null);

    return Array.from(rowsById.values())
      .map((row) => mapHabitLogRowToEvent(row))
      .filter((event): event is HabitCompletionEvent => {
        if (!event || isSeedHabitId(event.habitId)) return false;
        const iso = event.date || '';
        return Boolean(iso && iso >= startIso && iso <= endIso);
      });
  } catch (err) {
    if (import.meta.env.DEV) console.warn('habit_logs range fetch offline:', err);
    return [];
  }
}

export async function fetchTodayHabitLogs(
  userId?: string | null,
  dayIndex: number = getTodayDayIndex(),
  origin: Date = new Date()
): Promise<HabitCompletionEvent[]> {
  const dateStr = dayIndex === getTodayDayIndex() ? getLocalDateString(origin) : isoDateForDayIndex(dayIndex, origin);
  return fetchHabitLogsForDate(userId, dateStr);
}

export async function fetchHabitLogsForToday(userId?: string | null): Promise<HabitCompletionEvent[]> {
  return fetchHabitLogsForDate(userId, getLocalDateString());
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
    if (error && import.meta.env.DEV) console.warn('habit_logs friction_reason upsert failed:', error.message);
  } catch (err) {
    if (import.meta.env.DEV) console.warn('habit_logs friction_reason persist offline:', err);
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
      if (import.meta.env.DEV) console.warn('habit_logs friction fetch failed:', error.message);
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
    if (import.meta.env.DEV) console.warn('habit_logs friction fetch offline:', err);
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
      if (import.meta.env.DEV) console.warn('habit_logs export fetch failed:', error.message);
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
    if (import.meta.env.DEV) console.warn('habit_logs export fetch offline:', err);
    return [];
  }
}
