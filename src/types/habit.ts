export type TimeOfDay = 'morning' | 'night';

export function isTimeOfDay(value: unknown): value is TimeOfDay {
  return value === 'morning' || value === 'night';
}
