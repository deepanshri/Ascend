import { addDaysIso, toISODate } from '../utils/dates';

export const CHRONICLE_STORAGE_KEY = 'ascend_chronicle_entries';
export const EVENING_CHRONICLE_SETTINGS_KEY = 'ascend_chronicle_settings';

export interface EveningChronicleSettings {
  enabled: boolean;
  /** Local wall-clock time in HH:mm. */
  time: string;
}

export const DEFAULT_EVENING_CHRONICLE_SETTINGS: EveningChronicleSettings = {
  enabled: true,
  time: '20:00',
};

export function loadEveningChronicleSettings(): EveningChronicleSettings {
  try {
    const parsed = JSON.parse(localStorage.getItem(EVENING_CHRONICLE_SETTINGS_KEY) || 'null');
    if (parsed && typeof parsed === 'object' && typeof parsed.enabled === 'boolean') {
      return {
        enabled: Boolean(parsed.enabled),
        time: /^([01]\d|2[0-3]):[0-5]\d$/.test(parsed.time) ? parsed.time : '20:00',
      };
    }
    return DEFAULT_EVENING_CHRONICLE_SETTINGS;
  } catch {
    return DEFAULT_EVENING_CHRONICLE_SETTINGS;
  }
}

export function saveEveningChronicleSettings(settings: EveningChronicleSettings): void {
  try {
    localStorage.setItem(EVENING_CHRONICLE_SETTINGS_KEY, JSON.stringify(settings));
  } catch (err) {
    if (import.meta.env.DEV) console.warn('Failed to save evening chronicle settings:', err);
  }
}

export function isChronicleReady(
  settings: EveningChronicleSettings,
  completedToday: boolean,
  now: Date = new Date()
): boolean {
  if (!settings.enabled || completedToday) return false;
  const [hours, minutes] = settings.time.split(':').map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return false;
  return now.getHours() * 60 + now.getMinutes() >= hours * 60 + minutes;
}

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
 * Reads both 'ascend_chronicle' and 'ascend_chronicle_entries' to guarantee consistency.
 */
/** A chronicle row as stored by older and newer app versions (snake or camel case). */
interface StoredChronicleRow {
  iso_date?: string;
  isoDate?: string;
  phase1?: string;
  phase2?: string;
  phase3?: string;
  updated_at?: string;
  updatedAt?: string;
}

export function loadChronicleEntries(): ChronicleEntriesMap {
  try {
    const rawLegacy = localStorage.getItem(CHRONICLE_STORAGE_KEY);
    const rawSync = localStorage.getItem('ascend_chronicle');

    let entries: ChronicleEntriesMap = {};

    if (rawLegacy) {
      const parsed = JSON.parse(rawLegacy);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        entries = { ...parsed };
      }
    }

    if (rawSync) {
      const parsed = JSON.parse(rawSync);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        for (const [k, v] of Object.entries(parsed as Record<string, StoredChronicleRow | null>)) {
          if (v && typeof v === 'object') {
            const iso = v.iso_date || v.isoDate || k;
            entries[iso] = {
              isoDate: iso,
              phase1: v.phase1 || '',
              phase2: v.phase2 || '',
              phase3: v.phase3 || '',
              updatedAt: v.updated_at || v.updatedAt || new Date().toISOString(),
            };
          }
        }
      }
    }

    return entries;
  } catch {
    return {};
  }
}

/** Entries kept in the 90-day map (the legacy sync cache keeps everything). */
const CHRONICLE_RETENTION_DAYS = 90;

/**
 * Write entries to both local stores: the 90-day map and the legacy
 * 'ascend_chronicle' cache that loadChronicleEntries also reads. Local only;
 * chronicleSync sends entries to Supabase.
 */
export function storeChronicleEntriesLocally(entries: ChronicleEntry[]): void {
  if (entries.length === 0) return;
  try {
    const cached = JSON.parse(localStorage.getItem('ascend_chronicle') || '{}');
    for (const entry of entries) {
      cached[entry.isoDate] = {
        iso_date: entry.isoDate,
        phase1: entry.phase1,
        phase2: entry.phase2,
        phase3: entry.phase3,
        updated_at: entry.updatedAt,
      };
    }
    localStorage.setItem('ascend_chronicle', JSON.stringify(cached));
  } catch (err) {
    if (import.meta.env.DEV) console.warn('Failed to update ascend_chronicle cache:', err);
  }

  try {
    const all = loadChronicleEntries();
    for (const entry of entries) all[entry.isoDate] = entry;
    const trimmed: ChronicleEntriesMap = {};
    for (const key of Object.keys(all).sort().slice(-CHRONICLE_RETENTION_DAYS)) {
      const item = all[key];
      if (item) trimmed[key] = item;
    }
    localStorage.setItem(CHRONICLE_STORAGE_KEY, JSON.stringify(trimmed));
  } catch (err) {
    if (import.meta.env.DEV) console.warn('Failed to update ascend_chronicle_entries cache:', err);
  }
}

function updatedAtMs(entry: ChronicleEntry): number {
  const ms = Date.parse(entry.updatedAt);
  return Number.isNaN(ms) ? 0 : ms;
}

/**
 * Which remote entries should replace or add to the local ones: a date missing
 * locally, or one the server holds a newer version of. A date with a local edit
 * still waiting to upload (`pendingDates`) keeps the local version. Equal
 * timestamps keep local.
 */
export function mergeRemoteChronicleEntries(
  local: ChronicleEntriesMap,
  remote: ChronicleEntry[],
  pendingDates: ReadonlySet<string>
): ChronicleEntry[] {
  const incoming: ChronicleEntry[] = [];
  for (const entry of remote) {
    if (pendingDates.has(entry.isoDate)) continue;
    const mine = local[entry.isoDate];
    if (!mine || updatedAtMs(entry) > updatedAtMs(mine)) incoming.push(entry);
  }
  return incoming;
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
