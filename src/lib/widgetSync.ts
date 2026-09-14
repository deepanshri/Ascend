import { Preferences } from '@capacitor/preferences';
import { Habit, HabitCompletionEvent, MomentumEvent, StandaloneReminder } from '../types';
import { hasTodayLedgerEntry } from '../services/ledgerService';
import { addDaysIso, resolveEventIsoDate, toISODate } from '../utils/dates';
import { eventScore, habitWeight, resolveMomentumEventDate } from '../utils/momentum';
import { isHabitScheduledOnIso, scheduledHabitsForDayIndex } from '../utils/schedule';
import { SLEEP_TARGET_HOURS } from './health';
import { WidgetBridge, type WidgetPendingAction } from './widgetBridge';

export const WIDGET_DATA_KEY = 'ascend_widget_data';
export const WIDGET_SCHEME = 'ascend';

export interface WidgetPayload {
  score: number;
  habitsCompleted: number;
  totalHabits: number;
  lastUpdated: string;
}

export interface WidgetReminderItem {
  id: string;
  title: string;
  time: string;
  completed: boolean;
}

export interface WidgetHabitItem {
  id: string;
  title: string;
  completed: boolean;
  streak: number;
}

export interface WidgetIdentityLine {
  label: string;
  detail: string;
}

export interface WidgetSnapshot extends WidgetPayload {
  version: 1;
  todayIso: string;
  dark: boolean;
  workRate: number;
  selfRate: number;
  sleepRate: number | null;
  reminders: WidgetReminderItem[];
  habits: WidgetHabitItem[];
  identity: {
    points: number;
    lines: WidgetIdentityLine[];
  };
}

export interface WidgetSnapshotInput {
  todayIso?: string;
  todayDayIndex: number;
  origin?: Date;
  dark: boolean;
  momentumScore: number;
  habits: Habit[];
  reminders: StandaloneReminder[];
  momentumEvents: MomentumEvent[];
  completionEvents: HabitCompletionEvent[];
  sleepTodayHours?: number | null;
}

export type WidgetRoute =
  | { tab: 'report' }
  | { tab: 'reminders'; reminderId?: string }
  | { tab: 'home'; habitId?: string }
  | { tab: 'ledger' };

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function bestScoreOnIso(
  habitId: string,
  iso: string,
  momentumEvents: MomentumEvent[],
  completionEvents: HabitCompletionEvent[]
): number {
  let best = 0;
  for (const event of momentumEvents) {
    if (event.habitId !== habitId) continue;
    if (resolveMomentumEventDate(event) !== iso) continue;
    best = Math.max(best, eventScore(event.eventType));
  }
  for (const event of completionEvents) {
    if (event.habitId !== habitId) continue;
    if (resolveEventIsoDate(event) !== iso) continue;
    best = Math.max(best, event.type === 'fallback_micro' ? 0.5 : 1);
  }
  return best;
}

function categoryRate(
  habits: Habit[],
  category: Habit['category'],
  iso: string,
  momentumEvents: MomentumEvent[],
  completionEvents: HabitCompletionEvent[]
): number {
  const list = habits.filter((habit) => !habit.archived && habit.category === category);
  let weightTotal = 0;
  let weightedSum = 0;
  list.forEach((habit) => {
    if (!isHabitScheduledOnIso(habit, iso)) return;
    const weight = habitWeight(habit);
    weightTotal += weight;
    weightedSum += weight * bestScoreOnIso(habit.id, iso, momentumEvents, completionEvents);
  });
  return weightTotal <= 0 ? 0 : weightedSum / weightTotal;
}

function habitStreak(habit: Habit, iso: string, momentumEvents: MomentumEvent[], completionEvents: HabitCompletionEvent[]): number {
  let streak = 0;
  for (let offset = 0; offset < 60; offset += 1) {
    const day = addDaysIso(iso, -offset);
    if (!isHabitScheduledOnIso(habit, day)) {
      if (offset === 0) continue;
      break;
    }
    if (bestScoreOnIso(habit.id, day, momentumEvents, completionEvents) <= 0) break;
    streak += 1;
  }
  return streak;
}

