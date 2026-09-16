import { HabitCompletionEvent } from '../types';
import { addDaysIso, resolveEventIsoDate, toISODate } from '../utils/dates';
import type { TimeOfDay } from '../types/habit';

export const CYCLE_DAY_OPTIONS = [3, 5, 7, 10] as const;
export type CycleDays = (typeof CYCLE_DAY_OPTIONS)[number];

/** Absolute ceiling for an accumulation cycle. */
export const MAX_CYCLE_DAYS = 10;
export const DEFAULT_CYCLE_DAYS: CycleDays = 7;
export const OVERFLOW_FILL_RATIO = 0.8;
export const CYCLE_DAYS_STORAGE_KEY = 'ascend_accumulation_cycle_days';
/** Inclusive start day of the active Bowl cycle (local calendar). */
export const CYCLE_START_STORAGE_KEY = 'ascend_bowl_cycle_start_iso';
/** ms epoch — completions with timestamp < this are excluded from the active Bowl (not from Ledger). */
export const CYCLE_RESET_AT_STORAGE_KEY = 'ascend_bowl_cycle_reset_at';
/** Completed Bowl cycle summaries for Report → Cycle History (local only). */
export const CYCLE_HISTORY_STORAGE_KEY = 'ascend_bowl_cycle_history';
const CYCLE_HISTORY_MAX = 40;

export interface BowlFill {
  cycleDays: number;
  activeHabits: number;
  capacity: number;
  votes: number;
  fillPercent: number;
  isOverflowing: boolean;
}

export interface AccumulationPiece {
  id: string;
  habitId: string;
  isoDate: string;
  kind: 'full' | 'fallback';
}

export interface CompletedCycleSummary {
  id: string;
  cycleDays: number;
  startIso: string;
  endIso: string;
  votes: number;
  capacity: number;
  fillPercent: number;
  isOverflowing: boolean;
  morningVotes: number;
  nightVotes: number;
  completedAt: number;
}

export interface BowlCycleEpoch {
  startIso: string;
  resetAt: number;
}

export function isCycleDays(value: unknown): value is CycleDays {
  return CYCLE_DAY_OPTIONS.includes(value as CycleDays);
}

/** Snap to 3 / 5 / 7 / 10, never above 10 days. */
export function clampCycleDays(value: unknown): CycleDays {
  const n = Number(value);
  if (isCycleDays(n)) return n;
  if (!Number.isFinite(n)) return DEFAULT_CYCLE_DAYS;
  const capped = Math.min(MAX_CYCLE_DAYS, Math.max(CYCLE_DAY_OPTIONS[0], Math.round(n)));
  return CYCLE_DAY_OPTIONS.reduce((best, option) =>
    Math.abs(option - capped) < Math.abs(best - capped) ? option : best
  );
}

export function readStoredCycleDays(): CycleDays {
  try {
    return clampCycleDays(localStorage.getItem(CYCLE_DAYS_STORAGE_KEY));
  } catch {
    return DEFAULT_CYCLE_DAYS;
  }
}

export function persistCycleDays(days: CycleDays): void {
  try {
    localStorage.setItem(CYCLE_DAYS_STORAGE_KEY, String(clampCycleDays(days)));
  } catch {
    // private mode
  }
}

/**
 * Reads the active Bowl epoch. When no start is stored yet, returns an empty
 * startIso so `activeCycleWindow` can fall back to the full sliding cycle
 * (today − (D−1) → today) instead of collapsing to "today only".
 */
export function readBowlCycleEpoch(todayIso: string = toISODate()): BowlCycleEpoch {
  try {
    const startRaw = localStorage.getItem(CYCLE_START_STORAGE_KEY);
    const resetRaw = localStorage.getItem(CYCLE_RESET_AT_STORAGE_KEY);
    const hasStored = Boolean(startRaw && /^\d{4}-\d{2}-\d{2}$/.test(startRaw));
    const startIso = hasStored ? (startRaw as string) : '';
    const resetAt = resetRaw ? Number(resetRaw) : 0;
    return {
      startIso: startIso && startIso > todayIso ? todayIso : startIso,
      resetAt: Number.isFinite(resetAt) && resetAt > 0 ? resetAt : 0,
    };
  } catch {
    return { startIso: '', resetAt: 0 };
  }
}

export function persistBowlCycleEpoch(epoch: BowlCycleEpoch): void {
  try {
    localStorage.setItem(CYCLE_START_STORAGE_KEY, epoch.startIso);
    localStorage.setItem(CYCLE_RESET_AT_STORAGE_KEY, String(epoch.resetAt));
  } catch {
    // private mode
  }
}

