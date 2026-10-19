/**
 * Pure momentum math, event builders and merges. No storage, network or
 * native imports: safe for reducers and unit tests. utils/momentum.ts
 * re-exports all of it next to the Supabase-backed habit_logs helpers.
 */
import { Habit, HabitCompletionEvent, CompletionType, MomentumEvent, MomentumEventType, ProtectionWindow } from '../types';
import {
  addDaysIso,
  dayIndexForIso,
  diffDaysIso,
  getTodayDayIndex,
  getWeekDates,
  parseToIsoDate,
  resolveEventIsoDate,
  toISODate,
} from './dates';
import { isHabitScheduledOnIso } from './schedule';
import { resolveHabitTimeOfDay } from './timeOfDay';
import { resolveMomentumEventDate } from './momentumDates';
import { stableMomentumEventId } from './stableId';
import { momentumOccurrence, occurrenceMomentumEventId } from './momentumIds';

export const WORK_HABIT_WEIGHT = 1.5;
export const SELF_IMPROVEMENT_HABIT_WEIGHT = 1.5;
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

export { resolveMomentumEventDate };

/**
 * Exponential moving average step (δ defaults to MOMENTUM_DECAY_FACTOR = 0.12).
 *
 * observation = (eventScore * eventWeight / 1.5) * 100
 * nextScore   = clamp(prevScore * (1 - δ) + observation * δ, 0, 100)
 *
 * eventScore is 1 (full) | 0.5 (fallback) | 0 (missed).
 * Dynamic Priority Weight Multipliers: High = 1.5x, Medium = 1.0x, Low = 0.7x.
 */
export function applyRollingMomentumStep(
  prevScore: number,
  eventScore: number,
  eventWeight: number,
  decayFactor: number = MOMENTUM_DECAY_FACTOR
): number {
  if (eventScore <= 0) {
    const nextScore = prevScore * (1 - decayFactor);
    return clampMomentum(nextScore);
  }
  const increment = eventScore * eventWeight;
  const observation = (increment / WORK_HABIT_WEIGHT) * 100;
  const blended = prevScore * (1 - decayFactor) + observation * decayFactor;
  // Positive completion must NEVER decrease momentum score
  const nextScore = Math.max(prevScore + 0.5, blended);
  return clampMomentum(nextScore);
}

export function createMomentumEvent(
  habit: Pick<Habit, 'id'> & Partial<Pick<Habit, 'category' | 'priority' | 'timeOfDay' | 'timestamp'>>,
  eventType: MomentumEventType,
  loggedDate: string = toISODate(),
  timestamp: number = Date.now(),
  weight?: number
): MomentumEvent {
  const habitId = habit.id;
  return {
    id: stableMomentumEventId(habitId, loggedDate, eventType),
    habitId,
    eventType,
    weight: weight !== undefined ? weight : habitWeight(habit as Habit),
    timestamp,
    loggedDate,
    timeOfDay: resolveHabitTimeOfDay({
      timeOfDay: habit.timeOfDay,
      timestamp: habit.timestamp || '',
    }),
  };
}

/**
 * Id for a new event of this habit, day and type. The first is the stable id;
 * after an undo the next one gets the next occurrence id, so the server's
 * insert-if-absent keeps it instead of skipping it as a duplicate.
 */
export function nextMomentumEventId(
  log: MomentumEvent[],
  habitId: string,
  loggedDate: string,
  eventType: MomentumEvent['eventType']
): string {
  let last = -1;
  for (const event of log) {
    if (event.habitId !== habitId || event.eventType !== eventType) continue;
    if (resolveMomentumEventDate(event) !== loggedDate) continue;
    last = Math.max(last, momentumOccurrence(event.id));
  }
  return last < 0
    ? stableMomentumEventId(habitId, loggedDate, eventType)
    : occurrenceMomentumEventId(habitId, loggedDate, eventType, last + 1);
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
      const iso = resolveEventIsoDate(event, origin);
      const eventType = event.type === 'fallback_micro' ? 'fallback' : 'full';
      const baseWeight = habit ? habitWeight(habit) : SELF_IMPROVEMENT_HABIT_WEIGHT;
      const weight = eventType === 'fallback' ? baseWeight * 0.5 : baseWeight;
      return {
        id: stableMomentumEventId(event.habitId, iso, eventType),
        habitId: event.habitId,
        eventType,
        weight,
        timestamp: event.timestamp,
        loggedDate: iso,
        timeOfDay: event.timeOfDay ?? (habit ? resolveHabitTimeOfDay(habit) : undefined),
      } satisfies MomentumEvent;
    })
    .sort((a, b) => a.timestamp - b.timestamp);
}

