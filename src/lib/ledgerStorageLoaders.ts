/**
 * localStorage loaders for the habit ledger: read the raw payload, parse it
 * with the pure parsers in ledgerStorage.ts, then apply the impure steps
 * (deleted-habit filtering, notification ids, momentum backfill).
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
import { momentumEventsFromCompletionLog } from '../utils/momentum';
import { omitDeletedHabitRefs, omitDeletedHabits } from './habitsApi';
import { loadLocalMomentumEvents } from './momentumEvents';
import { withReminderNotificationIds } from './notifications';
import { readStorage, removeStorage, writeStorage } from './storage';
import {
  ACTIVE_FALLBACKS_STORAGE_KEY,
  COMPLETION_EVENTS_STORAGE_KEY,
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
  parseStoredReminders,
  parseStoredRolledOverHabits,
  parseStoredStringList,
  serializeRolledOverHabits,
} from './ledgerStorage';

const DEFAULT_INTERESTS = ['Movies', 'Books', 'Anime', 'Running'];

export function loadStoredHabits(): Habit[] {
  return omitDeletedHabits(parseStoredHabits(readStorage(HABITS_STORAGE_KEY)) ?? []);
}

/** `null` when nothing usable is stored, so callers can keep their current state. */
export function loadStoredCompletionEventsOrNull(): HabitCompletionEvent[] | null {
  const events = parseStoredCompletionEvents(readStorage(COMPLETION_EVENTS_STORAGE_KEY));
  return events ? omitDeletedHabitRefs(events) : null;
}

export function loadStoredCompletionEvents(): HabitCompletionEvent[] {
  return loadStoredCompletionEventsOrNull() ?? [];
}

/** Stored momentum log, or one rebuilt from stored completion events and habits. */
export function loadStoredMomentumEvents(): MomentumEvent[] {
  const stored = loadLocalMomentumEvents();
  if (stored) {
    return omitDeletedHabitRefs(stored.filter((event) => !isSeedHabitId(event.habitId)));
  }
  try {
    return momentumEventsFromCompletionLog(loadStoredCompletionEvents(), loadStoredHabits());
  } catch {
    return [];
  }
}

export function loadStoredEvidence(): IdentityEvidence[] {
  return parseStoredEvidence(readStorage(EVIDENCE_STORAGE_KEY)) ?? [];
}

export function loadStoredReminders(): StandaloneReminder[] {
  try {
    return (parseStoredReminders(readStorage(REMINDERS_STORAGE_KEY)) ?? []).map(withReminderNotificationIds);
  } catch {
    return [];
  }
}

export function loadStoredFrictionAudits(): FrictionAudit[] {
  return omitDeletedHabitRefs(parseStoredFrictionAudits(readStorage(FRICTION_AUDITS_STORAGE_KEY)) ?? []);
}

export function loadStoredActiveFallbackIds(): string[] {
  return parseStoredStringList(readStorage(ACTIVE_FALLBACKS_STORAGE_KEY)) ?? [];
}

export function loadStoredInterests(): string[] {
  return parseStoredStringList(readStorage(INTERESTS_STORAGE_KEY)) ?? DEFAULT_INTERESTS;
}

export function loadStoredRolledOverHabits(todayIso: string): string[] {
  return parseStoredRolledOverHabits(readStorage(ROLLED_OVER_HABITS_STORAGE_KEY), todayIso) ?? [];
}

/** Persist today's rolled-over habit ids; an empty list clears the key. */
export function saveRolledOverHabits(todayIso: string, habitIds: string[]): void {
  if (habitIds.length === 0) {
    removeStorage(ROLLED_OVER_HABITS_STORAGE_KEY);
    return;
  }
  writeStorage(ROLLED_OVER_HABITS_STORAGE_KEY, serializeRolledOverHabits(todayIso, habitIds));
}
