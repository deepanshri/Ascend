import { Habit, HabitCompletionEvent, CompletionType, MomentumEvent, MomentumEventType } from '../types';
import { isSeedHabitId } from '../data/initialHabits';
import { isSupabaseConfigured, supabase, fetchSequentialMomentumEvents } from '../lib/supabase';
import {
  dayIndexForIso,
  endOfIsoDate,
  getTodayDayIndex,
  getWeekDates,
  parseToIsoDate,
  resolveEventIsoDate,
  toISODate,
} from './dates';
import { syncHabitLogDelete, syncHabitLogUpsert } from '../lib/offlineSync';

export const WORK_HABIT_WEIGHT = 1.5;
export const SELF_IMPROVEMENT_HABIT_WEIGHT = 1.0;
export const FULL_COMPLETION_VALUE = 1.0;
export const FALLBACK_COMPLETION_VALUE = 0.5;
export const MISSED_COMPLETION_VALUE = 0.0;
/** EMA blending factor for the rolling momentum update. */
export const MOMENTUM_DECAY_FACTOR = 0.12;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: string | undefined | null): value is string {
  return Boolean(value && UUID_RE.test(value));
}

export function newMomentumEventId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `00000000-0000-4000-8000-${Date.now().toString(16).padStart(12, '0').slice(-12)}`;
}

export function clampMomentum(value: number): number {
  return Math.min(100, Math.max(0, value));
}

/** event_type → score used in the rolling update (full=1, fallback=0.5, missed=0). */
export function eventScore(eventType: MomentumEventType): number {
  if (eventType === 'full') return FULL_COMPLETION_VALUE;
  if (eventType === 'fallback') return FALLBACK_COMPLETION_VALUE;
  return MISSED_COMPLETION_VALUE;
}

export function resolveMomentumEventDate(event: MomentumEvent): string {
  if (event.loggedDate && parseToIsoDate(event.loggedDate)) {
    return parseToIsoDate(event.loggedDate) as string;
  }
  return toISODate(new Date(event.timestamp));
}

/**
 * Rolling step:
 * prevScore = clamp((prevScore * (1 - decayFactor)) + (eventScore * eventWeight), 0, 100)
 *
 * eventScore is 1 | 0.5 | 0 and eventWeight is 1.5 (W) | 1.0 (SI).
 * The (eventScore * eventWeight) term is mapped onto 0–100 and blended by
 * decayFactor so each log row is an EMA update the circle / mascot can show.
 */
export function applyRollingMomentumStep(
  prevScore: number,
  eventScore: number,
  eventWeight: number,
  decayFactor: number = MOMENTUM_DECAY_FACTOR
): number {
  const increment = eventScore * eventWeight;
  const observation = (increment / WORK_HABIT_WEIGHT) * 100;
  const nextScore = prevScore * (1 - decayFactor) + observation * decayFactor;
  return clampMomentum(nextScore);
}

export function applyMomentumDecayStep(
  prev: number,
  score: number,
  weight: number,
  decayFactor: number = MOMENTUM_DECAY_FACTOR
): number {
  return applyRollingMomentumStep(prev, score, weight, decayFactor);
}

export function applyMomentumEvent(
  prev: number,
  event: Pick<MomentumEvent, 'eventType' | 'weight'>,
  decayFactor: number = MOMENTUM_DECAY_FACTOR
): number {
  return applyRollingMomentumStep(prev, eventScore(event.eventType), event.weight, decayFactor);
}

/** Maps sequential `public.momentum_events` rows into the in-app log. */
export async function fetchSequentialMomentumEventsLog(
  userId?: string | null
): Promise<MomentumEvent[]> {
  const records = await fetchSequentialMomentumEvents(userId);
  return records
    .map((row) => {
      const parsed = Date.parse(row.timestamp);
      return {
        id: row.id,
        habitId: row.habitId,
        eventType: row.eventType,
        weight: row.weight,
        timestamp: Number.isNaN(parsed) ? Date.now() : parsed,
        loggedDate: parseToIsoDate(row.timestamp) || undefined,
      } satisfies MomentumEvent;
    })
    .sort((a, b) => a.timestamp - b.timestamp);
}

