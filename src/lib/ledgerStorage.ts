/**
 * Pure parsers for the habit ledger's localStorage payloads.
 *
 * Each parser takes the raw stored string and returns the usable entries plus
 * every entry it could not use. `items` is `null` when the payload is missing
 * or unreadable, so callers keep their own fallback. Demo seed rows are
 * dropped on purpose; anything malformed is returned in `rejected` so the
 * loaders can move it to the dead-letter store instead of discarding it.
 */
import type {
  FrictionAudit,
  Habit,
  HabitCompletionEvent,
  IdentityEvidence,
  MomentumEvent,
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

export const DEFAULT_INTERESTS: readonly string[] = ['Movies', 'Books', 'Anime', 'Running'];

/** Why an entry was set aside: unparseable locally, or (server_rejected) refused by the database on upload. */
export type RejectReason = 'invalid_json' | 'not_a_list' | 'invalid_entry' | 'server_rejected';

/** Something a parser could not use: the raw string, the payload, or one entry. */
export interface RejectedEntry {
  reason: RejectReason;
  value: unknown;
}

export interface ParseResult<T> {
  items: T[] | null;
  rejected: RejectedEntry[];
}

const SEED_REMINDER_IDS = new Set(['rem-1', 'rem-2']);
const EMPTY_WEEK = [false, false, false, false, false, false, false];

/** Returned by an entry parser to drop an entry on purpose (demo seed data). */
const DROP = Symbol('drop');
/** Returned by an entry parser for an entry it cannot use. */
const REJECT = Symbol('reject');
type EntryResult<T> = T | typeof DROP | typeof REJECT;

type Payload = { value: unknown } | { result: ParseResult<never> };

function parsePayload(raw: string | null): Payload {
  if (!raw) return { result: { items: null, rejected: [] } };
  try {
    return { value: JSON.parse(raw) };
  } catch {
    return { result: { items: null, rejected: [{ reason: 'invalid_json', value: raw }] } };
  }
}

function parseEntries<T>(value: unknown, parseEntry: (entry: unknown) => EntryResult<T>): ParseResult<T> {
  if (!Array.isArray(value)) {
    return { items: null, rejected: [{ reason: 'not_a_list', value }] };
  }
  const items: T[] = [];
  const rejected: RejectedEntry[] = [];
  for (const entry of value) {
    let result: EntryResult<T>;
    try {
      result = parseEntry(entry);
    } catch {
      result = REJECT;
    }
    if (result === REJECT) rejected.push({ reason: 'invalid_entry', value: entry });
    else if (result !== DROP) items.push(result);
  }
  return { items, rejected };
}

function parseList<T>(raw: string | null, parseEntry: (entry: unknown) => EntryResult<T>): ParseResult<T> {
  const payload = parsePayload(raw);
  return 'result' in payload ? payload.result : parseEntries(payload.value, parseEntry);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasStringField<K extends string>(value: unknown, key: K): value is Record<K, string> {
  return isRecord(value) && typeof value[key] === 'string' && value[key] !== '';
}

function parseHabitEntry(entry: unknown): EntryResult<Habit> {
  if (!hasStringField(entry, 'id')) return REJECT;
  const habit = entry as unknown as Habit;
  if (isSeedHabitId(habit.id)) return DROP;
  const category = normalizeHabitCategory(habit.category);
  return hydrateHabitTimeOfDay({
    ...habit,
    category,
    days: Array.isArray(habit.days) ? habit.days : [...EMPTY_WEEK],
    microDays: Array.isArray(habit.microDays) ? habit.microDays : [...EMPTY_WEEK],
    tags: [habitCategoryBadge(category)],
  });
}

/** Completion and momentum rows share the same rule: a habitId, and not a seed habit. */
function parseHabitRowEntry<T extends { habitId: string }>(entry: unknown): EntryResult<T> {
  if (!hasStringField(entry, 'habitId')) return REJECT;
  const row = entry as unknown as T;
  return isSeedHabitId(row.habitId) ? DROP : row;
}

function parseEvidenceEntry(entry: unknown): EntryResult<IdentityEvidence> {
  if (!hasStringField(entry, 'habitId')) return REJECT;
  const item = entry as unknown as IdentityEvidence;
  if (isSeedHabitId(item.habitId)) return DROP;
  return { ...item, category: normalizeHabitCategory(item.category) };
}

export function parseStoredHabits(raw: string | null): ParseResult<Habit> {
  return parseList(raw, parseHabitEntry);
}

export function parseStoredCompletionEvents(raw: string | null): ParseResult<HabitCompletionEvent> {
  return parseList(raw, parseHabitRowEntry<HabitCompletionEvent>);
}

export function parseStoredMomentumEvents(raw: string | null): ParseResult<MomentumEvent> {
  return parseList(raw, parseHabitRowEntry<MomentumEvent>);
}

export function parseStoredEvidence(raw: string | null): ParseResult<IdentityEvidence> {
  return parseList(raw, parseEvidenceEntry);
}

/** Same rules as the stored-payload parsers, for already-parsed values (backup files). */
export const parseHabitList = (value: unknown) => parseEntries(value, parseHabitEntry);
export const parseCompletionEventList = (value: unknown) => parseEntries(value, parseHabitRowEntry<HabitCompletionEvent>);
export const parseMomentumEventList = (value: unknown) => parseEntries(value, parseHabitRowEntry<MomentumEvent>);
export const parseEvidenceList = (value: unknown) => parseEntries(value, parseEvidenceEntry);

/** Reminders without demo seed rows; notification ids are attached by the loader. */
export function parseStoredReminders(raw: string | null): ParseResult<StandaloneReminder> {
  return parseList(raw, (entry) => {
    if (!isRecord(entry) || (typeof entry.id !== 'string' && typeof entry.id !== 'number')) return REJECT;
    const reminder = entry as unknown as StandaloneReminder;
    return SEED_REMINDER_IDS.has(String(reminder.id)) ? DROP : reminder;
  });
}

export function parseStoredFrictionAudits(raw: string | null): ParseResult<FrictionAudit> {
  return parseList(raw, (entry) => (isRecord(entry) ? (entry as unknown as FrictionAudit) : REJECT));
}

export function parseStoredStringList(raw: string | null): ParseResult<string> {
  return parseList(raw, (entry) => (typeof entry === 'string' ? entry : REJECT));
}

/**
 * Rolled-over habit ids, valid only on the day they were recorded. A payload
 * from another day is expired, not malformed, so it is not rejected.
 */
export function parseStoredRolledOverHabits(raw: string | null, todayIso: string): ParseResult<string> {
  const payload = parsePayload(raw);
  if ('result' in payload) return payload.result;
  const parsed = payload.value;
  if (!isRecord(parsed) || typeof parsed.date !== 'string' || !Array.isArray(parsed.habitIds)) {
    return { items: null, rejected: [{ reason: 'invalid_entry', value: parsed }] };
  }
  if (parsed.date !== todayIso) return { items: null, rejected: [] };
  const items: string[] = [];
  const rejected: RejectedEntry[] = [];
  for (const id of parsed.habitIds) {
    if (typeof id === 'string') items.push(id);
    else rejected.push({ reason: 'invalid_entry', value: id });
  }
  return { items, rejected };
}

export function serializeRolledOverHabits(todayIso: string, habitIds: string[]): string {
  return JSON.stringify({ date: todayIso, habitIds });
}
