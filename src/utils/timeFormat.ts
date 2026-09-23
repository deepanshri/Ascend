/**
 * Utility functions for parsing and formatting habit and task target times.
 */

export interface ParsedTime {
  hour: number;
  minute: number;
}

/**
 * Parses a 24-hour time string ("HH:mm") or 12-hour string ("07:30 AM") into { hour, minute }.
 */
export function parseTargetTimeHHmm(raw?: string | null): ParsedTime | null {
  if (!raw) return null;
  const trimmed = String(raw).trim();
  const match = trimmed.match(/^(\d{1,2}):(\d{2})(?:\s*([AaPp][Mm]))?/);
  if (!match) return null;
  let hour = parseInt(match[1], 10);
  const minute = parseInt(match[2], 10);
  const meridiem = match[3]?.toUpperCase();

  if (meridiem === 'PM' && hour < 12) hour += 12;
  if (meridiem === 'AM' && hour === 12) hour = 0;

  if (Number.isNaN(hour) || Number.isNaN(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return null;
  }
  return { hour, minute };
}

/**
 * Formats a target time for UI display (e.g., "05:00" -> "5:00 AM", "17:30" -> "5:30 PM").
 */
export function formatTargetTimeDisplay(raw?: string | null): string {
  const parsed = parseTargetTimeHHmm(raw);
  if (!parsed) return '';
  const { hour, minute } = parsed;
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  const minuteStr = String(minute).padStart(2, '0');
  return `${hour12}:${minuteStr} ${suffix}`;
}

/**
 * Formats a target time with zero-padded hour (e.g., "05:00" -> "05:00 AM").
 */
export function formatTargetTimePadded(raw?: string | null): string {
  const parsed = parseTargetTimeHHmm(raw);
  if (!parsed) return '';
  const { hour, minute } = parsed;
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  const hourStr = String(hour12).padStart(2, '0');
  const minuteStr = String(minute).padStart(2, '0');
  return `${hourStr}:${minuteStr} ${suffix}`;
}
