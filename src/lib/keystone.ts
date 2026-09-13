import { Habit, MomentumEvent } from '../types';
import { eventScore, habitWeight, resolveMomentumEventDate } from '../utils/momentum';
import { toISODate } from '../utils/dates';

export const MAX_KEYSTONE_HABITS = 2;
export const KEYSTONE_CORRELATION_MIN_DAYS_EACH = 3;
export const KEYSTONE_CORRELATION_MIN_SPAN = 7;

export function countActiveKeystones(habits: Habit[], exceptId?: string): number {
  return habits.filter((habit) => !habit.archived && habit.isKeystone && habit.id !== exceptId).length;
}

export function canEnableKeystone(habits: Habit[], habitId?: string): boolean {
  return countActiveKeystones(habits, habitId) < MAX_KEYSTONE_HABITS;
}

export function activeKeystoneHabits(habits: Habit[]): Habit[] {
  return habits.filter((habit) => !habit.archived && habit.isKeystone);
}

/** Week completion using the 7-day card projection (full or fallback counts). */
export function keystoneOverallCompletionRate(habits: Habit[]): number | null {
  const stones = activeKeystoneHabits(habits);
  if (stones.length === 0) return null;
  let done = 0;
  let total = 0;
  stones.forEach((habit) => {
    const days = habit.days || [];
    days.forEach((isDone, index) => {
      const scheduled = !habit.scheduledDays || habit.scheduledDays.length === 0 || habit.scheduledDays.includes(index);
      if (!scheduled) return;
      total += 1;
      if (isDone) done += 1;
    });
  });
  if (total === 0) return 0;
  return Math.round((done / total) * 100);
}

export interface KeystoneCorrelation {
  habitId: string;
  habitName: string;
  liftPercent: number;
  daysOn: number;
  daysOff: number;
}

function dailyOverallScore(habits: Habit[], events: MomentumEvent[], isoDate: string): number {
  const active = habits.filter((habit) => !habit.archived);
  if (active.length === 0) return 0;
  const best = new Map<string, number>();
  events.forEach((event) => {
    if (resolveMomentumEventDate(event) !== isoDate) return;
    const score = eventScore(event.eventType);
    const prev = best.get(event.habitId);
    if (prev === undefined || score > prev) best.set(event.habitId, score);
  });
  let weightedSum = 0;
  let weightTotal = 0;
  active.forEach((habit) => {
    const weight = habitWeight(habit);
    weightTotal += weight;
    weightedSum += weight * (best.get(habit.id) ?? 0);
  });
  if (weightTotal <= 0) return 0;
  return (weightedSum / weightTotal) * 100;
}

export function computeKeystoneCorrelation(
  habit: Habit,
  habits: Habit[],
  events: MomentumEvent[],
  todayIso: string = toISODate()
): KeystoneCorrelation | null {
  const dates = Array.from(
    new Set(
      events
        .map((event) => resolveMomentumEventDate(event))
        .filter((iso) => iso && iso !== todayIso)
    )
  ).sort();

  if (dates.length < KEYSTONE_CORRELATION_MIN_SPAN) return null;

  const onScores: number[] = [];
  const offScores: number[] = [];

  dates.forEach((iso) => {
    const keystoneDone = events.some(
      (event) =>
        event.habitId === habit.id &&
        resolveMomentumEventDate(event) === iso &&
        (event.eventType === 'full' || event.eventType === 'fallback')
    );
    const score = dailyOverallScore(habits, events, iso);
    if (keystoneDone) onScores.push(score);
    else offScores.push(score);
  });

  if (
    onScores.length < KEYSTONE_CORRELATION_MIN_DAYS_EACH ||
    offScores.length < KEYSTONE_CORRELATION_MIN_DAYS_EACH
  ) {
    return null;
  }

  const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
  const avgOn = mean(onScores);
  const avgOff = mean(offScores);
  if (avgOff <= 0) return null;

  return {
    habitId: habit.id,
    habitName: habit.name,
    liftPercent: Math.round(((avgOn - avgOff) / avgOff) * 100),
    daysOn: onScores.length,
    daysOff: offScores.length,
  };
}
