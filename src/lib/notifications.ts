import { Capacitor } from '@capacitor/core';
import { LocalNotifications, type LocalNotificationSchema } from '@capacitor/local-notifications';
import { Preferences } from '@capacitor/preferences';
import { Habit } from '../types';

export type NotificationWindowKey = 'morning' | 'afternoon' | 'night';

export interface PsychologyNotificationWindows {
  morning: boolean;
  afternoon: boolean;
  night: boolean;
}

export const DEFAULT_NOTIFICATION_WINDOWS: PsychologyNotificationWindows = {
  morning: true,
  afternoon: true,
  night: true,
};

export const NOTIFICATION_WINDOWS_KEY = 'ascend_psychology_notifications';

const CHANNEL_ID = 'ascend-momentum';
const NOTIFICATION_IDS = {
  morning: 81000,
  afternoon: 81300,
  night: 20300,
} as const;

export interface PsychologyScheduleInput {
  windows: PsychologyNotificationWindows;
  habits: Habit[];
  todayIndex: number;
  momentumScore: number;
}

function parseWindows(raw: string | null): PsychologyNotificationWindows | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<PsychologyNotificationWindows>;
    return {
      morning: parsed.morning !== false,
      afternoon: parsed.afternoon !== false,
      night: parsed.night !== false,
    };
  } catch {
    return null;
  }
}

export function loadNotificationWindows(): PsychologyNotificationWindows {
  try {
    return parseWindows(localStorage.getItem(NOTIFICATION_WINDOWS_KEY)) ?? {
      ...DEFAULT_NOTIFICATION_WINDOWS,
    };
  } catch {
    return { ...DEFAULT_NOTIFICATION_WINDOWS };
  }
}

export async function hydrateNotificationWindows(): Promise<PsychologyNotificationWindows> {
  try {
    const localRaw = localStorage.getItem(NOTIFICATION_WINDOWS_KEY);
    if (localRaw) {
      return parseWindows(localRaw) ?? { ...DEFAULT_NOTIFICATION_WINDOWS };
    }
  } catch {
    // Fall through to Preferences on native.
  }

  if (!Capacitor.isNativePlatform()) {
    return { ...DEFAULT_NOTIFICATION_WINDOWS };
  }

  try {
    const stored = await Preferences.get({ key: NOTIFICATION_WINDOWS_KEY });
    return parseWindows(stored.value) ?? { ...DEFAULT_NOTIFICATION_WINDOWS };
  } catch {
    return { ...DEFAULT_NOTIFICATION_WINDOWS };
  }
}

export async function persistNotificationWindows(
  windows: PsychologyNotificationWindows
): Promise<void> {
  const serialized = JSON.stringify(windows);
  try {
    localStorage.setItem(NOTIFICATION_WINDOWS_KEY, serialized);
  } catch {
    // Ignore quota / private-mode failures.
  }

  try {
    await Preferences.set({ key: NOTIFICATION_WINDOWS_KEY, value: serialized });
  } catch {
    // Native preferences may be unavailable during web preview.
  }
}

function activeHabits(habits: Habit[]): Habit[] {
  return habits.filter((habit) => !habit.archived);
}

function remainingToday(habits: Habit[], todayIndex: number): { remaining: number; total: number } {
  const scheduled = activeHabits(habits);
  const remaining = scheduled.filter((habit) => !habit.days?.[todayIndex]).length;
  return { remaining, total: scheduled.length };
}

function morningCopy(habits: Habit[]): { title: string; body: string } {
  const featured =
    activeHabits(habits).find((habit) => habit.priority === 'high') || activeHabits(habits)[0];
  const identity = featured?.identityStatement?.trim();
  const name = featured?.name?.trim();

  return {
    title: 'Morning Primer',
    body: identity
      ? `${identity}${name ? ` Show up for ${name} first.` : ''} High-energy start — lock in today's identity.`
      : 'High-energy start: log your first active habit and lock in today’s identity.',
  };
}

