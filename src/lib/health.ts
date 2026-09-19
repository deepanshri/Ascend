import { Capacitor, registerPlugin, WebPlugin } from '@capacitor/core';
import { addDaysIso, toISODate } from '../utils/dates';

export const SLEEP_TARGET_HOURS = 8;
const SLEEP_DENIED_KEY = 'ascend_health_sleep_denied';

export interface SleepHours {
  isoDate: string;
  hours: number;
}

export interface SleepSnapshot {
  hasSleepData: boolean;
  linked: boolean;
  permissionDenied: boolean;
  todayHours: number | null;
  weekHours: number | null;
  dailyHours: SleepHours[];
}

interface HealthSleepSession {
  start?: string;
  end?: string;
  minutes?: number;
}

interface HealthSleepPlugin {
  isAvailable(): Promise<{ available?: boolean; reason?: string }>;
  checkAuthorization(): Promise<{ granted?: boolean }>;
  requestAuthorization(): Promise<{ granted?: boolean }>;
  readSleepSessions(options: { startIso: string; endIso: string }): Promise<{
    sessions?: HealthSleepSession[];
  }>;
}

class HealthSleepWeb extends WebPlugin implements HealthSleepPlugin {
  async isAvailable() {
    return { available: false, reason: 'web' };
  }
  async checkAuthorization() {
    return { granted: false };
  }
  async requestAuthorization() {
    return { granted: false };
  }
  async readSleepSessions() {
    return { sessions: [] };
  }
}

const HealthSleep = registerPlugin<HealthSleepPlugin>('HealthSleep', {
  web: () => new HealthSleepWeb(),
});

const EMPTY_SNAPSHOT: SleepSnapshot = {
  hasSleepData: false,
  linked: false,
  permissionDenied: false,
  todayHours: null,
  weekHours: null,
  dailyHours: [],
};

function wasDenied(): boolean {
  try {
    return localStorage.getItem(SLEEP_DENIED_KEY) === '1';
  } catch {
    return false;
  }
}

function markDenied(denied: boolean): void {
  try {
    if (denied) localStorage.setItem(SLEEP_DENIED_KEY, '1');
    else localStorage.removeItem(SLEEP_DENIED_KEY);
  } catch {
    // private mode
  }
}

function sessionMinutes(session: HealthSleepSession): number {
  if (typeof session.minutes === 'number' && Number.isFinite(session.minutes) && session.minutes > 0) {
    return session.minutes;
  }
  const start = session.start ? Date.parse(session.start) : NaN;
  const end = session.end ? Date.parse(session.end) : NaN;
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
  return (end - start) / 60000;
}

function sessionIsoDate(session: HealthSleepSession): string | null {
  // Attribute sleep to the wake (end) calendar day so last night's sleep counts toward today.
  const end = session.end ? Date.parse(session.end) : NaN;
  if (Number.isFinite(end)) return toISODate(new Date(end));
  const start = session.start ? Date.parse(session.start) : NaN;
  if (!Number.isFinite(start)) return null;
  return toISODate(new Date(start));
}

function aggregateSessions(sessions: HealthSleepSession[], todayIso: string): Pick<SleepSnapshot, 'todayHours' | 'weekHours' | 'dailyHours'> {
  const weekStart = addDaysIso(todayIso, -6);
  const byDay = new Map<string, number>();

  sessions.forEach((session) => {
    const iso = sessionIsoDate(session);
    const hours = sessionMinutes(session) / 60;
    if (!iso || hours <= 0) return;
    if (iso < weekStart || iso > todayIso) return;
    byDay.set(iso, (byDay.get(iso) || 0) + hours);
  });

  const dailyHours: SleepHours[] = [];
  for (let offset = -6; offset <= 0; offset += 1) {
    const iso = addDaysIso(todayIso, offset);
    const hours = byDay.get(iso);
    if (hours != null) dailyHours.push({ isoDate: iso, hours: Math.round(hours * 10) / 10 });
  }

  const todayHours = byDay.has(todayIso) ? Math.round((byDay.get(todayIso) as number) * 10) / 10 : null;
  const weekTotal = dailyHours.reduce((sum, row) => sum + row.hours, 0);
  const weekHours = dailyHours.length > 0 ? Math.round(weekTotal * 10) / 10 : null;

  return { todayHours, weekHours, dailyHours };
}

/**
 * Reads sleep hours for today and the trailing week from Health Connect (Android)
 * or HealthKit (iOS). Web, missing SDK, unlink, or denied permission → hasSleepData false.
 */
export async function readSleepSnapshot(todayIso: string = toISODate()): Promise<SleepSnapshot> {
  if (!Capacitor.isNativePlatform()) {
    return { ...EMPTY_SNAPSHOT };
  }

  try {
    const availability = await HealthSleep.isAvailable();
    if (!availability?.available) {
      return { ...EMPTY_SNAPSHOT };
    }

    let granted = false;
    try {
      const checked = await HealthSleep.checkAuthorization();
      granted = Boolean(checked?.granted);
    } catch {
      granted = false;
    }

    if (!granted && !wasDenied()) {
      try {
        const requested = await HealthSleep.requestAuthorization();
        granted = Boolean(requested?.granted);
        markDenied(!granted);
      } catch {
        markDenied(true);
        return { ...EMPTY_SNAPSHOT, permissionDenied: true };
      }
    }

    if (!granted) {
      return { ...EMPTY_SNAPSHOT, permissionDenied: true };
    }

    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - 6);
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    const payload = await HealthSleep.readSleepSessions({
      startIso: start.toISOString(),
      endIso: end.toISOString(),
    });
    const sessions = Array.isArray(payload?.sessions) ? payload.sessions : [];
    const totals = aggregateSessions(sessions, todayIso);

    return {
      hasSleepData: true,
      linked: true,
      permissionDenied: false,
      ...totals,
    };
  } catch {
    return { ...EMPTY_SNAPSHOT };
  }
}

export function sleepRingRate(snapshot: SleepSnapshot, window: 'today' | 'week'): number {
  if (!snapshot.hasSleepData) return 0;
  if (window === 'today') {
    const hours =
      snapshot.todayHours ??
      snapshot.dailyHours.find((row) => row.isoDate === toISODate())?.hours ??
      null;
    if (hours == null || !Number.isFinite(hours)) return 0;
    return Math.min(1, Math.max(0, hours / SLEEP_TARGET_HOURS));
  }
  if (snapshot.weekHours == null || !Number.isFinite(snapshot.weekHours)) return 0;
  return Math.min(1, Math.max(0, snapshot.weekHours / (SLEEP_TARGET_HOURS * 7)));
}
