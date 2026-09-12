import { Habit, HabitCompletionEvent, TODAY_DAY_INDEX } from '../types';

/**
 * Replays the immutable append-only event log to reconstruct the habit's
 * weekly projection (days, microDays).
 * This guarantees that past days cannot be retroactively modified or gamed.
 */
export function deriveHabitsFromEventLog(
  habits: Habit[],
  events: HabitCompletionEvent[],
  todayIndex: number = TODAY_DAY_INDEX
): Habit[] {
  return habits.map((habit) => {
    const days = [false, false, false, false, false, false, false];
    const microDays = [false, false, false, false, false, false, false];

    // Replay all events recorded for this habit
    const habitEvents = events.filter((e) => e.habitId === habit.id);
    for (const ev of habitEvents) {
      if (ev.dayIndex >= 0 && ev.dayIndex < 7) {
        days[ev.dayIndex] = true;
        if (ev.type === 'fallback_micro') {
          microDays[ev.dayIndex] = true;
        }
      }
    }

    return {
      ...habit,
      days,
      microDays,
    };
  });
}

/**
 * Ascend Momentum Formula:
 * - 100% credit for full completions (1.0)
 * - 50% credit for micro-habit fallbacks (0.5)
 * - Decay mechanism: Missed days gently decay momentum (e.g. 10-15%) rather than zero-reset drop
 * - Preserves baseline identity momentum without fragile all-or-nothing mechanics
 */
export function calculateMomentumScore(
  habits: Habit[],
  dayIndex: number = 3,
  examShield: boolean = false
): number {
  const activeHabits = habits.filter((h) => !h.archived);
  if (!activeHabits || activeHabits.length === 0) return 0;

  // 1. Today's execution rate (50% for fallback micro-habits, 100% for full)
  let todayPoints = 0;
  let scheduledTodayCount = 0;

  activeHabits.forEach((h) => {
    // Check if habit is scheduled for this day
    const isScheduled = !h.scheduledDays || h.scheduledDays.includes(dayIndex);
    if (isScheduled) {
      scheduledTodayCount += 1;
    }

    const isDone = h.days?.[dayIndex] ?? false;
    const isMicro = h.microDays?.[dayIndex] ?? false;
    if (isDone) {
      // 50% partial credit for fallback micro-habit, 100% for full completion
      todayPoints += isMicro ? 0.5 : 1.0;
    }
  });

  const effectiveTodayTotal = scheduledTodayCount > 0 ? scheduledTodayCount : activeHabits.length;
  const todayRatio = Math.min(1, todayPoints / effectiveTodayTotal);

  // 2. Recent 7-day consistency with gentle decay for missed days
  let totalCompletions = 0;
  let totalPossible = 0;
  let consecutiveMisses = 0;

  activeHabits.forEach((h) => {
    h.days.forEach((done, dIdx) => {
      totalPossible += 1;
      if (done) {
        const isMicro = h.microDays?.[dIdx] ?? false;
        totalCompletions += isMicro ? 0.5 : 1.0;
      }
    });

    // Check if today was missed to compute decay
    if (!h.days?.[dayIndex]) {
      consecutiveMisses += 1;
    }
  });

  const weeklyRatio = totalPossible > 0 ? totalCompletions / totalPossible : 0;

  // 3. Gentle decay factor: each missed habit today applies a tiny 2% decay factor (max 15% decay)
  // Ensures momentum never drops to 0 immediately
  // If Exam Shield / Vacation Mode is active, decay is frozen (decayFactor = 1.0)
  const missRatio = activeHabits.length > 0 ? consecutiveMisses / activeHabits.length : 0;
  const decayFactor = examShield ? 1.0 : 1 - Math.min(0.15, missRatio * 0.15);

  // 4. Consistency momentum & identity foundation
  const consistencyBonus = weeklyRatio * 15;
  const baseFoundation = todayRatio > 0 ? 20 : 10;

  const rawScore = (baseFoundation + todayRatio * 45 + weeklyRatio * 20 + consistencyBonus) * decayFactor;

  return Math.min(100, Math.max(0, Math.round(rawScore)));
}
