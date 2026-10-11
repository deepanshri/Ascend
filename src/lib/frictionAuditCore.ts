import { FrictionAudit, Habit } from '../types';

/** Pure friction-audit rules; lib/frictionAudit.ts adds the stored prompted-keys log. */

export interface PendingFrictionPrompt {
  habitId: string;
  habitName: string;
  loggedDate: string;
}

export function frictionPromptKey(habitId: string, loggedDate: string): string {
  return `${habitId}|${loggedDate}`;
}

/** Append prompts not already queued (callers drop ones already answered first). */
export function appendFrictionPrompts(
  current: PendingFrictionPrompt[],
  incoming: PendingFrictionPrompt[]
): PendingFrictionPrompt[] {
  const seen = new Set(current.map((item) => frictionPromptKey(item.habitId, item.loggedDate)));
  const next = [...current];
  incoming.forEach((item) => {
    const key = frictionPromptKey(item.habitId, item.loggedDate);
    if (seen.has(key)) return;
    seen.add(key);
    next.push(item);
  });
  return next.length === current.length ? current : next;
}

export function createMissedFrictionAudit(
  prompt: PendingFrictionPrompt,
  reason: string,
  now: number = Date.now()
): FrictionAudit {
  const day = new Date(`${prompt.loggedDate}T12:00:00`);
  return {
    id: `fa-${prompt.habitId}-${prompt.loggedDate}`,
    date: day.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    dayNumber: Number.isNaN(day.getTime()) ? 1 : day.getDay() === 0 ? 7 : day.getDay(),
    habitName: prompt.habitName,
    habitId: prompt.habitId,
    loggedDate: prompt.loggedDate,
    type: 'missed',
    reason,
    note: reason,
    timestamp: now,
  };
}

export function mergeFrictionAuditsFromLogs(
  current: FrictionAudit[],
  rows: Array<{ habitId: string; loggedDate: string; reason: string }>,
  habits: Habit[],
  now: number = Date.now()
): FrictionAudit[] {
  const byKey = new Map<string, FrictionAudit>();
  current.forEach((item) => {
    const key = item.habitId && item.loggedDate
      ? frictionPromptKey(item.habitId, item.loggedDate)
      : item.id;
    byKey.set(key, item);
  });
  const names = new Map(habits.map((habit) => [habit.id, habit.name]));
  rows.forEach((row) => {
    if (!row.reason?.trim()) return;
    const key = frictionPromptKey(row.habitId, row.loggedDate);
    if (byKey.has(key)) return;
    const prompt: PendingFrictionPrompt = {
      habitId: row.habitId,
      habitName: names.get(row.habitId) || 'Habit',
      loggedDate: row.loggedDate,
    };
    byKey.set(key, createMissedFrictionAudit(prompt, row.reason.trim(), now));
  });
  return Array.from(byKey.values()).sort((a, b) => b.timestamp - a.timestamp);
}
