import type { Habit } from '../types';
import { addDaysIso, toISODate } from '../utils/dates';

export const EVENING_JOURNAL_SETTINGS_KEY = 'ascend_evening_journal_settings';
export const EVENING_JOURNAL_ENTRIES_KEY = 'ascend_evening_journal_entries';

export interface EveningJournalSettings {
  enabled: boolean;
  /** Local wall-clock time in HH:mm. */
  time: string;
}

export interface EveningJournalEntry {
  date: string;
  completedAt: number;
  completedHabitIds: string[];
  missedReasons: Record<string, string>;
  tomorrowAction: string;
  linkedHabitId?: string;
}

export const DEFAULT_EVENING_JOURNAL_SETTINGS: EveningJournalSettings = {
  enabled: false,
  time: '20:30',
};

export function loadEveningJournalSettings(): EveningJournalSettings {
  try {
    const parsed = JSON.parse(localStorage.getItem(EVENING_JOURNAL_SETTINGS_KEY) || 'null');
    return {
      enabled: Boolean(parsed?.enabled),
      time: /^([01]\d|2[0-3]):[0-5]\d$/.test(parsed?.time) ? parsed.time : '20:30',
    };
  } catch {
    return DEFAULT_EVENING_JOURNAL_SETTINGS;
  }
}

export function saveEveningJournalSettings(settings: EveningJournalSettings): void {
  try {
    localStorage.setItem(EVENING_JOURNAL_SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Best effort for private mode / quota errors.
  }
}

export function loadEveningJournalEntries(): EveningJournalEntry[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(EVENING_JOURNAL_ENTRIES_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter((entry) => entry && typeof entry.date === 'string') : [];
  } catch {
    return [];
  }
}

export function saveEveningJournalEntries(entries: EveningJournalEntry[]): void {
  try {
    localStorage.setItem(EVENING_JOURNAL_ENTRIES_KEY, JSON.stringify(entries.slice(-90)));
  } catch {
    // Best effort for private mode / quota errors.
  }
}

export function isJournalReady(
  settings: EveningJournalSettings,
  completedToday: boolean,
  now: Date = new Date()
): boolean {
  if (!settings.enabled || completedToday) return false;
  const [hours, minutes] = settings.time.split(':').map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return false;
  return now.getHours() * 60 + now.getMinutes() >= hours * 60 + minutes;
}

export function previousMorningIntention(
  entries: EveningJournalEntry[],
  habits: Habit[],
  now: Date = new Date()
): { text: string; habitName?: string } | null {
  if (now.getHours() >= 12) return null;
  const yesterday = addDaysIso(toISODate(now), -1);
  const entry = entries.find((item) => item.date === yesterday && item.tomorrowAction.trim());
  if (!entry) return null;
  const linked = entry.linkedHabitId ? habits.find((habit) => habit.id === entry.linkedHabitId) : undefined;
  return { text: entry.tomorrowAction.trim(), habitName: linked?.name };
}
