/** Monday-first week helpers. Index 0 = Monday … 6 = Sunday. */

export function startOfDay(date: Date = new Date()): Date {
  const d = new Date(date.getTime());
  d.setHours(0, 0, 0, 0);
  return d;
}

export function getTodayDayIndex(date: Date = new Date()): number {
  const jsDay = date.getDay(); // 0 Sunday … 6 Saturday
  return jsDay === 0 ? 6 : jsDay - 1;
}

export function getWeekStart(date: Date = new Date()): Date {
  const start = startOfDay(date);
  start.setDate(start.getDate() - getTodayDayIndex(date));
  return start;
}

export function getWeekDates(date: Date = new Date()): Date[] {
  const start = getWeekStart(date);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start.getTime());
    d.setDate(start.getDate() + i);
    return d;
  });
}

export function getWeekDateNumber(dayIndex: number, date: Date = new Date()): number {
  return getWeekDates(date)[dayIndex]?.getDate() ?? date.getDate();
}

export function getWeekdayShort(dayIndex: number, date: Date = new Date()): string {
  return getWeekDates(date)[dayIndex]?.toLocaleDateString('en-US', { weekday: 'short' }) ?? '';
}

export function getWeekdayNarrow(dayIndex: number, date: Date = new Date()): string {
  return getWeekDates(date)[dayIndex]?.toLocaleDateString('en-US', { weekday: 'narrow' }) ?? '';
}

export function formatEvidenceDate(date: Date = new Date()): string {
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

export function seedCompletedDays(completedPastDays = 3, date: Date = new Date()): boolean[] {
  const today = getTodayDayIndex(date);
  const first = Math.max(0, today - completedPastDays);
  return Array.from({ length: 7 }, (_, i) => i >= first && i < today);
}
