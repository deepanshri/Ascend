import { describe, expect, it } from 'vitest';
import { backupSource, parseBackup, rejectedCount } from './backupImport';

const habit = (id: string) => ({ id, name: id, category: 'work', timestamp: '' });

describe('parseBackup', () => {
  it.each([null, 'text', 5, {}, { habits: 'x' }])('rejects %j as not a backup without dead-lettering', (file) => {
    expect(parseBackup(file)).toEqual({ status: 'not_a_backup', rejected: [] });
  });

  it('imports readable habits and keeps habits without an id aside', () => {
    const result = parseBackup({ habits: [habit('a'), { name: 'no id' }, null, habit('b')] });
    expect(result.status).toBe('ok');
    if (!('contents' in result)) throw new Error('expected contents');
    expect(result.contents.habits.map((h) => h.id)).toEqual(['a', 'b']);
    expect(result.rejected).toEqual([
      {
        source: backupSource('habits'),
        entries: [
          { reason: 'invalid_entry', value: { name: 'no id' } },
          { reason: 'invalid_entry', value: null },
        ],
      },
    ]);
  });

  it('refuses to replace habits when none are readable, but returns them for the dead-letter store', () => {
    const result = parseBackup({ habits: [{ name: 'no id' }, 7] });
    expect(result.status).toBe('no_readable_habits');
    expect(rejectedCount(result.rejected)).toBe(2);
  });

  it('imports an empty or seed-only habit list as empty, as before', () => {
    for (const habits of [[], [habit('habit-1')]]) {
      const result = parseBackup({ habits });
      expect(result.status).toBe('ok');
      if ('contents' in result) expect(result.contents.habits).toEqual([]);
    }
  });

  it('leaves absent sections undefined so current data is kept', () => {
    const result = parseBackup({ habits: [habit('a')] });
    if (!('contents' in result)) throw new Error('expected contents');
    expect(result.contents.evidence).toBeUndefined();
    expect(result.contents.completionEvents).toBeUndefined();
    expect(result.contents.momentumEvents).toBeUndefined();
  });

  it('parses optional sections and dead-letters their bad rows per section', () => {
    const result = parseBackup({
      habits: [habit('a')],
      evidenceLedger: [{ id: 'e', habitId: 'a', category: 'Work' }, { id: 'bad' }],
      completionEvents: [{ id: 'c', habitId: 'a' }, { id: 'bad' }],
      momentumEvents: [{ id: 'm', habitId: 'a' }, 'junk'],
    });
    if (!('contents' in result)) throw new Error('expected contents');
    expect(result.contents.evidence?.map((e) => [e.id, e.category])).toEqual([['e', 'work']]);
    expect(result.contents.completionEvents?.map((e) => e.id)).toEqual(['c']);
    expect(result.contents.momentumEvents?.map((e) => e.id)).toEqual(['m']);
    expect(result.rejected.map((r) => [r.source, r.entries.length])).toEqual([
      [backupSource('evidenceLedger'), 1],
      [backupSource('completionEvents'), 1],
      [backupSource('momentumEvents'), 1],
    ]);
  });

  it('keeps current data for a section that is not a list, and dead-letters it whole', () => {
    const result = parseBackup({ habits: [habit('a')], completionEvents: { broken: true } });
    if (!('contents' in result)) throw new Error('expected contents');
    expect(result.contents.completionEvents).toBeUndefined();
    expect(result.rejected).toEqual([
      { source: backupSource('completionEvents'), entries: [{ reason: 'not_a_list', value: { broken: true } }] },
    ]);
  });
});
