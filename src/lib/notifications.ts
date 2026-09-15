import { Capacitor } from '@capacitor/core';
import { LocalNotifications, type LocalNotificationSchema } from '@capacitor/local-notifications';
import { Preferences } from '@capacitor/preferences';
import { Habit, StandaloneReminder } from '../types';
import { isHabitScheduledOnDayIndex } from '../utils/schedule';
import {
  completionConfirmCopy,
  compactNotificationPair,
  reminderPromptCopy,
} from '../services/notificationService';

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
export const REMINDER_CHANNEL_ID = 'ascend_reminders';
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
  const scheduled = activeHabits(habits).filter((habit) => isHabitScheduledOnDayIndex(habit, todayIndex));
  const remaining = scheduled.filter((habit) => !habit.days?.[todayIndex]).length;
  return { remaining, total: scheduled.length };
}

function featuredHabitName(habits: Habit[], todayIndex: number): string {
  const dueToday = activeHabits(habits).filter((habit) => isHabitScheduledOnDayIndex(habit, todayIndex));
  const featured =
    dueToday.find((habit) => habit.priority === 'high') || dueToday[0] || activeHabits(habits)[0];
  return featured?.name?.trim() || 'your habit';
}

function morningCopy(habits: Habit[], todayIndex: number): { title: string; body: string } {
  return compactNotificationPair(featuredHabitName(habits, todayIndex));
}

function afternoonCopy(
  habits: Habit[],
  todayIndex: number,
  remaining: number
): { title: string; body: string } {
  if (remaining <= 0) {
    return compactNotificationPair(featuredHabitName(habits, todayIndex));
  }
  const open = activeHabits(habits).find(
    (habit) => isHabitScheduledOnDayIndex(habit, todayIndex) && !habit.days?.[todayIndex]
  );
  return compactNotificationPair(open?.name?.trim() || featuredHabitName(habits, todayIndex));
}

function nightCopy(habits: Habit[], todayIndex: number, remaining: number): { title: string; body: string } {
  if (remaining <= 0) {
    const name = featuredHabitName(habits, todayIndex);
    const title = completionConfirmCopy(name);
    return { title, body: title };
  }
  const open = activeHabits(habits).find(
    (habit) => isHabitScheduledOnDayIndex(habit, todayIndex) && !habit.days?.[todayIndex]
  );
  return compactNotificationPair(open?.name?.trim() || featuredHabitName(habits, todayIndex));
}

