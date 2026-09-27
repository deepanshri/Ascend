import { addDaysIso, toISODate } from '../utils/dates';

export const CHRONICLE_STORAGE_KEY = 'ascend_chronicle_entries';

export interface ChronicleEntry {
  isoDate: string;
  phase1: string; // "What's your primary focus today?"
  phase2: string; // "Enter what all you did today"
  phase3: string; // "Plan your strategy for tomorrow"
  updatedAt: string;
}

export type ChronicleEntriesMap = Record<string, ChronicleEntry>;

/**
 * Load all chronicle entries from local storage.
 * Keyed by ISO date string (YYYY-MM-DD).
 */
export function loadChronicleEntries(): ChronicleEntriesMap {
  try {
    const raw = localStorage.getItem(CHRONICLE_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as ChronicleEntriesMap;
    }
    return {};
  } catch {
    return {};
  }
}

/**
 * Save or update a single chronicle entry.
 * Keeps entries up to 90 days to avoid quota exhaustion.
 */
export function saveChronicleEntry(entry: ChronicleEntry): void {
  try {
    const all = loadChronicleEntries();
    all[entry.isoDate] = {
      ...entry,
      updatedAt: new Date().toISOString(),
    };

    // Keep the most recent 90 entries sorted chronologically
    const sortedKeys = Object.keys(all).sort();
    const trimmedKeys = sortedKeys.slice(-90);
    const trimmed: ChronicleEntriesMap = {};
    for (const key of trimmedKeys) {
      const item = all[key];
      if (item) {
        trimmed[key] = item;
      }
    }

    localStorage.setItem(CHRONICLE_STORAGE_KEY, JSON.stringify(trimmed));
  } catch (err) {
    console.warn('Failed to save chronicle entry:', err);
  }
}

/**
 * Get a chronicle entry for a specific ISO date, or null if none exists.
 */
export function getChronicleEntry(isoDate: string): ChronicleEntry | null {
  const all = loadChronicleEntries();
  return all[isoDate] || null;
}

/**
 * Next-day transition lookup (T-1 -> T0):
 * Queries yesterday's Phase 3 plan ("Plan your strategy for tomorrow") for display today.
 * Returns non-empty trimmed string if found, otherwise null.
 */
export function getYesterdayPlanForToday(now: Date = new Date()): string | null {
  const todayIso = toISODate(now);
  const yesterdayIso = addDaysIso(todayIso, -1);
  const all = loadChronicleEntries();
  const yesterdayEntry = all[yesterdayIso];
  if (!yesterdayEntry) return null;
  const phase3 = (yesterdayEntry.phase3 || '').trim();
  return phase3.length > 0 ? phase3 : null;
}
