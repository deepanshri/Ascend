/** Rolling 7-day window centered on today. Index 0..2 past, 3 today, 4..6 next. */

export const CENTERED_TODAY_INDEX = 3;

export function startOfDay(date: Date = new Date()): Date {
  const d = new Date(date.getTime());
  d.setHours(0, 0, 0, 0);
  return d;
}

export function getTodayDayIndex(_date: Date = new Date()): number {
  return CENTERED_TODAY_INDEX;
}

export function getWeekDates(date: Date = new Date()): Date[] {
  const origin = startOfDay(date);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(origin.getTime());
    d.setDate(origin.getDate() + (i - CENTERED_TODAY_INDEX));
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

export function toISODate(date: Date = new Date()): string {
  const d = startOfDay(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function isoDateForDayIndex(dayIndex: number, date: Date = new Date()): string {
  return toISODate(getWeekDates(date)[dayIndex] ?? date);
}

export function seedCompletedDays(completedPastDays = 3, date: Date = new Date()): boolean[] {
  const today = getTodayDayIndex(date);
  const first = Math.max(0, today - completedPastDays);
  return Array.from({ length: 7 }, (_, i) => i >= first && i < today);
}