export function createMomentumEvent(
  habit: Pick<Habit, 'id' | 'category'>,
  eventType: MomentumEventType,
  loggedDate: string = toISODate(),
  timestamp: number = Date.now()
): MomentumEvent {
  return {
    id: newMomentumEventId(),
    habitId: habit.id,
    eventType,
    weight: habitWeight({ category: habit.category } as Habit),
    timestamp,
    loggedDate,
  };
}

export function momentumEventsFromCompletionLog(
  events: HabitCompletionEvent[],
  habits: Habit[],
  origin: Date = new Date()
): MomentumEvent[] {
  const byId = new Map(habits.map((habit) => [habit.id, habit]));
  return events
    .filter((event) => event.type === 'full' || event.type === 'fallback_micro')
    .map((event) => {
      const habit = byId.get(event.habitId);
      return {
        id: isUuid(event.id) ? event.id : newMomentumEventId(),
        habitId: event.habitId,
        eventType: event.type === 'fallback_micro' ? 'fallback' : 'full',
        weight: habit ? habitWeight(habit) : SELF_IMPROVEMENT_HABIT_WEIGHT,
        timestamp: event.timestamp,
        loggedDate: resolveEventIsoDate(event, origin),
      } satisfies MomentumEvent;
    })
    .sort((a, b) => a.timestamp - b.timestamp);
}

/** Union by id. Existing rows are never dropped or overwritten. */
export function mergeMomentumEvents(local: MomentumEvent[], incoming: MomentumEvent[]): MomentumEvent[] {
  const byId = new Map<string, MomentumEvent>();
  local.forEach((event) => byId.set(event.id, event));
  incoming.forEach((event) => {
    if (!byId.has(event.id)) byId.set(event.id, event);
  });
  return Array.from(byId.values()).sort((a, b) => a.timestamp - b.timestamp);
}

/** Identity Ledger total = COUNT(*) where event_type IN ('full', 'fallback'). */
export function countIdentityVotes(events: MomentumEvent[]): number {
  let count = 0;
  for (const event of events) {
    if (event.eventType === 'full' || event.eventType === 'fallback') count += 1;
  }
  return count;
}

export function collectMissedMomentumEvents(
  habits: Habit[],
  events: MomentumEvent[],
  isoDate: string,
  origin: Date = new Date()
): MomentumEvent[] {
  const dayIndex = dayIndexForIso(isoDate, origin);
  const logged = new Set(
    events
      .filter((event) => resolveMomentumEventDate(event) === isoDate)
      .map((event) => event.habitId)
  );

  const missed: MomentumEvent[] = [];
  habits.forEach((habit) => {
    if (habit.archived) return;
    if (habit.scheduledDays && habit.scheduledDays.length > 0 && dayIndex >= 0) {
      if (!habit.scheduledDays.includes(dayIndex)) return;
    }
    if (logged.has(habit.id)) return;
    missed.push(createMomentumEvent(habit, 'missed', isoDate, endOfIsoDate(isoDate)));
  });
  return missed;
}

export interface HabitLogRow {
  id?: string;
  user_id?: string;
  habit_id?: string;
  habitId?: string;
  day_index?: number;
  dayIndex?: number;
  date?: string;
  logged_on?: string;
  logged_date?: string;
  completed_at?: string;
  type?: string;
  completion_type?: string;
  note?: string;
  friction_reason?: string;
  completion?: number;
  value?: number;
  timestamp?: number | string;
  created_at?: string;
}

/** Category priority weights: Work (W) = 1.5, Self Improvement (SI) = 1.0. */
export function habitWeight(habit: Habit): number {
  return habit.category === 'work' ? WORK_HABIT_WEIGHT : SELF_IMPROVEMENT_HABIT_WEIGHT;
}

/** Full swipe = 1.0, fallback swipe = 0.5, unlogged/missed = 0.0. */
export function completionValueForHabit(habit: Habit, dayIndex: number): number {
  if (!habit.days?.[dayIndex]) return MISSED_COMPLETION_VALUE;
  if (habit.microDays?.[dayIndex]) return FALLBACK_COMPLETION_VALUE;
  return FULL_COMPLETION_VALUE;
}