/**
 * Merge momentum events by (habitId, loggedDate, eventType, occurrence) / id.
 * If an event with the same key exists, replace it. Repeats after an undo
 * carry an occurrence id (see nextMomentumEventId) and stay separate.
 */
export function mergeMomentumEvents(local: MomentumEvent[], incoming: MomentumEvent[]): MomentumEvent[] {
  const byKey = new Map<string, MomentumEvent>();

  const put = (event: MomentumEvent) => {
    const iso = resolveMomentumEventDate(event);
    const occurrence = momentumOccurrence(event.id);
    const key =
      iso && event.habitId
        ? `${event.habitId}::${iso}::${event.eventType}${occurrence > 0 ? `#${occurrence}` : ''}`
        : event.id;
    byKey.set(key, event);
  };

  local.forEach(put);
  incoming.forEach(put);
  return Array.from(byKey.values()).sort((a, b) => a.timestamp - b.timestamp);
}

/**
 * Identity Ledger totals COUNT distinct (habitId, calendar day) pairs among
 * full/fallback rows. Multiple toggles on the same day still count as one vote.
 * Unchecking today does not delete these rows (append-only).
 */
export function countIdentityVotes(
  events: MomentumEvent[],
  activeHabitIds?: Iterable<string>
): number {
  const allow = activeHabitIds ? new Set(activeHabitIds) : null;
  const keys = new Set<string>();
  const sorted = [...events].sort((a, b) => a.timestamp - b.timestamp);
  for (const event of sorted) {
    if (allow && !allow.has(event.habitId)) continue;
    const iso = resolveMomentumEventDate(event);
    if (!iso) continue;
    const key = `${event.habitId}::${iso}`;
    if (event.eventType === 'full' || event.eventType === 'fallback') {
      keys.add(key);
    } else if (event.eventType === 'reversal') {
      keys.delete(key);
    }
  }
  return keys.size;
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

/**
 * Dynamic Priority Weight Multipliers:
 * - HIGH priority (or default) = 1.5x (Highest Impact)
 * - MEDIUM / MID priority     = 1.0x (Standard Impact)
 * - LOW priority              = 0.7x (Low Friction)
 */
export function habitWeight(habit: Habit | Partial<Habit>): number {
  const priority = (habit?.priority || 'high').toLowerCase().trim();

  let weight: number;
  switch (priority) {
    case 'high':
      weight = 1.5;
      break;
    case 'mid':
    case 'medium':
      weight = 1.0;
      break;
    case 'low':
      weight = 0.7;
      break;
    default:
      weight = 1.5; // Default highest priority for all categories
      break;
  }

  if (habit?.isKeystone) {
    weight *= 1.25;
  }

  return weight;
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

  // Index once (O(E)) instead of filter+sort per habit (O(H·E)).
  const byHabitId = new Map<string, HabitCompletionEvent[]>();
  for (const event of events) {
    const list = byHabitId.get(event.habitId);
    if (list) list.push(event);
    else byHabitId.set(event.habitId, [event]);
  }
  for (const list of byHabitId.values()) {
    list.sort((a, b) => a.timestamp - b.timestamp);
  }

  return habits.map((habit) => {
    const days = [false, false, false, false, false, false, false];
    const microDays = [false, false, false, false, false, false, false];

    const habitEvents = byHabitId.get(habit.id);
    if (habitEvents) {
      for (const ev of habitEvents) {
        const iso = resolveEventIsoDate(ev, origin);
        const dayIndex = weekIso.indexOf(iso);
        if (dayIndex < 0) continue;
        days[dayIndex] = true;
        microDays[dayIndex] = ev.type === 'fallback_micro';
      }
    }

    // Preserve object identity when the weekly projection is unchanged so memoized
    // HabitCards for untouched habits skip re-render after a sibling swipe.
    if (
      habit.days?.length === 7 &&
      habit.microDays?.length === 7 &&
      days.every((done, i) => done === Boolean(habit.days![i])) &&
      microDays.every((done, i) => done === Boolean(habit.microDays![i]))
    ) {
      return habit;
    }

    return {
      ...habit,
      days,
      microDays,
    };
  });
}

export interface RollingMomentumOptions {
  examShield?: boolean;
  vacationMode?: boolean;
  asOf?: number;
  decayFactor?: number;
  habits?: Habit[];
  protectionWindows?: readonly ProtectionWindow[];
}

function isProtectedOnDate(isoDate: string, windows: readonly ProtectionWindow[] | undefined): boolean {
  return Boolean(windows?.some((window) => window.startsOn <= isoDate && isoDate <= window.endsOn));
}

/**
 * Event-sourced reversal cancellation:
 * Scans events chronologically and matches each 'reversal' event with its
 * corresponding prior 'full' or 'fallback' completion event for the same habit.
 * Matched completion-reversal pairs (and any unpaired reversal events) are
 * omitted from the active calculation stream, eliminating tail-division mathematical drift.
 */
export function filterReversedMomentumEvents(events: MomentumEvent[]): MomentumEvent[] {
  const sorted = [...events].sort((a, b) => a.timestamp - b.timestamp);
  const excludedIds = new Set<string>();

  const completionsByKey = new Map<string, MomentumEvent[]>();
  const completionsByHabit = new Map<string, MomentumEvent[]>();

  for (const event of sorted) {
    const isoDate = resolveMomentumEventDate(event);
    const key = `${event.habitId}::${isoDate}`;

    if (event.eventType === 'full' || event.eventType === 'fallback') {
      const list = completionsByKey.get(key) || [];
      list.push(event);
      completionsByKey.set(key, list);

      const habitList = completionsByHabit.get(event.habitId) || [];
      habitList.push(event);
      completionsByHabit.set(event.habitId, habitList);
    } else if (event.eventType === 'reversal') {
      excludedIds.add(event.id);

      const list = completionsByKey.get(key);
      if (list && list.length > 0) {
        const matched = list.pop();
        if (matched) {
          excludedIds.add(matched.id);
          const habitList = completionsByHabit.get(event.habitId);
          if (habitList) {
            const idx = habitList.lastIndexOf(matched);
            if (idx !== -1) habitList.splice(idx, 1);
          }
        }
      }
    }
  }

  return sorted.filter((e) => !excludedIds.has(e.id));
}

/**
 * Rolling momentum from the append-only `momentum_events` log.
 * - Filters out reversed completions before the replay fold (zero drift).
 * - Evaluates continuous rolling day decay across unlogged gap days.
 * - Aggregates daily missed habit penalties into a single observation step per day:
 *     Daily Observation = (∑ Completed Weights / ∑ Total Active Weights) * 100
 *     S_next = clamp(S_prev * (1 - δ) + Daily Observation * δ, 0, 100)
 * - Dates without missed events (e.g. today's live completion swiping) apply sequential rolling steps.
 * - Score is strictly clamped between 0 and 100 and rounded for display.
 */
export function calculateMomentumScore(
  events: MomentumEvent[],
  options: RollingMomentumOptions = {}
): number {
  const decayFactor = options.decayFactor ?? MOMENTUM_DECAY_FACTOR;
  const legacyProtectionActive = Boolean(options.examShield || options.vacationMode);
  const asOf = options.asOf;
  const habitById = options.habits ? new Map(options.habits.map((habit) => [habit.id, habit])) : null;
  const todayIso = toISODate();

  const unexpiredEvents = asOf !== undefined
    ? events.filter((e) => e.timestamp <= asOf)
    : events;

  const activeEvents = filterReversedMomentumEvents(unexpiredEvents);

  // Group events by calendar date to identify dates that contain missed habit events
  const eventsByDate = new Map<string, MomentumEvent[]>();
  const datesWithMissed = new Set<string>();

  for (const event of activeEvents) {
    const date = resolveMomentumEventDate(event);
    if (!eventsByDate.has(date)) {
      eventsByDate.set(date, []);
    }
    eventsByDate.get(date)!.push(event);
    // Never treat today as a missed day while the day is active
    if (event.eventType === 'missed' && date !== todayIso) {
      datesWithMissed.add(date);
    }
  }

  const sortedDates = Array.from(eventsByDate.keys()).sort();
  let prevScore = 0;

  for (let i = 0; i < sortedDates.length; i++) {
    const date = sortedDates[i];
    const isToday = date === todayIso;

    // Apply continuous exponential rolling day decay for unlogged calendar gaps between events
    if (i > 0) {
      const prevDate = sortedDates[i - 1];
      const gap = diffDaysIso(prevDate, date);
      if (gap > 1) {
        for (let g = 1; g < gap; g++) {
          const gapIso = addDaysIso(prevDate, g);
          const isProtected = legacyProtectionActive || isProtectedOnDate(gapIso, options.protectionWindows);
          if (!isProtected) {
            prevScore = clampMomentum(prevScore * (1 - decayFactor));
          }
        }
      }
    }

    const dateEvents = eventsByDate.get(date)!;

    if (datesWithMissed.has(date)) {
      // Deduplicate by habitId: take latest event for each habit on this date. A
      // miss is only inferred when no completion was known yet, so a completion
      // that arrives later (a widget tap drained the next morning, another
      // device) beats it whatever the order.
      const habitEvents = new Map<string, MomentumEvent>();
      for (const event of dateEvents) {
        const current = habitEvents.get(event.habitId);
        if (event.eventType === 'missed' && current && current.eventType !== 'missed') continue;
        habitEvents.set(event.habitId, event);
      }

      let completedWeightSum = 0;
      let activeWeightSum = 0;

      for (const [habitId, event] of habitEvents.entries()) {
        const habit = habitById?.get(habitId);
        const unscheduledMiss =
          event.eventType === 'missed' && habit ? !isHabitScheduledOnIso(habit, date) : false;

        if (event.eventType === 'full' || event.eventType === 'fallback') {
          const scoreVal = eventScore(event.eventType);
          completedWeightSum += scoreVal * event.weight;
          activeWeightSum += event.weight;
        } else if (event.eventType === 'missed') {
          const protectedOnThisDate = isProtectedOnDate(date, options.protectionWindows);
          if (!legacyProtectionActive && !protectedOnThisDate && !unscheduledMiss) {
            activeWeightSum += event.weight;
          }
        }
      }

      const dailyObservation = activeWeightSum > 0
        ? (completedWeightSum / activeWeightSum) * 100
        : 0;
      const stepDelta = isToday ? 0 : (activeWeightSum > 0 ? decayFactor : 0);

      if (stepDelta === 0) {
        prevScore = clampMomentum(prevScore + Math.max(0, dailyObservation * 0.05));
      } else {
        prevScore = clampMomentum(prevScore * (1 - stepDelta) + dailyObservation * stepDelta);
      }
    } else {
      // Individual completion steps for live / unmissed days sorted by timestamp
      const sortedDateEvents = [...dateEvents].sort((a, b) => a.timestamp - b.timestamp);
      for (const event of sortedDateEvents) {
        prevScore = applyRollingMomentumStep(prevScore, eventScore(event.eventType), event.weight, decayFactor);
      }
    }
  }

  // Continuous decay for unlogged trailing gap days up to the evaluated date (asOf or today)
  if (sortedDates.length > 0) {
    const lastDate = sortedDates[sortedDates.length - 1];
    const targetIso = asOf !== undefined ? toISODate(new Date(asOf)) : todayIso;
    const trailingGap = diffDaysIso(lastDate, targetIso);
    if (trailingGap > 0) {
      for (let g = 1; g < trailingGap; g++) {
        const gapIso = addDaysIso(lastDate, g);
        const isProtected = legacyProtectionActive || isProtectedOnDate(gapIso, options.protectionWindows);
        if (!isProtected) {
          prevScore = clampMomentum(prevScore * (1 - decayFactor));
        }
      }
    }
  }

  return Math.round(clampMomentum(prevScore));
}
