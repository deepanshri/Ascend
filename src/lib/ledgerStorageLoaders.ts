/**
 * localStorage loaders for the habit ledger: read the raw payload, parse it
 * with the pure parsers in ledgerStorage.ts, move anything unreadable to the
 * dead-letter store, then apply the impure steps (deleted-habit filtering,
 * notification ids, momentum backfill).
 */
import type {
  FrictionAudit,
  Habit,
  HabitCompletionEvent,
  IdentityEvidence,
  MomentumEvent,
  StandaloneReminder,
} from '../types';
import { momentumEventsFromCompletionLog } from '../utils/momentum';
import { recordDeadLetters } from './deadLetter';
import { omitDeletedHabitRefs, omitDeletedHabits } from './habitsApi';
import { MOMENTUM_EVENTS_STORAGE_KEY } from './momentumEvents';
import { withReminderNotificationIds } from './notifications';
import { readStorage, removeStorage, writeStorage } from './storage';
import {
  ACTIVE_FALLBACKS_STORAGE_KEY,
  COMPLETION_EVENTS_STORAGE_KEY,
  DEFAULT_INTERESTS,
  EVIDENCE_STORAGE_KEY,
  FRICTION_AUDITS_STORAGE_KEY,
  HABITS_STORAGE_KEY,
  INTERESTS_STORAGE_KEY,
  REMINDERS_STORAGE_KEY,
  ROLLED_OVER_HABITS_STORAGE_KEY,
  parseStoredCompletionEvents,
  parseStoredEvidence,
  parseStoredFrictionAudits,
  parseStoredHabits,
  parseStoredMomentumEvents,
  parseStoredReminders,
  parseStoredRolledOverHabits,
  parseStoredStringList,
  serializeRolledOverHabits,
  type ParseResult,
  type RejectedEntry,
} from './ledgerStorage';

/** Read and parse `key`, dead-lettering anything the parser rejected. */
function load<T>(key: string, parse: (raw: string | null) => ParseResult<T>): T[] | null {
  const { items, rejected } = parse(readStorage(key));
  recordDeadLetters(key, rejected);
  return items;
}

export function loadStoredHabits(): Habit[] {
  return omitDeletedHabits(load(HABITS_STORAGE_KEY, parseStoredHabits) ?? []);
}

/** `null` when nothing usable is stored, so callers can keep their current state. */
export function loadStoredCompletionEventsOrNull(): HabitCompletionEvent[] | null {
  const events = load(COMPLETION_EVENTS_STORAGE_KEY, parseStoredCompletionEvents);
  return events ? omitDeletedHabitRefs(events) : null;
}

export function loadStoredCompletionEvents(): HabitCompletionEvent[] {
  return loadStoredCompletionEventsOrNull() ?? [];
}

/** Stored momentum log, or one rebuilt from stored completion events and habits. */
export function loadStoredMomentumEvents(): MomentumEvent[] {
  const stored = load(MOMENTUM_EVENTS_STORAGE_KEY, parseStoredMomentumEvents);
  if (stored) return omitDeletedHabitRefs(stored);
  try {
    return momentumEventsFromCompletionLog(loadStoredCompletionEvents(), loadStoredHabits());
  } catch {
    return [];
  }
}

export function loadStoredEvidence(): IdentityEvidence[] {
  return load(EVIDENCE_STORAGE_KEY, parseStoredEvidence) ?? [];
}

export function loadStoredReminders(): StandaloneReminder[] {
  const reminders: StandaloneReminder[] = [];
  const rejected: RejectedEntry[] = [];
  for (const reminder of load(REMINDERS_STORAGE_KEY, parseStoredReminders) ?? []) {
    try {
      reminders.push(withReminderNotificationIds(reminder));
    } catch {
      rejected.push({ reason: 'invalid_entry', value: reminder });
    }
  }
  recordDeadLetters(REMINDERS_STORAGE_KEY, rejected);
  return reminders;
}

export function loadStoredFrictionAudits(): FrictionAudit[] {
  return omitDeletedHabitRefs(load(FRICTION_AUDITS_STORAGE_KEY, parseStoredFrictionAudits) ?? []);
}

export function loadStoredActiveFallbackIds(): string[] {
  return load(ACTIVE_FALLBACKS_STORAGE_KEY, parseStoredStringList) ?? [];
}

export function loadStoredInterests(): string[] {
  return load(INTERESTS_STORAGE_KEY, parseStoredStringList) ?? [...DEFAULT_INTERESTS];
}

export function loadStoredRolledOverHabits(todayIso: string): string[] {
  return load(ROLLED_OVER_HABITS_STORAGE_KEY, (raw) => parseStoredRolledOverHabits(raw, todayIso)) ?? [];
}

/** Persist today's rolled-over habit ids; an empty list clears the key. */
export function saveRolledOverHabits(todayIso: string, habitIds: string[]): void {
  if (habitIds.length === 0) {
    removeStorage(ROLLED_OVER_HABITS_STORAGE_KEY);
    return;
  }
  writeStorage(ROLLED_OVER_HABITS_STORAGE_KEY, serializeRolledOverHabits(todayIso, habitIds));
}
