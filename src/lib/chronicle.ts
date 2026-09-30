import { addDaysIso, toISODate } from '../utils/dates';
import { supabase } from './supabaseClient';

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
        for (const [k, v] of Object.entries(parsed as Record<string, any>)) {
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

/**
 * Save or update a single chronicle entry.
 * Syncs directly to Supabase public.chronicle_entries and maintains local cache.
 * Supports both (isoDate, phase1, phase2, phase3) and (entry: ChronicleEntry).
 */
export async function saveChronicleEntry(
  isoDateOrEntry: string | ChronicleEntry,
  phase1?: string,
  phase2?: string,
  phase3?: string
): Promise<void> {
  let isoDate: string;
  let p1: string;
  let p2: string;
  let p3: string;

  if (typeof isoDateOrEntry === 'object' && isoDateOrEntry !== null) {
    isoDate = isoDateOrEntry.isoDate;
    p1 = isoDateOrEntry.phase1 ?? '';
    p2 = isoDateOrEntry.phase2 ?? '';
    p3 = isoDateOrEntry.phase3 ?? '';
  } else {
    isoDate = String(isoDateOrEntry);
    p1 = phase1 ?? '';
    p2 = phase2 ?? '';
    p3 = phase3 ?? '';
  }

  const { data: authData } = await supabase.auth.getUser();

  const payload: {
    user_id?: string;
    iso_date: string;
    phase1: string;
    phase2: string;
    phase3: string;
    updated_at: string;
  } = {
    iso_date: isoDate,
    phase1: p1,
    phase2: p2,
    phase3: p3,
    updated_at: new Date().toISOString(),
  };

  if (authData?.user) {
    payload.user_id = authData.user.id;
  }

  // Update local cache 'ascend_chronicle'
  try {
    const cached = JSON.parse(localStorage.getItem('ascend_chronicle') || '{}');
    cached[isoDate] = payload;
    localStorage.setItem('ascend_chronicle', JSON.stringify(cached));
  } catch (err) {
    if (import.meta.env.DEV) console.warn('Failed to update ascend_chronicle cache:', err);
  }

  // Update local cache 'ascend_chronicle_entries' (90-day FIFO retention)
  try {
    const all = loadChronicleEntries();
    all[isoDate] = {
      isoDate,
      phase1: p1,
      phase2: p2,
      phase3: p3,
      updatedAt: payload.updated_at,
    };

    const sortedKeys = Object.keys(all).sort();
    const trimmedKeys = sortedKeys.slice(-90);
    const trimmed: ChronicleEntriesMap = {};
    for (const key of trimmedKeys) {
      const item = all[key];
      if (item) trimmed[key] = item;
    }
    localStorage.setItem(CHRONICLE_STORAGE_KEY, JSON.stringify(trimmed));
  } catch (err) {
    if (import.meta.env.DEV) console.warn('Failed to update ascend_chronicle_entries cache:', err);
  }

  // Remote sync to Supabase
  if (!authData?.user) return;

  const { error } = await supabase
    .from('chronicle_entries')
    .upsert(payload, { onConflict: 'user_id,iso_date' });

  if (error) {
    if (import.meta.env.DEV) console.error('Failed to sync chronicle entry to Supabase:', error);
  }
}

/**
 * Fetch chronicle entries from Supabase for authenticated user and rehydrate local cache.
 */
export async function fetchRemoteChronicleEntries(): Promise<ChronicleEntriesMap> {
  try {
    const { data: authData } = await supabase.auth.getUser();
    if (!authData?.user) return loadChronicleEntries();

    const { data, error } = await supabase
      .from('chronicle_entries')
      .select('*')
      .eq('user_id', authData.user.id)
      .order('iso_date', { ascending: false })
      .limit(90);

    if (error || !data) {
      return loadChronicleEntries();
    }

    const map: ChronicleEntriesMap = {};
    const syncCache: Record<string, unknown> = {};

    for (const row of data) {
      const iso = row.iso_date;
      map[iso] = {
        isoDate: iso,
        phase1: row.phase1 || '',
        phase2: row.phase2 || '',
        phase3: row.phase3 || '',
        updatedAt: row.updated_at || row.created_at || new Date().toISOString(),
      };
      syncCache[iso] = row;
    }

    localStorage.setItem('ascend_chronicle', JSON.stringify(syncCache));
    localStorage.setItem(CHRONICLE_STORAGE_KEY, JSON.stringify(map));
    return map;
  } catch (err) {
    if (import.meta.env.DEV) console.warn('Failed to fetch remote chronicle entries:', err);
    return loadChronicleEntries();
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