function afternoonCopy(remaining: number, total: number, score: number): { title: string; body: string } {
  return {
    title: 'Afternoon Momentum Check',
    body:
      total === 0
        ? 'No active habits yet. Add one this afternoon to start building momentum.'
        : remaining <= 0
        ? `All ${total} daily actions are logged. Momentum is ${score} — protect the streak.`
        : `${remaining} of ${total} daily actions still open. Log them to protect an optimal momentum score (now ${score}).`,
  };
}

function nightCopy(remaining: number, score: number): { title: string; body: string } {
  return {
    title: 'Night Streak Guard',
    body:
      remaining <= 0
        ? `Streak safe. Today’s momentum (${score}) is locked in.`
        : `Loss alert: ${remaining} unlogged habit${remaining === 1 ? '' : 's'} will decay momentum overnight. Log them before the day closes.`,
  };
}

async function ensureChannel(): Promise<void> {
  if (Capacitor.getPlatform() !== 'android') return;
  try {
    await LocalNotifications.createChannel({
      id: CHANNEL_ID,
      name: 'Daily Momentum',
      description: 'Morning primer, afternoon momentum check, and night streak guard',
      importance: 4,
      visibility: 1,
      vibration: true,
      lights: true,
      lightColor: '#23C15D',
    });
  } catch {
    // Channel creation is Android-only and can fail on older webviews.
  }
}

async function cancelPsychologyNotifications(): Promise<void> {
  try {
    await LocalNotifications.cancel({
      notifications: [
        { id: NOTIFICATION_IDS.morning },
        { id: NOTIFICATION_IDS.afternoon },
        { id: NOTIFICATION_IDS.night },
      ],
    });
  } catch {
    // Nothing pending, or plugin unavailable on web.
  }
}

export async function requestPsychologyNotificationAccess(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;

  try {
    const current = await LocalNotifications.checkPermissions();
    if (current.display === 'granted') return true;
    const requested = await LocalNotifications.requestPermissions();
    return requested.display === 'granted';
  } catch {
    return false;
  }
}

function dailyWindow(hour: number, minute: number): LocalNotificationSchema['schedule'] {
  return {
    on: { hour, minute },
    allowWhileIdle: true,
  };
}

export async function schedulePsychologyNotifications(input: PsychologyScheduleInput): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;

  const enabled = input.windows.morning || input.windows.afternoon || input.windows.night;
  await cancelPsychologyNotifications();
  if (!enabled) return;

  const granted = await requestPsychologyNotificationAccess();
  if (!granted) return;

  await ensureChannel();

  const { remaining, total } = remainingToday(input.habits, input.todayIndex);
  const morning = morningCopy(input.habits);
  const afternoon = afternoonCopy(remaining, total, input.momentumScore);
  const night = nightCopy(remaining, input.momentumScore);

  const notifications: LocalNotificationSchema[] = [];

  if (input.windows.morning) {
    notifications.push({
      id: NOTIFICATION_IDS.morning,
      title: morning.title,
      body: morning.body,
      channelId: CHANNEL_ID,
      schedule: dailyWindow(8, 0),
    });
  }

  if (input.windows.afternoon) {
    notifications.push({
      id: NOTIFICATION_IDS.afternoon,
      title: afternoon.title,
      body: afternoon.body,
      channelId: CHANNEL_ID,
      schedule: dailyWindow(13, 30),
    });
  }

  if (input.windows.night) {
    notifications.push({
      id: NOTIFICATION_IDS.night,
      title: night.title,
      body: night.body,
      channelId: CHANNEL_ID,
      schedule: dailyWindow(20, 30),
    });
  }

  if (notifications.length === 0) return;

  try {
    await LocalNotifications.schedule({ notifications });
  } catch {
    // Native scheduling can fail without notification permission or exact-alarm access.
  }
}
