import { Capacitor } from '@capacitor/core';
import { LocalNotifications, type LocalNotificationSchema } from '@capacitor/local-notifications';
import { Preferences } from '@capacitor/preferences';
import { Habit, StandaloneReminder } from '../types';
import {
  chronicleReminderCopy,
  HABIT_TARGET_COPY_TEMPLATES,
  habitTargetBody,
  habitTargetCopy,
  reminderExactCopy,
  reminderPriorCopy,
} from '../services/notificationService';
import { normalizeTimeHHmm, reminderNotificationIds, weekdayFromIsoDate, withReminderNotificationIds } from './reminderIds';
import type { EveningChronicleSettings } from './chronicle';
import { CHRONICLE_REMINDER_DAYS, chronicleReminderTimes } from './chronicleReminder';
import { planPsychologyNotifications, psychologyNotificationIds } from './psychologySchedule';
import {
  habitTargetNotificationIds,
  legacyHabitTargetNotificationId,
  planHabitTargetNotifications,
} from './habitTargetSchedule';

export { reminderNotificationIds, weekdayFromIsoDate, withReminderNotificationIds };

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
export const NOTIFICATION_SMALL_ICON = 'ic_stat_notification';

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

/**
 * Whether this batch may ask for exact alarms. Only when the app already holds
 * exact-alarm access: a `schedule()` call that wants an exact alarm without it
 * makes the plugin (8.3+) open the "Alarms & reminders" settings screen on
 * Android 12+, and the app reschedules on nearly every habit change. Without
 * access, notifications go out inexact with allowWhileIdle.
 */
async function exactAlarmsAllowed(): Promise<boolean> {
  if (Capacitor.getPlatform() !== 'android') return false;
  try {
    const status = await LocalNotifications.checkExactNotificationSetting();
    return status.exact_alarm === 'granted';
  } catch {
    return false;
  }
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
    // Also clears the single daily-repeat notification older builds left at each base id.
    await LocalNotifications.cancel({
      notifications: psychologyNotificationIds().map((id) => ({ id })),
    });
  } catch {
    // Nothing pending, or plugin unavailable on web.
  }
}

// Module-level inflight guard: prevents concurrent calls from racing auth paths
// from showing the OS dialog more than once per app session.
let _permissionRequestInFlight: Promise<boolean> | null = null;

export async function requestNotificationPermissions(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;

  // If a request is already in flight, piggyback on it instead of firing again.
  if (_permissionRequestInFlight) return _permissionRequestInFlight;

  _permissionRequestInFlight = (async () => {
    try {
      // Check current status first — only prompt if the OS hasn't decided yet.
      const status = await LocalNotifications.checkPermissions();
      if (status.display === 'granted') return true;
      if (status.display !== 'prompt') return false;

      const result = await LocalNotifications.requestPermissions();
      return result.display === 'granted';
    } catch {
      return false;
    } finally {
      // Release the lock after a short delay so same-tick duplicate callers
      // are coalesced, but subsequent calls (e.g. after a settings change) go through.
      setTimeout(() => { _permissionRequestInFlight = null; }, 2000);
    }
  })();

  return _permissionRequestInFlight;
}

export async function initializeReminderNotifications(): Promise<boolean> {
  const granted = await requestNotificationPermissions();
  if (granted) await ensureReminderChannel();
  return granted;
}

export async function requestPsychologyNotificationAccess(): Promise<boolean> {
  return requestNotificationPermissions();
}

export async function schedulePsychologyNotifications(input: PsychologyScheduleInput): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;

  const enabled = input.windows.morning || input.windows.afternoon || input.windows.night;
  await cancelPsychologyNotifications();
  if (!enabled) return;

  const granted = await requestPsychologyNotificationAccess();
  if (!granted) return;

  await ensureChannel();

  // One-shots for the coming days rather than a daily repeat: see DAYS_QUEUED.
  const planned = planPsychologyNotifications(input.windows, input.habits, input.todayIndex);
  if (planned.length === 0) return;

  const exact = await exactAlarmsAllowed();
  try {
    await LocalNotifications.schedule({
      notifications: planned.map(({ id, title, body, at }) => ({
        id,
        title,
        body,
        channelId: CHANNEL_ID,
        smallIcon: NOTIFICATION_SMALL_ICON,
        isExactNotification: exact,
        schedule: { at, allowWhileIdle: true },
      })),
    });
  } catch {
    // Native scheduling can fail without notification permission.
  }
}

// One id per queued evening: 82000–82006 (clear of psychology 20300–20306 / 81000–81006 /
// 81300–81306, habit targets 100000–199999 and reminders 210000–909999).
const CHRONICLE_NOTIFICATION_BASE_ID = 82000;

async function cancelChronicleReminders(): Promise<void> {
  try {
    await LocalNotifications.cancel({
      notifications: Array.from({ length: CHRONICLE_REMINDER_DAYS }, (_, i) => ({
        id: CHRONICLE_NOTIFICATION_BASE_ID + i,
      })),
    });
  } catch {
    // Nothing pending, or plugin unavailable on web.
  }
}

/**
 * Queues the Evening Chronicle reminder for the coming evenings at the configured
 * time, replacing whatever was queued before. Tonight's is dropped once today's
 * entry is saved; everything is cancelled when the feature is off.
 */