function resolveDayIndex(row: HabitLogRow, origin: Date = new Date()): number {
  const iso = parseToIsoDate(row.logged_date || row.date || row.logged_on || row.completed_at);
  if (iso) {
    const mapped = dayIndexForIso(iso, origin);
    if (mapped >= 0) return mapped;
  }

  const explicit = row.day_index ?? row.dayIndex;
  if (explicit !== undefined && explicit !== null && Number.isFinite(Number(explicit))) {
    return Number(explicit);
  }

  return getTodayDayIndex();
}

function resolveCompletionType(row: HabitLogRow): CompletionType | null {
  const raw = String(row.type || row.completion_type || '').toLowerCase();
  if (raw.includes('miss')) return null;
  const numeric = Number(row.completion ?? row.value);
  if (Number.isFinite(numeric) && numeric === 0 && !raw) return null;
  if (Number.isFinite(numeric) && numeric > 0 && numeric < 1) {
    return 'fallback_micro';
  }

  if (raw.includes('micro') || raw.includes('fallback') || raw === '0.5' || raw === 'partial') {
    return 'fallback_micro';
  }
  if (!raw && Number.isFinite(numeric) && numeric <= 0) return null;
  return 'full';
}

export function mapHabitLogRowToEvent(row: HabitLogRow, origin: Date = new Date()): HabitCompletionEvent | null {
  const habitId = row.habit_id || row.habitId;
  if (!habitId) return null;

  const dayIndex = resolveDayIndex(row, origin);
  const completionType = resolveCompletionType(row);
  if (!completionType) return null;

  const isoDate =
    parseToIsoDate(row.logged_date || row.date || row.logged_on || row.completed_at) ||
    toISODate(getWeekDates(origin)[dayIndex] ?? origin);
  const timestampRaw = row.timestamp ?? row.created_at ?? row.completed_at;
  let timestamp = Date.now();
  if (typeof timestampRaw === 'number') {
    timestamp = timestampRaw;
  } else if (typeof timestampRaw === 'string') {
    const parsed = Date.parse(timestampRaw);
    if (!Number.isNaN(parsed)) timestamp = parsed;
  }

  return {
    id: String(row.id || `log-${habitId}-${isoDate}`),
    habitId: String(habitId),
    dayIndex,
    date: isoDate,
    type: completionType,
    note: row.note || undefined,
    frictionReason: row.friction_reason || undefined,
    timestamp,
  };
}

export function mergeCompletionEvents(
  local: HabitCompletionEvent[],
  remote: HabitCompletionEvent[],
  origin: Date = new Date()
): HabitCompletionEvent[] {
  const byKey = new Map<string, HabitCompletionEvent>();

  const put = (event: HabitCompletionEvent) => {
    const key = `${event.habitId}:${resolveEventIsoDate(event, origin)}`;
    const existing = byKey.get(key);
    if (!existing || event.timestamp >= existing.timestamp) {
      byKey.set(key, event);
    }
  };

  local.forEach(put);
  remote.forEach(put);
  return Array.from(byKey.values()).sort((a, b) => a.timestamp - b.timestamp);
}

/**
 * Reads the append-only `habit_logs` table and maps rows into completion events.
 * Guest / offline sessions return an empty list so local logs remain ground truth.
 */
export async function fetchHabitLogsFromTable(userId?: string | null): Promise<HabitCompletionEvent[]> {
  if (!isSupabaseConfigured || !supabase || !userId || userId.startsWith('guest_')) {
    return [];
  }

  try {
    const { data, error } = await supabase
      .from('habit_logs')
      .select('*')
      .eq('user_id', userId);

    if (error) {
      console.warn('habit_logs fetch failed:', error.message);
      return [];
    }

    if (!data) {
      return [];
    }

    return (data as HabitLogRow[])
      .map((row) => mapHabitLogRowToEvent(row))
      .filter((event): event is HabitCompletionEvent => event !== null && !isSeedHabitId(event.habitId));
  } catch (err) {
    console.warn('habit_logs fetch offline:', err);
    return [];
  }
}

export async function upsertHabitLog(
  userId: string | null | undefined,
  event: HabitCompletionEvent
): Promise<void> {
  if (isSeedHabitId(event.habitId)) return;
  await syncHabitLogUpsert(userId, event);
}

