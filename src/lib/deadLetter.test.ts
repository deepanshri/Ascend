import { describe, expect, it } from 'vitest';
import { DEAD_LETTER_STORAGE_KEY, mergeDeadLetters, parseDeadLetters, type DeadLetterEntry } from './deadLetter';

describe('parseDeadLetters', () => {
  it('reads a stored list', () => {
    const stored: DeadLetterEntry[] = [{ source: 'k', reason: 'invalid_entry', value: 1, rejectedAt: 5 }];
    expect(parseDeadLetters(JSON.stringify(stored), 9)).toEqual(stored);
  });

  it('treats a missing payload as empty', () => {
    expect(parseDeadLetters(null, 9)).toEqual([]);
  });

  it('preserves an unreadable dead-letter payload as an entry instead of replacing it', () => {
    expect(parseDeadLetters('{broken', 9)).toEqual([
      { source: DEAD_LETTER_STORAGE_KEY, reason: 'invalid_json', value: '{broken', rejectedAt: 9 },
    ]);
    expect(parseDeadLetters('{"a":1}', 9)).toEqual([
      { source: DEAD_LETTER_STORAGE_KEY, reason: 'not_a_list', value: { a: 1 }, rejectedAt: 9 },
    ]);
  });
});

describe('mergeDeadLetters', () => {
  it('appends rejected values with their source and time', () => {
    expect(mergeDeadLetters([], 'habits', [{ reason: 'invalid_entry', value: { name: 'x' } }], 100)).toEqual([
      { source: 'habits', reason: 'invalid_entry', value: { name: 'x' }, rejectedAt: 100 },
    ]);
  });

  it('skips values already recorded for the same source and reason', () => {
    const existing = mergeDeadLetters([], 'habits', [{ reason: 'invalid_entry', value: { name: 'x' } }], 100);
    const again = mergeDeadLetters(existing, 'habits', [{ reason: 'invalid_entry', value: { name: 'x' } }], 200);
    expect(again).toBe(existing);
  });

  it('keeps the same value from a different source', () => {
    const existing = mergeDeadLetters([], 'habits', [{ reason: 'invalid_entry', value: 1 }], 100);
    const merged = mergeDeadLetters(existing, 'events', [{ reason: 'invalid_entry', value: 1 }], 200);
    expect(merged).toHaveLength(2);
  });

  it('collapses duplicates within one batch', () => {
    const merged = mergeDeadLetters(
      [],
      'habits',
      [
        { reason: 'invalid_entry', value: null },
        { reason: 'invalid_entry', value: null },
      ],
      100
    );
    expect(merged).toHaveLength(1);
  });
});