async function ensureChannel(): Promise<void> {
  if (Capacitor.getPlatform() !== 'android') return;
  try {
    await LocalNotifications.createChannel({
      id: CHANNEL_ID,
      name: 'Daily Momentum',
      description: 'Habit reminders',
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

export async function requestNotificationPermissions(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;

  try {
    const requested = await LocalNotifications.requestPermissions();
    return requested.display === 'granted';
  } catch {
    return false;
  }
}

export async function initializeReminderNotifications(): Promise<boolean> {
  const granted = await requestNotificationPermissions();
  if (granted) await ensureReminderChannel();
  return granted;
}

export async function requestPsychologyNotificationAccess(): Promise<boolean> {
  return requestNotificationPermissions();
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

  const { remaining } = remainingToday(input.habits, input.todayIndex);
  const morning = morningCopy(input.habits, input.todayIndex);
  const afternoon = afternoonCopy(input.habits, input.todayIndex, remaining);
  const night = nightCopy(input.habits, input.todayIndex, remaining);

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

function stableNotificationId(key: string, salt: number): number {
  let hash = salt >>> 0;
  for (let i = 0; i < key.length; i++) {
    hash = Math.imul(hash ^ key.charCodeAt(i), 16777619) >>> 0;
  }
  // Stay in 210000–909999 so we never collide with psychology ids 20300 / 81000 / 81300.
  return (210000 + (hash % 700000)) | 0;
}

export function weekdayFromIsoDate(isoDate: string): number {
  const [year, month, day] = isoDate.split('-').map(Number);
  if ([year, month, day].some((value) => Number.isNaN(value))) return new Date().getDay();
  return new Date(year, month - 1, day).getDay();
}

export function reminderNotificationIds(reminderId: string): {
  notificationId1: number;
  notificationId2: number;
} {
  const notificationId1 = stableNotificationId(reminderId, 0x9e3779b1);
  let notificationId2 = stableNotificationId(reminderId, 0x85ebca6b);
  if (notificationId2 === notificationId1) {
    notificationId2 = notificationId1 >= 909999 ? notificationId1 - 1 : notificationId1 + 1;
  }
  return { notificationId1, notificationId2 };
}

function normalizeTimeHHmm(raw?: string | null): string | undefined {
  if (!raw) return undefined;
  const match = String(raw).match(/^(\d{1,2}):(\d{2})/);
  if (!match) return undefined;
  return `${match[1].padStart(2, '0')}:${match[2]}`;
}

export function withReminderNotificationIds(reminder: StandaloneReminder): StandaloneReminder {
  const ids = reminderNotificationIds(reminder.id);
  const time = normalizeTimeHHmm(reminder.time);
  return {
    ...reminder,
    time,
    daysOfWeek: reminder.daysOfWeek?.length ? reminder.daysOfWeek : [weekdayFromIsoDate(reminder.date)],
    isEnabled: reminder.isEnabled !== false && !reminder.completed && !reminder.deleted,
    notificationId1: reminder.notificationId1 ?? ids.notificationId1,
    notificationId2: reminder.notificationId2 ?? ids.notificationId2,
  };
}

export function isReminderScheduleActive(reminder: StandaloneReminder): boolean {
  return Boolean(
    reminder.time &&
      !reminder.completed &&
      !reminder.deleted &&
      reminder.isEnabled !== false &&
      (reminder.alert10Min !== false || reminder.alertExact !== false)
  );
}

function parseReminderTarget(reminder: StandaloneReminder): Date | null {
  const time = normalizeTimeHHmm(reminder.time);
  if (!time || !reminder.date) return null;
  const [year, month, day] = reminder.date.split('-').map(Number);
  const [hours, minutes] = time.split(':').map(Number);
  if ([year, month, day, hours, minutes].some((value) => Number.isNaN(value))) return null;
  return new Date(year, month - 1, day, hours, minutes, 0, 0);
}

async function ensureReminderChannel(): Promise<void> {
  if (Capacitor.getPlatform() !== 'android') return;
  try {
    await LocalNotifications.createChannel({
      id: REMINDER_CHANNEL_ID,
      name: 'Reminders',
      description: 'Habit reminders',
      importance: 5,
      visibility: 1,
      vibration: true,
      lights: true,
      lightColor: '#23C15D',
    });
  } catch {
    // Channel creation is Android-only and can fail on older webviews.
  }
}

function reminderCancelTargets(
  reminder: Pick<StandaloneReminder, 'id' | 'notificationId1' | 'notificationId2'> | string
): number[] {
  const reminderId = typeof reminder === 'string' ? reminder : reminder.id;
  const computed = reminderNotificationIds(reminderId);
  const stored1 = typeof reminder === 'string' ? undefined : reminder.notificationId1;
  const stored2 = typeof reminder === 'string' ? undefined : reminder.notificationId2;
  return Array.from(
    new Set(
      [stored1, stored2, computed.notificationId1, computed.notificationId2]
        .map((id) => (id == null ? NaN : Math.trunc(Number(id))))
        .filter((id): id is number => Number.isInteger(id) && id > 0)
    )
  );
}

export async function cancelReminderDualAlerts(
  reminder: Pick<StandaloneReminder, 'id' | 'notificationId1' | 'notificationId2'> | string
): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  const ids = reminderCancelTargets(reminder);
  if (ids.length === 0) return;
  try {
    await LocalNotifications.cancel({
      notifications: ids.map((id) => ({ id })),
    });
  } catch {
    // Nothing pending, or plugin unavailable.
  }
}

export async function scheduleReminderDualAlerts(reminder: StandaloneReminder): Promise<StandaloneReminder> {
  const hydrated = withReminderNotificationIds(reminder);
  const notificationId1 = Math.trunc(Number(hydrated.notificationId1));
  const notificationId2 = Math.trunc(Number(hydrated.notificationId2));
  hydrated.notificationId1 = notificationId1;
  hydrated.notificationId2 = notificationId2;

  await cancelReminderDualAlerts(hydrated);

  if (!Capacitor.isNativePlatform() || !isReminderScheduleActive(hydrated)) {
    return hydrated;
  }

  // Explicit permission prompt on schedule / toggle-on.
  const requested = await LocalNotifications.requestPermissions();
  if (requested.display !== 'granted') return hydrated;

  const target = parseReminderTarget(hydrated);
  if (!target) return hydrated;

  await ensureReminderChannel();

  const now = Date.now();
  const tenMinBefore = new Date(target.getTime() - 10 * 60 * 1000);
  const notifications: LocalNotificationSchema[] = [];

  if (hydrated.alert10Min !== false && tenMinBefore.getTime() > now && Number.isInteger(notificationId1)) {
    notifications.push({
      id: notificationId1,
      title: reminderPromptCopy(hydrated.title),
      body: reminderPromptCopy(hydrated.title),
      channelId: REMINDER_CHANNEL_ID,
      extra: { reminderId: hydrated.id, kind: 'prior' },
      schedule: { at: tenMinBefore, allowWhileIdle: true },
    });
  }

  if (hydrated.alertExact !== false && target.getTime() > now && Number.isInteger(notificationId2)) {
    notifications.push({
      id: notificationId2,
      title: completionConfirmCopy(hydrated.title),
      body: completionConfirmCopy(hydrated.title),
      channelId: REMINDER_CHANNEL_ID,
      extra: { reminderId: hydrated.id, kind: 'exact' },
      schedule: { at: target, allowWhileIdle: true },
    });
  }

  if (notifications.length === 0) return hydrated;

  try {
    await LocalNotifications.schedule({ notifications });
  } catch (err) {
    console.warn('LocalNotifications.schedule failed:', err);
  }

  return hydrated;
}

export async function rescheduleAllReminderDualAlerts(reminders: StandaloneReminder[]): Promise<StandaloneReminder[]> {
  await requestNotificationPermissions();
  const hydrated = reminders.map(withReminderNotificationIds);
  for (const reminder of hydrated) {
    await cancelReminderDualAlerts(reminder);
  }
  const scheduled: StandaloneReminder[] = [];
  for (const reminder of hydrated) {
    scheduled.push(await scheduleReminderDualAlerts(reminder));
  }
  return scheduled;
}
