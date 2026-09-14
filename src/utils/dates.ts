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

export function parseIsoDateParts(iso: string): { year: number; month: number; day: number } | null {
  const [year, month, day] = iso.split('-').map(Number);
  if (!year || !month || !day) return null;
  return { year, month, day };
}

export function addDaysIso(iso: string, days: number): string {
  const parts = parseIsoDateParts(iso);
  if (!parts) return iso;
  const date = new Date(parts.year, parts.month - 1, parts.day);
  date.setDate(date.getDate() + days);
  return toISODate(date);
}

/** Whole local calendar days from `fromIso` to `toIso` (can be negative). */
export function diffDaysIso(fromIso: string, toIso: string): number {
  const from = parseIsoDateParts(fromIso);
  const to = parseIsoDateParts(toIso);
  if (!from || !to) return 0;
  const a = new Date(from.year, from.month - 1, from.day).getTime();
  const b = new Date(to.year, to.month - 1, to.day).getTime();
  return Math.round((b - a) / 86_400_000);
}

export function formatIsoShort(iso: string): string {
  const parts = parseIsoDateParts(iso);
  if (!parts) return iso;
  return new Date(parts.year, parts.month - 1, parts.day).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

/** End of a local YYYY-MM-DD calendar day, in epoch ms. */
export function endOfIsoDate(iso: string): number {
  const [year, month, day] = iso.split('-').map(Number);
  if (!year || !month || !day) return Date.now();
  return new Date(year, month - 1, day, 23, 59, 59, 999).getTime();
}

/** Map a 0..6 week index onto the rolling window anchored at `origin` (not wall-clock now). */
export function isoDateForDayIndex(dayIndex: number, origin: Date): string {
  return toISODate(getWeekDates(origin)[dayIndex] ?? origin);
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: string | undefined | null): value is string {
  return Boolean(value && ISO_DATE_RE.test(value));
}

export function parseToIsoDate(value: string | undefined | null): string | null {
  if (!value) return null;
  if (isIsoDate(value)) return value;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return toISODate(parsed);
}

export function dayIndexForIso(iso: string, origin: Date = new Date()): number {
  return getWeekDates(origin).map(toISODate).indexOf(iso);
}

export function resolveEventIsoDate(
  event: { date?: string; dayIndex: number; timestamp?: number },
  origin: Date = new Date()
): string {
  const fromDate = parseToIsoDate(event.date);
  if (fromDate) return fromDate;
  if (typeof event.timestamp === 'number' && Number.isFinite(event.timestamp)) {
    return toISODate(new Date(event.timestamp));
  }
  return isoDateForDayIndex(event.dayIndex, origin);
}

export function seedCompletedDays(completedPastDays = 3, date: Date = new Date()): boolean[] {
  const today = getTodayDayIndex(date);
  const first = Math.max(0, today - completedPastDays);
  return Array.from({ length: 7 }, (_, i) => i >= first && i < today);
}
