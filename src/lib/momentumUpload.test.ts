import { describe, expect, it } from 'vitest';
import type { MomentumEvent } from '../types';
import { type InsertOutcome, isPermanentRowError, uploadMomentumEvents } from './momentumUpload';

const ev = (n: number): MomentumEvent =>
  ({ id: `e${n}`, habitId: 'h', eventType: 'full', weight: 1, timestamp: n }) as MomentumEvent;
const events = (count: number) => Array.from({ length: count }, (_, i) => ev(i));
const ids = (list: MomentumEvent[]) => list.map((event) => event.id);

const CHECK_VIOLATION = { code: '23514', message: 'violates check constraint' };
const NETWORK = { message: 'TypeError: Failed to fetch' };

/** A fake insert: rows listed in `bad` make any batch containing them fail with a check violation. */
function fakeInsert(bad: Set<string>, log: string[][] = []) {
  return async (batch: MomentumEvent[]): Promise<InsertOutcome> => {
    log.push(ids(batch));
    return batch.some((event) => bad.has(event.id)) ? { ok: false, error: CHECK_VIOLATION } : { ok: true };
  };
}

describe('isPermanentRowError', () => {
  it('treats Postgres data and integrity errors as permanent, everything else as retryable', () => {
    expect(isPermanentRowError({ code: '23514' })).toBe(true);
    expect(isPermanentRowError({ code: '22P02' })).toBe(true);
    expect(isPermanentRowError({ code: '42501' })).toBe(false);
    expect(isPermanentRowError({ code: 'PGRST301' })).toBe(false);
    expect(isPermanentRowError({ code: '' })).toBe(false);
    expect(isPermanentRowError(NETWORK)).toBe(false);
    expect(isPermanentRowError(undefined)).toBe(false);
  });
});

describe('uploadMomentumEvents', () => {
  it('sends in batches of the given size', async () => {
    const log: string[][] = [];
    const result = await uploadMomentumEvents(events(5), fakeInsert(new Set(), log), 2);
    expect(log.map((batch) => batch.length)).toEqual([2, 2, 1]);
    expect(result.sent).toHaveLength(5);
    expect(result.retry).toEqual([]);
    expect(result.rejected).toEqual([]);
  });

  it('one bad row is set aside; every other row is sent', async () => {
    const result = await uploadMomentumEvents(events(6), fakeInsert(new Set(['e3'])), 4);
    expect(ids(result.sent).sort()).toEqual(['e0', 'e1', 'e2', 'e4', 'e5']);
    expect(result.rejected.map((r) => r.event.id)).toEqual(['e3']);
    expect(result.rejected[0].error).toEqual(CHECK_VIOLATION);
    expect(result.retry).toEqual([]);
  });

  it('only the rejected batch falls back to single rows', async () => {
    const log: string[][] = [];
    await uploadMomentumEvents(events(6), fakeInsert(new Set(['e1']), log), 3);
    // Batch [e0,e1,e2] fails, then e0, e1, e2 alone, then batch [e3,e4,e5] in one request.
    expect(log).toEqual([['e0', 'e1', 'e2'], ['e0'], ['e1'], ['e2'], ['e3', 'e4', 'e5']]);
  });

  it('a network failure keeps that batch and everything after it for retry, without row-by-row requests', async () => {
    const log: string[][] = [];
    let calls = 0;
    const result = await uploadMomentumEvents(
      events(6),
      async (batch) => {
        log.push(ids(batch));
        calls += 1;
        return calls === 1 ? { ok: true } : { ok: false, error: NETWORK };
      },
      2
    );
    expect(ids(result.sent)).toEqual(['e0', 'e1']);
    expect(ids(result.retry)).toEqual(['e2', 'e3', 'e4', 'e5']);
    expect(log).toHaveLength(2);
  });

  it('a connection drop during the row fallback keeps the unsent rows and later batches', async () => {
    let calls = 0;
    const result = await uploadMomentumEvents(
      events(5),
      async (batch) => {
        calls += 1;
        if (batch.length > 1) return { ok: false, error: CHECK_VIOLATION };
        // e0 goes through, then the connection drops.
        return calls === 2 ? { ok: true } : { ok: false, error: NETWORK };
      },
      3
    );
    expect(ids(result.sent)).toEqual(['e0']);
    expect(ids(result.retry)).toEqual(['e1', 'e2', 'e3', 'e4']);
    expect(result.rejected).toEqual([]);
  });

  it('nothing to send makes no requests', async () => {
    const log: string[][] = [];
    const result = await uploadMomentumEvents([], fakeInsert(new Set(), log));
    expect(log).toEqual([]);
    expect(result).toEqual({ sent: [], retry: [], rejected: [] });
  });
});