export function readCycleHistory(): CompletedCycleSummary[] {
  try {
    const raw = localStorage.getItem(CYCLE_HISTORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as CompletedCycleSummary[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function persistCycleHistory(entries: CompletedCycleSummary[]): void {
  try {
    localStorage.setItem(CYCLE_HISTORY_STORAGE_KEY, JSON.stringify(entries.slice(0, CYCLE_HISTORY_MAX)));
  } catch {
    // private mode
  }
}

/**
 * Archive a finished Bowl cycle into local Cycle History only.
 * Does NOT write habit_logs, momentum_events, or Identity Ledger evidence.
 */
export function archiveCompletedCycle(
  summary: Omit<CompletedCycleSummary, 'id' | 'completedAt'>
): CompletedCycleSummary {
  const entry: CompletedCycleSummary = {
    ...summary,
    id: `cycle-${summary.endIso}-${Date.now()}`,
    completedAt: Date.now(),
  };
  const history = [entry, ...readCycleHistory()].slice(0, CYCLE_HISTORY_MAX);
  persistCycleHistory(history);
  return entry;
}

/** Open a fresh Bowl epoch. Local cycle keys only — never Ledger / momentum_events. */
export function resetBowlCycleEpoch(endIso: string, resetAt: number = Date.now()): BowlCycleEpoch {
  const epoch = { startIso: endIso, resetAt };
  persistBowlCycleEpoch(epoch);
  return epoch;
}

/**
 * Archive + reset in one step (tests / non-UI callers).
 * Writes ONLY cycle localStorage keys — never habit_logs, momentum_events, or Identity Ledger evidence.
 */
export function completeBowlCycle(summary: Omit<CompletedCycleSummary, 'id' | 'completedAt'>): CompletedCycleSummary {
  const entry = archiveCompletedCycle(summary);
  resetBowlCycleEpoch(summary.endIso, entry.completedAt);
  return entry;
}

/** Sliding fallback when no epoch is active (legacy). Prefer activeCycleWindow. */
export function cycleWindow(
  cycleDays: number,
  endIso: string = toISODate()
): { startIso: string; endIso: string } {
  const days = Math.min(MAX_CYCLE_DAYS, Math.max(1, Math.round(cycleDays)));
  return {
    startIso: addDaysIso(endIso, -(days - 1)),
    endIso,
  };
}

/**
 * Active Bowl window: always ends on today.
 * Start is the later of (epoch start, today − (D−1)) so:
 * - no epoch → full sliding cycle of D days (not today-only)
 * - mid-cycle epoch → grows from epoch start through today
 * - post-celebration epoch (start = today) → only today, then accumulates
 * Never freezes endIso in the past (that made the bowl drop today's pieces).
 */
export function activeCycleWindow(
  cycleDays: number,
  epochStartIso: string,
  todayIso: string = toISODate()
): { startIso: string; endIso: string } {
  const days = Math.min(MAX_CYCLE_DAYS, Math.max(1, Math.round(cycleDays)));
  const slidingStart = addDaysIso(todayIso, -(days - 1));
  const epochStart = epochStartIso && /^\d{4}-\d{2}-\d{2}$/.test(epochStartIso) ? epochStartIso : slidingStart;
  const startIso = epochStart > slidingStart ? epochStart : slidingStart;
  if (startIso > todayIso) return { startIso: todayIso, endIso: todayIso };
  return { startIso, endIso: todayIso };
}

/** Light theme = Morning bowl, Dark theme = Night bowl. */
export function themeBowlMode(isDark: boolean): TimeOfDay {
  return isDark ? 'night' : 'morning';
}

/** C = H_active × cycleDays */
export function computeBowlCapacity(activeHabitCount: number, cycleDays: number): number {
  const habits = Math.max(0, activeHabitCount);
  const days = Math.min(MAX_CYCLE_DAYS, Math.max(1, Math.round(cycleDays)));
  return habits * days;
}

/** P = (V / C) × 100. Overflow at ≥ 80%. */
export function computeBowlFill(votes: number, capacity: number): Pick<BowlFill, 'fillPercent' | 'isOverflowing'> {
  const c = Math.max(0, capacity);
  const v = Math.max(0, votes);
  const fillPercent = c === 0 ? 0 : (v / c) * 100;
  return {
    fillPercent,
    isOverflowing: fillPercent >= OVERFLOW_FILL_RATIO * 100,
  };
}

export function summarizeBowlFill(
  activeHabitCount: number,
  votes: number,
  cycleDays: number
): BowlFill {
  const days = clampCycleDays(cycleDays);
  const capacity = computeBowlCapacity(activeHabitCount, days);
  const fill = computeBowlFill(votes, capacity);
  return {
    cycleDays: days,
    activeHabits: Math.max(0, activeHabitCount),
    capacity,
    votes: Math.max(0, votes),
    ...fill,
  };
}

/**
 * One piece per (habit, calendar day) in the cycle window.
 * Multiple toggles the same day still yield a single piece; uncheck removes it.
 */
export function accumulationPiecesFromLogs(
  events: HabitCompletionEvent[],
  activeHabitIds: Iterable<string>,
  startIso: string,
  endIso: string,
  origin: Date = new Date(),
  minTimestamp = 0
): AccumulationPiece[] {
  const allow = new Set(activeHabitIds);
  const byKey = new Map<string, AccumulationPiece & { timestamp: number }>();

  for (const event of events) {
    if (!allow.has(event.habitId)) continue;
    if (minTimestamp > 0 && event.timestamp < minTimestamp) continue;
    const iso = resolveEventIsoDate(event, origin);
    if (!iso || iso < startIso || iso > endIso) continue;
    const id = `${event.habitId}::${iso}`;
    const prev = byKey.get(id);
    if (prev && event.timestamp < prev.timestamp) continue;
    byKey.set(id, {
      id,
      habitId: event.habitId,
      isoDate: iso,
      kind: event.type === 'fallback_micro' ? 'fallback' : 'full',
      timestamp: event.timestamp,
    });
  }

  return Array.from(byKey.values())
    .sort((a, b) => a.timestamp - b.timestamp || a.id.localeCompare(b.id))
    .map(({ timestamp: _timestamp, ...piece }) => piece);
}

export interface DualBowlFill {
  morning: BowlFill;
  night: BowlFill;
}

/** Independent capacities: C_morning = H_morning × D, C_night = H_night × D. */
export function summarizeDualBowlFill(
  morningHabitCount: number,
  morningVotes: number,
  nightHabitCount: number,
  nightVotes: number,
  cycleDays: number
): DualBowlFill {
  return {
    morning: summarizeBowlFill(morningHabitCount, morningVotes, cycleDays),
    night: summarizeBowlFill(nightHabitCount, nightVotes, cycleDays),
  };
}
