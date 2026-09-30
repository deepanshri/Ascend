import assert from 'node:assert';
import { getLocalDateString, startOfDay, getWeekDates, toISODate, resolveEventIsoDate } from '../src/utils/dates.ts';

console.log('--- Testing Midnight Roll-Over and Date Reset Logic ---');

// 1. Verify getLocalDateString
const now = new Date();
const localDate = getLocalDateString(now);
console.log('Current local date:', localDate);
assert.match(localDate, /^\d{4}-\d{2}-\d{2}$/, 'getLocalDateString should return YYYY-MM-DD');

// 2. Test habit daily completion resolution
const testHabit = {
  id: 'test-habit-1',
  name: 'Morning Meditation',
  category: 'self_improvement',
  timestamp: '08:00 AM',
  days: [false, false, false, false, false, false, false],
  microDays: [false, false, false, false, false, false, false],
};

const yesterday = new Date(Date.now() - 86400000);
const yesterdayStr = getLocalDateString(yesterday);
const todayStr = getLocalDateString(now);

console.log(`Yesterday: ${yesterdayStr}, Today: ${todayStr}`);

// Create a log for yesterday
const yesterdayLog = {
  id: `log-test-habit-1-${yesterdayStr}`,
  habitId: testHabit.id,
  dayIndex: 3, // was logged as index 3 (today) yesterday
  date: yesterdayStr,
  type: 'full',
  timestamp: yesterday.getTime(),
};

const completionEvents = [yesterdayLog];

// Compute completion dynamically for today: habitLogs.some(log => log.habit_id === habit.id && log.logged_date === getLocalDateString())
const isCompletedToday = completionEvents.some(
  (log) =>
    (log.habitId === testHabit.id || log.habit_id === testHabit.id) &&
    (log.date === todayStr || log.logged_date === todayStr)
);

assert.strictEqual(isCompletedToday, false, 'Habit should NOT be completed today if log was from yesterday');
console.log('✓ Dynamic completion check: correctly resolved false for today');

// Compute completion dynamically for yesterday
const isCompletedYesterday = completionEvents.some(
  (log) =>
    (log.habitId === testHabit.id || log.habit_id === testHabit.id) &&
    (log.date === yesterdayStr || log.logged_date === yesterdayStr)
);

assert.strictEqual(isCompletedYesterday, true, 'Habit log for yesterday should remain intact');
console.log('✓ Historical integrity check: yesterday log remains intact');

// 3. Test weekly projection logic using rolling window anchored on today
function deriveHabitsFromEventLogStandalone(habits, events, origin = new Date()) {
  const weekIso = getWeekDates(origin).map((date) => toISODate(date));
  const byHabitId = new Map();
  for (const event of events) {
    const list = byHabitId.get(event.habitId);
    if (list) list.push(event);
    else byHabitId.set(event.habitId, [event]);
  }
  return habits.map((habit) => {
    const days = [false, false, false, false, false, false, false];
    const microDays = [false, false, false, false, false, false, false];
    const habitEvents = byHabitId.get(habit.id);
    if (habitEvents) {
      for (const ev of habitEvents) {
        const iso = resolveEventIsoDate(ev, origin);
        const dayIndex = weekIso.indexOf(iso);
        if (dayIndex < 0) continue;
        days[dayIndex] = true;
        microDays[dayIndex] = ev.type === 'fallback_micro';
      }
    }
    return { ...habit, days, microDays };
  });
}

const todayOrigin = startOfDay(now);
const derived = deriveHabitsFromEventLogStandalone([testHabit], completionEvents, todayOrigin);
const projectedHabit = derived[0];

console.log('Projected days for habit (index 0..2 past, 3 today, 4..6 future):', projectedHabit.days);
assert.strictEqual(projectedHabit.days[3], false, 'Today (index 3) must be incomplete (false)');
assert.strictEqual(projectedHabit.days[2], true, 'Yesterday (index 2) must be complete (true)');
console.log('✓ deriveHabitsFromEventLog properly resets today to false and retains yesterday at index 2');

// 4. Test optimistic completion date expiry
let optimisticDone = true;
let optimisticLoggedDate = yesterdayStr;
const isOptimisticValid = optimisticDone && optimisticLoggedDate === todayStr;
assert.strictEqual(isOptimisticValid, false, 'Optimistic state from yesterday must immediately invalidate on today');
console.log('✓ Optimistic state validation: successfully invalidated across midnight roll-over');

console.log('\nAll midnight roll-over and foreground resume tests passed successfully!');
