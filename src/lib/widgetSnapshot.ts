import type { Habit, HabitCompletionEvent, MomentumEvent, StandaloneReminder } from '../types';
import { hasTodayLedgerEntry } from '../services/ledgerService';
import { addDaysIso, dayIndexForIso, localMidnightOf, resolveEventIsoDate, toISODate } from '../utils/dates';
import { eventScore, habitWeight, resolveMomentumEventDate } from '../utils/momentumCore';
import { isHabitScheduledOnIso, scheduledHabitsForDayIndex } from '../utils/schedule';
import { formatTargetTimeDisplay } from '../utils/timeFormat';
import { SLEEP_TARGET_HOURS } from './sleepTarget';

/**
 * What the home-screen widgets show, built from the ledger. Pure: widgetSync
 * publishes it to the native side.
 */

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
  targetTime?: string;
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
  /**
   * The same view for the next day, nothing done yet: the widget switches to it
   * after midnight without the app running (one level deep only).
   */
  next?: WidgetSnapshot;
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
  graceHabitIds?: string[] | ReadonlySet<string>;
}

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

function habitStreak(
  habit: Habit,
  iso: string,
  momentumEvents: MomentumEvent[],
  completionEvents: HabitCompletionEvent[],
  graceHabitIds?: string[] | ReadonlySet<string>
): number {
  let streak = 0;
  const graceSet = graceHabitIds
    ? Array.isArray(graceHabitIds)
      ? new Set(graceHabitIds)
      : graceHabitIds
    : null;
  const yesterdayIso = addDaysIso(iso, -1);
  for (let offset = 0; offset < 60; offset += 1) {
    const day = addDaysIso(iso, -offset);
    if (!isHabitScheduledOnIso(habit, day)) {
      continue;
    }
    const score = bestScoreOnIso(habit.id, day, momentumEvents, completionEvents);
    if (score <= 0) {
      if (offset === 0) continue;
      // If yesterday is within 24h grace window for this habit, keep streak intact
      if (offset === 1 && day === yesterdayIso && graceSet?.has(habit.id)) {
        continue;
      }
      break;
    }
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
  const liveHabitIds = new Set(habits.map((habit) => habit.id));
  const todayHabitIds = new Set<string>();
  momentumEvents.forEach((event) => {
    if (event.eventType !== 'full' && event.eventType !== 'fallback') return;
    if (!liveHabitIds.has(event.habitId)) return;
    if (resolveMomentumEventDate(event) !== todayIso) return;
    todayHabitIds.add(event.habitId);
  });
  const doneSet = todayHabitIds;
  const points = todayHabitIds.size;
  const byStatement = new Map<string, { done: number; scheduled: number }>();

  habits
    .filter((habit) => !habit.archived)
    .forEach((habit) => {
      const label = (habit.name || 'Identity').trim();
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

/** Today's snapshot plus the precomputed view of the next day (`next`). */
export function buildWidgetSnapshot(input: WidgetSnapshotInput): WidgetSnapshot {
  const today = buildDaySnapshot(input);
  const nextIso = addDaysIso(today.todayIso, 1);
  const nextOrigin = localMidnightOf(nextIso) ?? new Date(Date.now() + 24 * 60 * 60 * 1000);
  const next = buildDaySnapshot({
    ...input,
    todayIso: nextIso,
    origin: nextOrigin,
    todayDayIndex: dayIndexForIso(nextIso, nextOrigin),
    sleepTodayHours: null,
  });
  return { ...today, next };
}

function buildDaySnapshot(input: WidgetSnapshotInput): WidgetSnapshot {
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
      const aTimed = a.time && String(a.time).trim() ? 0 : 1;
      const bTimed = b.time && String(b.time).trim() ? 0 : 1;
      if (aTimed !== bTimed) return aTimed - bTimed;
      return `${a.date}${a.time || ''}`.localeCompare(`${b.date}${b.time || ''}`);
    })
    .slice(0, 5)
    .map((item) => ({
      id: item.id,
      title: item.title,
      time: formatReminderTime(item.time),
      completed: Boolean(item.completed),
    }));

  const habits = scheduledToday.map((habit) => ({
    id: habit.id,
    title: habit.name,
    completed: hasTodayLedgerEntry(input.completionEvents, habit.id, todayIso, origin),
    streak: habitStreak(habit, todayIso, input.momentumEvents, input.completionEvents, input.graceHabitIds),
    targetTime: formatTargetTimeDisplay(habit.targetTime),
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
