import { FrictionAudit, Habit } from '../types';

export const FRICTION_REASON_CHIPS = [
  'Time Constraint',
  'Low Energy',
  'Unexpected Blocker',
  'System Friction',
] as const;

export type FrictionReasonChip = (typeof FRICTION_REASON_CHIPS)[number];

export interface PendingFrictionPrompt {
  habitId: string;
  habitName: string;
  loggedDate: string;
}

const PENDING_KEY = 'ascend_pending_friction_audits';
const PROMPTED_KEY = 'ascend_friction_prompted_keys';

export function frictionPromptKey(habitId: string, loggedDate: string): string {
  return `${habitId}|${loggedDate}`;
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Quota / private-mode: best-effort.
  }
}

export function loadPendingFrictionPrompts(): PendingFrictionPrompt[] {
  const parsed = readJson<PendingFrictionPrompt[]>(PENDING_KEY, []);
  return Array.isArray(parsed) ? parsed : [];
}

export function savePendingFrictionPrompts(prompts: PendingFrictionPrompt[]): void {
  writeJson(PENDING_KEY, prompts);
}

function loadPromptedKeys(): Set<string> {
  const parsed = readJson<string[]>(PROMPTED_KEY, []);
  return new Set(Array.isArray(parsed) ? parsed : []);
}

function savePromptedKeys(keys: Set<string>): void {
  writeJson(PROMPTED_KEY, Array.from(keys));
}

export function wasFrictionPrompted(habitId: string, loggedDate: string): boolean {
  return loadPromptedKeys().has(frictionPromptKey(habitId, loggedDate));
}

export function markFrictionPrompted(habitId: string, loggedDate: string): void {
  const keys = loadPromptedKeys();
  keys.add(frictionPromptKey(habitId, loggedDate));
  savePromptedKeys(keys);
}

export function enqueueFrictionPrompts(
  current: PendingFrictionPrompt[],
  incoming: PendingFrictionPrompt[]
): PendingFrictionPrompt[] {
  const seen = new Set(current.map((item) => frictionPromptKey(item.habitId, item.loggedDate)));
  const next = [...current];
  incoming.forEach((item) => {
    const key = frictionPromptKey(item.habitId, item.loggedDate);
    if (seen.has(key) || wasFrictionPrompted(item.habitId, item.loggedDate)) return;
    seen.add(key);
    next.push(item);
  });
  return next;
}

export function createMissedFrictionAudit(
  prompt: PendingFrictionPrompt,
  reason: string
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
    timestamp: Date.now(),
  };
}

export function mergeFrictionAuditsFromLogs(
  current: FrictionAudit[],
  rows: Array<{ habitId: string; loggedDate: string; reason: string }>,
  habits: Habit[]
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
    byKey.set(key, createMissedFrictionAudit(prompt, row.reason.trim()));
  });
  return Array.from(byKey.values()).sort((a, b) => b.timestamp - a.timestamp);
}

export function weeklyFrictionPatterns(
  audits: FrictionAudit[],
  now: number = Date.now()
): Array<{ reason: string; count: number }> {
  const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
  const counts = new Map<string, number>();
  audits.forEach((audit) => {
    if (audit.timestamp < weekAgo) return;
    const reason = (audit.reason || (audit.type === 'missed' ? audit.note : '') || '').trim();
    if (!reason) return;
    counts.set(reason, (counts.get(reason) || 0) + 1);
  });
  return Array.from(counts.entries())
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count);
}
