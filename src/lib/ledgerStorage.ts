/**
 * Pure parsers for the habit ledger's localStorage payloads.
 *
 * Each parser takes the raw stored string and returns `null` when it is
 * missing or unreadable, so callers keep their own fallback. Demo seed rows
 * are dropped and legacy shapes normalized here; filtering of deleted habit
 * ids and other impure steps live in ledgerStorageLoaders.ts.
 */
import type {
  FrictionAudit,
  Habit,
  HabitCompletionEvent,
  IdentityEvidence,
  StandaloneReminder,
} from '../types';
import { isSeedHabitId } from '../data/initialHabits';
import { habitCategoryBadge, normalizeHabitCategory } from '../utils/categories';
import { hydrateHabitTimeOfDay } from '../utils/timeOfDay';

export const HABITS_STORAGE_KEY = 'habit_tracker_habits';
export const COMPLETION_EVENTS_STORAGE_KEY = 'ascend_completion_events';
export const EVIDENCE_STORAGE_KEY = 'habit_tracker_evidence';
export const REMINDERS_STORAGE_KEY = 'habit_tracker_reminders';
export const ACTIVE_FALLBACKS_STORAGE_KEY = 'ascend_active_fallbacks';
export const ROLLED_OVER_HABITS_STORAGE_KEY = 'ascend_rolled_over_habits';
export const FRICTION_AUDITS_STORAGE_KEY = 'ascend_friction_audits';
export const INTERESTS_STORAGE_KEY = 'ascend_personal_interests';

const SEED_REMINDER_IDS = new Set(['rem-1', 'rem-2']);
const EMPTY_WEEK = [false, false, false, false, false, false, false];

function parseJson(raw: string | null): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function parseStoredHabits(raw: string | null): Habit[] | null {
  const parsed = parseJson(raw);
  if (!Array.isArray(parsed)) return null;
  return (parsed as Habit[])
    .filter((h) => h && typeof h === 'object' && !isSeedHabitId(h.id))
    .map((h) => {
      const category = normalizeHabitCategory(h.category);
      return hydrateHabitTimeOfDay({
        ...h,
        category,
        days: Array.isArray(h.days) ? h.days : [...EMPTY_WEEK],
        microDays: Array.isArray(h.microDays) ? h.microDays : [...EMPTY_WEEK],
        tags: [habitCategoryBadge(category)],
      });
    });
}

export function parseStoredCompletionEvents(raw: string | null): HabitCompletionEvent[] | null {
  const parsed = parseJson(raw);
  if (!Array.isArray(parsed)) return null;
  return (parsed as HabitCompletionEvent[]).filter(
    (event) => event && typeof event === 'object' && !isSeedHabitId(event.habitId)
  );
}

export function parseStoredEvidence(raw: string | null): IdentityEvidence[] | null {
  const parsed = parseJson(raw);
  if (!Array.isArray(parsed)) return null;
  return (parsed as IdentityEvidence[])
    .filter((item) => item && typeof item === 'object' && !isSeedHabitId(item.habitId))
    .map((item) => ({ ...item, category: normalizeHabitCategory(item.category) }));
}

/** Reminders without demo seed rows; notification ids are attached by the loader. */
export function parseStoredReminders(raw: string | null): StandaloneReminder[] | null {
  const parsed = parseJson(raw);
  if (!Array.isArray(parsed)) return null;
  return (parsed as StandaloneReminder[]).filter(
    (item) => item && typeof item === 'object' && !SEED_REMINDER_IDS.has(String(item.id))
  );
}

export function parseStoredFrictionAudits(raw: string | null): FrictionAudit[] | null {
  const parsed = parseJson(raw);
  if (!Array.isArray(parsed)) return null;
  return (parsed as FrictionAudit[]).filter((item) => item && typeof item === 'object');
}

export function parseStoredStringList(raw: string | null): string[] | null {
  const parsed = parseJson(raw);
  if (!Array.isArray(parsed)) return null;
  return parsed.filter((item): item is string => typeof item === 'string');
}

/** Rolled-over habit ids, valid only on the day they were recorded. */
export function parseStoredRolledOverHabits(raw: string | null, todayIso: string): string[] | null {
  const parsed = parseJson(raw) as { date?: unknown; habitIds?: unknown } | null;
  if (!parsed || typeof parsed !== 'object') return null;
  if (parsed.date !== todayIso || !Array.isArray(parsed.habitIds)) return null;
  return parsed.habitIds.filter((id): id is string => typeof id === 'string');
}

export function serializeRolledOverHabits(todayIso: string, habitIds: string[]): string {
  return JSON.stringify({ date: todayIso, habitIds });
}