export async function scheduleChronicleReminders(
  settings: EveningChronicleSettings,
  completedToday: boolean
): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;

  await cancelChronicleReminders();
  const times = chronicleReminderTimes(settings, completedToday);
  if (times.length === 0) return;

  const granted = await requestNotificationPermissions();
  if (!granted) return;

  await ensureChannel();

  const copy = chronicleReminderCopy();
  const exact = await exactAlarmsAllowed();
  try {
    await LocalNotifications.schedule({
      notifications: times.map((at, i) => ({
        id: CHRONICLE_NOTIFICATION_BASE_ID + i,
        title: copy.title,
        body: copy.body,
        channelId: CHANNEL_ID,
        smallIcon: NOTIFICATION_SMALL_ICON,
        extra: { kind: 'chronicle' },
        isExactNotification: exact,
        schedule: { at, allowWhileIdle: true },
      })),
    });
  } catch (err) {
    console.warn('LocalNotifications.schedule chronicle failed:', err);
  }
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

  // Explicit permission prompt on schedule / toggle-on (uses idempotent guard).
  const granted = await requestNotificationPermissions();
  if (!granted) return hydrated;

  const target = parseReminderTarget(hydrated);
  if (!target) return hydrated;

  await ensureReminderChannel();

  const exactAlarms = await exactAlarmsAllowed();
  const now = Date.now();
  const tenMinBefore = new Date(target.getTime() - 10 * 60 * 1000);
  const notifications: LocalNotificationSchema[] = [];

  if (hydrated.alert10Min !== false && tenMinBefore.getTime() > now && Number.isInteger(notificationId1)) {
    const prior = reminderPriorCopy(hydrated.title);
    notifications.push({
      id: notificationId1,
      title: prior.title,
      body: prior.body,
      channelId: REMINDER_CHANNEL_ID,
      smallIcon: NOTIFICATION_SMALL_ICON,
      extra: { reminderId: hydrated.id, kind: 'prior' },
      isExactNotification: exactAlarms,
      schedule: { at: tenMinBefore, allowWhileIdle: true },
    });
  }

  if (hydrated.alertExact !== false && target.getTime() > now && Number.isInteger(notificationId2)) {
    const exact = reminderExactCopy(hydrated.title);
    notifications.push({
      id: notificationId2,
      title: exact.title,
      body: exact.body,
      channelId: REMINDER_CHANNEL_ID,
      smallIcon: NOTIFICATION_SMALL_ICON,
      extra: { reminderId: hydrated.id, kind: 'exact' },
      isExactNotification: exactAlarms,
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

/**
 * Habit heads-up work runs one call at a time per habit: a cancel-all followed
 * by a reschedule must never interleave with another call's (for example a
 * completion landing while a sync reschedules), or a stale alarm could survive.
 */
const habitTargetChains = new Map<string, Promise<void>>();

function serializeForHabit(habitId: string, work: () => Promise<void>): Promise<void> {
  const next = (habitTargetChains.get(habitId) ?? Promise.resolve()).then(work, work);
  habitTargetChains.set(habitId, next);
  void next.finally(() => {
    if (habitTargetChains.get(habitId) === next) habitTargetChains.delete(habitId);
  });
  return next;
}

async function cancelHabitTargetIds(habitId: string): Promise<void> {
  try {
    await LocalNotifications.cancel({
      notifications: [...habitTargetNotificationIds(habitId), legacyHabitTargetNotificationId(habitId)].map((id) => ({
        id,
      })),
    });
  } catch {
    // Nothing pending, or plugin unavailable on web.
  }
}

/** Cancel every queued heads-up of this habit (archived, deleted, signed out). */
export async function cancelHabitTargetTimeNotification(habitId: string): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  await serializeForHabit(habitId, () => cancelHabitTargetIds(habitId));
}

export { HABIT_TARGET_COPY_TEMPLATES };

/**
 * Queue this habit's heads-ups for the coming days (see planHabitTargetNotifications),
 * replacing whatever was queued. With `completedToday`, today's is dropped and the
 * following days stay queued, so the reminder keeps firing on days the app isn't opened.
 */
export async function scheduleHabitTargetTimeNotification(habit: Habit, completedToday = false): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  await serializeForHabit(habit.id, async () => {
    await cancelHabitTargetIds(habit.id);
    const planned = planHabitTargetNotifications(habit, completedToday);
    if (planned.length === 0) return;

    try {
      const granted = await requestNotificationPermissions();
      if (!granted) return;

      await ensureChannel();

      const targetPayload = habitTargetCopy(habit);
      const exact = await exactAlarmsAllowed();

      await LocalNotifications.schedule({
        notifications: planned.map(({ id, at }) => {
          const body = habitTargetBody(habit);
          return {
            id,
            title: targetPayload.title,
            body,
            // Android collapses to one line; the expanded view shows the full purpose.
            largeBody: body,
            channelId: CHANNEL_ID,
            smallIcon: NOTIFICATION_SMALL_ICON,
            extra: { habitId: habit.id, kind: 'habit_target' },
            isExactNotification: exact,
            schedule: { at, allowWhileIdle: true },
          };
        }),
      });
    } catch (err) {
      console.warn('LocalNotifications.schedule habit target failed:', err);
    }
  });
}

export async function syncAllHabitTargetNotifications(habits: Habit[], todayDayIndex: number): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  for (const habit of habits) {
    if (!habit.targetTime || habit.archived) {
      await cancelHabitTargetTimeNotification(habit.id);
      continue;
    }
    // Each queued day checks the habit's own schedule; today also checks completion.
    await scheduleHabitTargetTimeNotification(habit, Boolean(habit.days?.[todayDayIndex]));
  }
}
