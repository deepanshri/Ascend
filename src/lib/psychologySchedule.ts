import { Habit } from '../types';
import { afternoonFocusCopy, morningMomentumCopy, nightWrapUpCopy } from '../services/notificationService';
import { isHabitScheduledOnDayIndex, isHabitScheduledOnWeekday, weekdayMon0FromDate } from '../utils/schedule';
import { DAYS_QUEUED, upcomingDailySlots } from './dailyTimes';

export type PsychologyWindowKey = 'morning' | 'afternoon' | 'night';

export const PSYCHOLOGY_WINDOWS: Record<PsychologyWindowKey, { baseId: number; hour: number; minute: number }> = {
  morning: { baseId: 81000, hour: 6, minute: 0 },
  afternoon: { baseId: 81300, hour: 13, minute: 30 },
  night: { baseId: 20300, hour: 20, minute: 30 },
};

/** Every id a window can occupy: baseId (the old daily repeat's id) through baseId + DAYS_QUEUED - 1. */
export function psychologyNotificationIds(): number[] {
  return Object.values(PSYCHOLOGY_WINDOWS).flatMap(({ baseId }) =>
    Array.from({ length: DAYS_QUEUED }, (_, i) => baseId + i)
  );
}

export interface PlannedNotification {
  id: number;
  title: string;
  body: string;
  at: Date;
}

interface DayHabits {
  scheduled: Habit[];
  /** Scheduled and not yet checked off. */
  open: Habit[];
  active: Habit[];
}

/**
 * Habits due on the day `offset` days from today. Today reads its check-offs;
 * later days have nothing checked off yet.
 */
function dayHabits(habits: Habit[], todayIndex: number, offset: number, at: Date): DayHabits {
  const active = habits.filter((habit) => !habit.archived);
  if (offset === 0) {
    const scheduled = active.filter((habit) => isHabitScheduledOnDayIndex(habit, todayIndex));
    return { scheduled, open: scheduled.filter((habit) => !habit.days?.[todayIndex]), active };
  }
  const weekday = weekdayMon0FromDate(at);
  const scheduled = active.filter((habit) => isHabitScheduledOnWeekday(habit, weekday));
  return { scheduled, open: scheduled, active };
}

function featuredName(day: DayHabits): string {
  const featured = day.scheduled.find((habit) => habit.priority === 'high') || day.scheduled[0] || day.active[0];
  return featured?.name?.trim() || 'your habit';
}

function windowCopy(key: PsychologyWindowKey, day: DayHabits): { title: string; body: string } {
  if (key === 'morning') return morningMomentumCopy(featuredName(day));
  const name = day.open[0]?.name?.trim() || featuredName(day);
  return key === 'afternoon' ? afternoonFocusCopy(name, day.open.length) : nightWrapUpCopy(name, day.open.length);
}

/**
 * The morning / afternoon / night nudges for the coming DAYS_QUEUED days, as
 * one-shot notifications. Each day's copy reflects that day's habits.
 */
export function planPsychologyNotifications(
  windows: Record<PsychologyWindowKey, boolean>,
  habits: Habit[],
  todayIndex: number,
  now: Date = new Date()
): PlannedNotification[] {
  const planned: PlannedNotification[] = [];
  for (const key of Object.keys(PSYCHOLOGY_WINDOWS) as PsychologyWindowKey[]) {
    if (!windows[key]) continue;
    const { baseId, hour, minute } = PSYCHOLOGY_WINDOWS[key];
    for (const { offset, at } of upcomingDailySlots(hour, minute, now)) {
      const copy = windowCopy(key, dayHabits(habits, todayIndex, offset, at));
      planned.push({ id: baseId + offset, title: copy.title, body: copy.body, at });
    }
  }
  return planned;
}