function formatReminderTime(time?: string): string {
  const raw = String(time || '').trim();
  if (!raw) return 'Anytime';
  const match = raw.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return raw;
  const hour = Number(match[1]);
  const minute = match[2];
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour12}:${minute} ${suffix}`;
}

export function buildTodaysIdentityLedger(
  habits: Habit[],
  _completionEvents: HabitCompletionEvent[],
  todayIso: string,
  _origin?: Date,
  momentumEvents: MomentumEvent[] = []
): { points: number; lines: WidgetIdentityLine[] } {
  const todayHabitIds = new Set<string>();
  momentumEvents.forEach((event) => {
    if (event.eventType !== 'full' && event.eventType !== 'fallback') return;
    if (resolveMomentumEventDate(event) !== todayIso) return;
    todayHabitIds.add(event.habitId);
  });
  const doneSet = todayHabitIds;
  const points = todayHabitIds.size;
  const byStatement = new Map<string, { done: number; scheduled: number }>();

  habits
    .filter((habit) => !habit.archived)
    .forEach((habit) => {
      const label = (habit.identityStatement || habit.name || 'Identity').trim();
      const scheduled = isHabitScheduledOnIso(habit, todayIso);
      const done = doneSet.has(habit.id);
      if (!scheduled && !done) return;
      const current = byStatement.get(label) || { done: 0, scheduled: 0 };
      if (scheduled) current.scheduled += 1;
      if (done) current.done += 1;
      byStatement.set(label, current);
    });

  const lines = Array.from(byStatement.entries())
    .map(([label, counts]) => ({
      label,
      detail: `${counts.done}/${Math.max(counts.scheduled, counts.done)} habits`,
    }))
    .filter((line) => line.detail !== '0/0 habits')
    .slice(0, 2);

  return { points, lines };
}

export function buildWidgetSnapshot(input: WidgetSnapshotInput): WidgetSnapshot {
  const todayIso = input.todayIso || toISODate(input.origin ?? new Date());
  const origin = input.origin ?? new Date();
  const active = input.habits.filter((habit) => !habit.archived);
  const scheduledToday = scheduledHabitsForDayIndex(active, input.todayDayIndex, origin);
  const habitsCompleted = scheduledToday.filter((habit) =>
    hasTodayLedgerEntry(input.completionEvents, habit.id, todayIso, origin)
  ).length;

  const reminders = (input.reminders || [])
    .filter((item) => !item.deleted)
    .sort((a, b) => {
      if (a.completed !== b.completed) return a.completed ? 1 : -1;
      return `${a.date}${a.time || ''}`.localeCompare(`${b.date}${b.time || ''}`);
    })
    .slice(0, 5)
    .map((item) => ({
      id: item.id,
      title: item.title,
      time: formatReminderTime(item.time),
      completed: Boolean(item.completed),
    }));

  const habits = scheduledToday.slice(0, 5).map((habit) => ({
    id: habit.id,
    title: habit.name,
    completed: hasTodayLedgerEntry(input.completionEvents, habit.id, todayIso, origin),
    streak: habitStreak(habit, todayIso, input.momentumEvents, input.completionEvents),
  }));

  const sleepRate =
    input.sleepTodayHours == null ? null : clamp01(input.sleepTodayHours / SLEEP_TARGET_HOURS);

  return {
    version: 1,
    todayIso,
    dark: input.dark,
    score: Math.round(input.momentumScore),
    habitsCompleted,
    totalHabits: scheduledToday.length,
    lastUpdated: new Date().toISOString(),
    workRate: clamp01(categoryRate(active, 'work', todayIso, input.momentumEvents, input.completionEvents)),
    selfRate: clamp01(
      categoryRate(active, 'self_improvement', todayIso, input.momentumEvents, input.completionEvents)
    ),
    sleepRate,
    reminders,
    habits,
    identity: buildTodaysIdentityLedger(active, input.completionEvents, todayIso, origin, input.momentumEvents),
  };
}

export async function syncWidgetData(payload: WidgetPayload | WidgetSnapshot): Promise<void> {
  const serialized = JSON.stringify(payload);

  try {
    localStorage.setItem(WIDGET_DATA_KEY, serialized);
  } catch {
    // Web storage can be unavailable in private mode.
  }

  try {
    await Preferences.set({ key: WIDGET_DATA_KEY, value: serialized });
  } catch {
    // Preferences plugin is a no-op when native storage is unavailable.
  }

  try {
    await WidgetBridge.sync({ payload: serialized });
  } catch {
    // Native widget bridge is absent on web.
  }
}

export async function publishWidgetSnapshot(input: WidgetSnapshotInput): Promise<WidgetSnapshot> {
  const snapshot = buildWidgetSnapshot(input);
  await syncWidgetData(snapshot);
  return snapshot;
}

export async function consumeWidgetActions(): Promise<WidgetPendingAction[]> {
  try {
    const result = await WidgetBridge.consumeActions();
    return Array.isArray(result.actions) ? result.actions : [];
  } catch {
    return [];
  }
}

export function parseWidgetRoute(url?: string | null): WidgetRoute | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== `${WIDGET_SCHEME}:`) return null;
    const path = `${parsed.host}${parsed.pathname}`.replace(/\/+$/, '').replace(/^\/+/, '');
    const reminderId = parsed.searchParams.get('id') || parsed.searchParams.get('reminder') || undefined;
    const habitId = parsed.searchParams.get('habit') || parsed.searchParams.get('habitId') || undefined;
    if (path === 'app/report' || path === 'report') return { tab: 'report' };
    if (path === 'app/reminders' || path === 'reminders') return { tab: 'reminders', reminderId };
    if (path === 'app/ledger' || path === 'ledger') return { tab: 'ledger' };
    if (path === 'app/home' || path === 'home' || path === 'app') return { tab: 'home', habitId };
    return null;
  } catch {
    return null;
  }
}

export async function readLaunchWidgetRoute(): Promise<WidgetRoute | null> {
  try {
    const result = await WidgetBridge.getLaunchRoute();
    return parseWidgetRoute(result.url);
  } catch {
    return null;
  }
}

export type { WidgetPendingAction } from './widgetBridge';
