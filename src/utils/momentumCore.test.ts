import { describe, expect, it } from 'vitest';
import type { Habit, MomentumEvent } from '../types';
import { calculateMomentumScore } from './momentumCore';

const DAY = '2026-10-10';
const at = (hour: number) => new Date(2026, 9, 10, hour).getTime();
const endOfDay = new Date(2026, 9, 10, 23, 59, 59, 999).getTime();
const habits = [{ id: 'a' }, { id: 'b' }] as Habit[];
let seq = 0;
const ev = (habitId: string, eventType: MomentumEvent['eventType'], timestamp: number, loggedDate = DAY): MomentumEvent => ({
  id: `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`,
  habitId,
  eventType,
  weight: 1.5,
  timestamp,
  loggedDate,
});
// A good day before, so the miss day moves the score.
const before = [ev('a', 'full', at(9) - 86_400_000, '2026-10-09'), ev('b', 'full', at(9) - 86_400_000, '2026-10-09')];
// Scored at the end of that day, before later decay rounds every case to the same number.
const score = (events: MomentumEvent[]) =>
  calculateMomentumScore([...before, ...events], { habits, asOf: endOfDay });

describe('calculateMomentumScore on a day with misses', () => {
  it('a completion beats the miss inferred for the same habit and day', () => {
    // The miss is stamped at the end of the day, so it is always the later event; a
    // tap made at 22:00 but recorded the next morning must still count.
    const missedB = ev('b', 'missed', endOfDay);
    const tapped = score([ev('a', 'full', at(22)), ev('a', 'missed', endOfDay), missedB]);
    const bothMissed = score([ev('a', 'missed', endOfDay), missedB]);
    expect(tapped).toBeGreaterThan(bothMissed);
  });

  it('a completion that was undone does not beat the miss', () => {
    const missedB = ev('b', 'missed', endOfDay);
    const undone = score([ev('a', 'full', at(20)), ev('a', 'reversal', at(21)), ev('a', 'missed', endOfDay), missedB]);
    expect(undone).toBe(score([ev('a', 'missed', endOfDay), missedB]));
  });
});
