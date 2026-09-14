export type TimeOfDay = 'morning' | 'night';

export interface BowlState {
  mode: TimeOfDay;
  morningPieces: number;
  nightPieces: number;
}

export function isTimeOfDay(value: unknown): value is TimeOfDay {
  return value === 'morning' || value === 'night';
}