export async function deleteHabitLog(
  userId: string | null | undefined,
  habitId: string,
  dayIndex: number = getTodayDayIndex()
): Promise<void> {
  await syncHabitLogDelete(userId, habitId, dayIndex);
}

/**
 * Replays the immutable append-only event log (local + habit_logs) to reconstruct
 * the habit's weekly projection (days, microDays) against the rolling 7-day window.
 * Events are placed by logged ISO date so midnight rollover cannot rewrite today.
 */
export function deriveHabitsFromEventLog(
  habits: Habit[],
  events: HabitCompletionEvent[],
  origin: Date = new Date()
): Habit[] {
  const weekIso = getWeekDates(origin).map((date) => toISODate(date));

  return habits.map((habit) => {
    const days = [false, false, false, false, false, false, false];
    const microDays = [false, false, false, false, false, false, false];

    const habitEvents = events
      .filter((e) => e.habitId === habit.id)
      .sort((a, b) => a.timestamp - b.timestamp);
    for (const ev of habitEvents) {
      const iso = resolveEventIsoDate(ev, origin);
      const dayIndex = weekIso.indexOf(iso);
      if (dayIndex < 0) continue;
      days[dayIndex] = true;
      microDays[dayIndex] = ev.type === 'fallback_micro';
    }

    return {
      ...habit,
      days,
      microDays,
    };
  });
}

/**
 * Same-day weighted snapshot (0–100) for the 7-day fan dots.
 * Work (W) = 1.5, Self Improvement (SI) = 1.0.
 * Full swipe = 1.0, fallback = 0.5, unlogged/missed = 0.0.
 */
export function calculateDailyWeightedScore(
  habits: Habit[],
  dayIndex: number = 3,
  examShield: boolean = false,
  logs?: HabitCompletionEvent[],
  origin: Date = new Date()
): number {
  const scoredHabits =
    logs && logs.length > 0 ? deriveHabitsFromEventLog(habits, logs, origin) : habits;
  const activeHabits = scoredHabits.filter((h) => !h.archived);
  if (activeHabits.length === 0) return 0;

  const scheduled = activeHabits.filter(
    (h) => !h.scheduledDays || h.scheduledDays.includes(dayIndex)
  );
  const pool = scheduled.length > 0 ? scheduled : activeHabits;

  let weightedSum = 0;
  let weightTotal = 0;

  pool.forEach((habit) => {
    const weight = habitWeight(habit);
    const value = completionValueForHabit(habit, dayIndex);
    if (examShield && value === MISSED_COMPLETION_VALUE) return;
    weightedSum += weight * value;
    weightTotal += weight;
  });

  if (weightTotal <= 0) return examShield ? 100 : 0;
  return clampMomentum(Math.round((weightedSum / weightTotal) * 100));
}

export interface RollingMomentumOptions {
  examShield?: boolean;
  vacationMode?: boolean;
  asOf?: number;
  decayFactor?: number;
}

/**
 * Rolling momentum from the append-only `momentum_events` log.
 * Iterates timestamp order: clamp((prev * (1 - decay_factor)) + (score * weight), 0, 100).
 * Exam Shield / Vacation set decay factor δ to 0 for missed events so
 * missing habits does not decay momentum while a protection window is on.
 */
export function calculateMomentumScore(
  events: MomentumEvent[],
  options: RollingMomentumOptions = {}
): number {
  const decayFactor = options.decayFactor ?? MOMENTUM_DECAY_FACTOR;
  const protectionActive = Boolean(options.examShield || options.vacationMode);
  const asOf = options.asOf;
  const sorted = [...events].sort((a, b) => a.timestamp - b.timestamp);

  let prevScore = 0;
  for (const event of sorted) {
    if (asOf !== undefined && event.timestamp > asOf) continue;
    const eventScoreValue = eventScore(event.eventType);
    const eventWeight = event.weight;
    const delta = protectionActive && event.eventType === 'missed' ? 0 : decayFactor;
    prevScore = applyRollingMomentumStep(prevScore, eventScoreValue, eventWeight, delta);
  }
  return Math.round(prevScore);
}

export async function calculateMomentumScoreFromTable(
  userId: string | null | undefined,
  options: RollingMomentumOptions = {}
): Promise<number> {
  const events = await fetchSequentialMomentumEventsLog(userId);
  return calculateMomentumScore(events, options);
}
