import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MomentumEvent } from '../types';

type Row = { id: string };
type Response = { error: { code?: string; message: string } | null };
const requests: Row[][] = [];
let respond: (rows: Row[]) => Response = () => ({ error: null });

vi.mock('./supabase', () => ({
  isSupabaseConfigured: true,
  fetchSequentialMomentumEvents: async () => [],
  insertMomentumEvent: async () => true,
  supabase: {
    from: () => ({
      upsert: async (rows: Row[]) => {
        requests.push(rows);
        return respond(rows);
      },
    }),
  },
}));

const store = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => void store.set(key, value),
  removeItem: (key: string) => void store.delete(key),
});
vi.stubGlobal('navigator', { onLine: true });
vi.spyOn(console, 'warn').mockImplementation(() => {});

const { flushMomentumEventQueue, pushMomentumEventsRemote, queuedMomentumEventCount } = await import('./momentumEvents');
const { readDeadLetters } = await import('./deadLetter');

const USER = '11111111-1111-4111-8111-111111111111';
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ev = (n: number): MomentumEvent =>
  ({ id: uuid(n), habitId: 'b6f2c1d0-8f1e-4c4e-9a51-2f3d4e5a6b7c', eventType: 'full', weight: 1, timestamp: 1_760_000_000_000 + n }) as MomentumEvent;
const many = (count: number) => Array.from({ length: count }, (_, i) => ev(i));
const BAD = uuid(7);
const rejectBad = (rows: Row[]): Response =>
  rows.some((row) => row.id === BAD) ? { error: { code: '23514', message: 'check constraint' } } : { error: null };

beforeEach(() => {
  requests.length = 0;
  store.clear();
  respond = () => ({ error: null });
});

describe('pushMomentumEventsRemote', () => {
  it('chunks a large history into requests of at most 500 rows', async () => {
    expect(await pushMomentumEventsRemote(USER, many(1200))).toBe(true);
    expect(requests.map((rows) => rows.length)).toEqual([500, 500, 200]);
  });

  it('a row the database rejects is dead-lettered; the rest are sent and nothing stays queued', async () => {
    respond = rejectBad;
    expect(await pushMomentumEventsRemote(USER, many(10))).toBe(true);
    expect(queuedMomentumEventCount()).toBe(0);
    const dead = readDeadLetters();
    expect(dead).toHaveLength(1);
    expect(dead[0]).toMatchObject({ source: 'momentum_events_upload', reason: 'server_rejected' });
    expect((dead[0].value as { event: MomentumEvent }).event.id).toBe(BAD);
  });

  it('a network failure queues the unsent events, and a later flush delivers them', async () => {
    respond = () => ({ error: { message: 'TypeError: Failed to fetch' } });
    expect(await pushMomentumEventsRemote(USER, many(3))).toBe(false);
    expect(queuedMomentumEventCount()).toBe(3);

    respond = () => ({ error: null });
    await flushMomentumEventQueue();
    expect(queuedMomentumEventCount()).toBe(0);
  });

  it('a bad row no longer blocks the queue: the next flush sends every good event', async () => {
    // Offline first, so all ten (bad one included) sit in the queue.
    respond = () => ({ error: { message: 'TypeError: Failed to fetch' } });
    await pushMomentumEventsRemote(USER, many(10));
    expect(queuedMomentumEventCount()).toBe(10);

    respond = rejectBad;
    await flushMomentumEventQueue();
    expect(queuedMomentumEventCount()).toBe(0);
    const sent = new Set(requests.slice(1).flat().map((row) => row.id));
    for (let n = 0; n < 10; n++) if (uuid(n) !== BAD) expect(sent.has(uuid(n))).toBe(true);
  });
});
