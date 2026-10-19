import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChronicleEntry } from './chronicle';

type Response = { error: { code?: string; message: string } | null };
type Row = { iso_date: string; phase1: string };
const upserts: Row[] = [];
let respondUpsert: (row: Row) => Response | Promise<Response> = () => ({ error: null });
let remoteRows: unknown[] = [];

vi.mock('./supabase', () => ({
  isSupabaseConfigured: true,
  supabase: {
    from: () => ({
      upsert: async (row: Row) => {
        upserts.push(row);
        return respondUpsert(row);
      },
      select: () => ({ eq: async () => ({ data: remoteRows, error: null }) }),
    }),
  },
}));

const store = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => void store.set(key, value),
  removeItem: (key: string) => void store.delete(key),
});
const nav = { onLine: true };
vi.stubGlobal('navigator', nav);
vi.spyOn(console, 'warn').mockImplementation(() => {});

const { flushChronicleQueue, hydrateChronicleFromRemote, queuedChronicleCount, saveChronicleEntry } = await import(
  './chronicleSync'
);
const { getChronicleEntry } = await import('./chronicle');
const { readDeadLetters } = await import('./deadLetter');
const { invalidateSyncGeneration } = await import('./syncState');

const USER = '11111111-1111-4111-8111-111111111111';
const NETWORK: Response = { error: { message: 'TypeError: Failed to fetch' } };
const entry = (phase1: string, updatedAt = '2026-10-18T20:00:00.000Z', isoDate = '2026-10-18'): ChronicleEntry => ({
  isoDate,
  phase1,
  phase2: 'did things',
  phase3: 'plan',
  updatedAt,
});

beforeEach(() => {
  upserts.length = 0;
  store.clear();
  nav.onLine = true;
  respondUpsert = () => ({ error: null });
  remoteRows = [];
});

describe('saveChronicleEntry', () => {
  it('reports synced only when the server accepted it', async () => {
    expect(await saveChronicleEntry(entry('focus'), USER)).toBe('synced');
    expect(upserts).toHaveLength(1);
    expect(getChronicleEntry('2026-10-18')?.phase1).toBe('focus');
  });

  it('queues and says so when offline, and still saves on this phone', async () => {
    nav.onLine = false;
    expect(await saveChronicleEntry(entry('focus'), USER)).toBe('queued');
    expect(upserts).toHaveLength(0);
    expect(queuedChronicleCount()).toBe(1);
    expect(getChronicleEntry('2026-10-18')?.phase1).toBe('focus');
  });

  it('queues on a network failure', async () => {
    respondUpsert = () => NETWORK;
    expect(await saveChronicleEntry(entry('focus'), USER)).toBe('queued');
    expect(queuedChronicleCount()).toBe(1);
  });

  it('a guest keeps it on this phone without any request', async () => {
    expect(await saveChronicleEntry(entry('focus'), 'guest_123')).toBe('local');
    expect(await saveChronicleEntry(entry('focus'), null)).toBe('local');
    expect(upserts).toHaveLength(0);
  });

  it('a row the database refuses is dead-lettered, not retried forever', async () => {
    respondUpsert = () => ({ error: { code: '23514', message: 'check' } });
    expect(await saveChronicleEntry(entry('focus'), USER)).toBe('rejected');
    expect(queuedChronicleCount()).toBe(0);
    expect(readDeadLetters()[0]).toMatchObject({ source: 'chronicle_entries_upload', reason: 'server_rejected' });
  });

  it('a newer save of the same day replaces the queued older one', async () => {
    nav.onLine = false;
    await saveChronicleEntry(entry('old'), USER);
    nav.onLine = true;
    expect(await saveChronicleEntry(entry('new', '2026-10-18T21:00:00.000Z'), USER)).toBe('synced');
    expect(queuedChronicleCount()).toBe(0);
    await flushChronicleQueue();
    expect(upserts.map((r) => r.phase1)).toEqual(['new']);
  });
});

describe('flushChronicleQueue', () => {
  it('uploads queued entries in order and empties the queue', async () => {
    nav.onLine = false;
    await saveChronicleEntry(entry('a', undefined, '2026-10-17'), USER);
    await saveChronicleEntry(entry('b', undefined, '2026-10-18'), USER);
    nav.onLine = true;
    await flushChronicleQueue();
    expect(upserts.map((r) => r.iso_date)).toEqual(['2026-10-17', '2026-10-18']);
    expect(queuedChronicleCount()).toBe(0);
  });

  it('stops at a network failure and keeps the rest', async () => {
    nav.onLine = false;
    await saveChronicleEntry(entry('a', undefined, '2026-10-17'), USER);
    await saveChronicleEntry(entry('b', undefined, '2026-10-18'), USER);
    nav.onLine = true;
    respondUpsert = () => NETWORK;
    await flushChronicleQueue();
    expect(upserts).toHaveLength(1);
    expect(queuedChronicleCount()).toBe(2);
  });

  it('drops the previous user leftovers when a purge happens mid-flush', async () => {
    nav.onLine = false;
    await saveChronicleEntry(entry('a'), USER);
    nav.onLine = true;
    let release!: (r: Response) => void;
    respondUpsert = () => new Promise<Response>((resolve) => (release = resolve));
    const flushing = flushChronicleQueue();
    await vi.waitFor(() => expect(upserts).toHaveLength(1));
    invalidateSyncGeneration();
    store.clear();
    release(NETWORK);
    await flushing;
    expect(queuedChronicleCount()).toBe(0);
  });
});

describe('hydrateChronicleFromRemote', () => {
  it('reads entries back from the account', async () => {
    remoteRows = [
      { iso_date: '2026-10-16', phase1: 'remote focus', phase2: null, phase3: 'x', updated_at: '2026-10-16T20:00:00+00:00' },
    ];
    expect(await hydrateChronicleFromRemote(USER)).toBe(true);
    expect(getChronicleEntry('2026-10-16')?.phase1).toBe('remote focus');
    expect(getChronicleEntry('2026-10-16')?.phase2).toBe('');
  });

  it('a pending local edit is never replaced by the server copy', async () => {
    nav.onLine = false;
    await saveChronicleEntry(entry('my edit', '2026-10-18T20:00:00.000Z'), USER);
    nav.onLine = true;
    respondUpsert = () => NETWORK; // the upload keeps failing, so the edit stays pending
    remoteRows = [
      { iso_date: '2026-10-18', phase1: 'server', phase2: '', phase3: '', updated_at: '2026-10-18T23:00:00+00:00' },
    ];
    expect(await hydrateChronicleFromRemote(USER)).toBe(false);
    expect(getChronicleEntry('2026-10-18')?.phase1).toBe('my edit');
  });

  it('does nothing offline or for a guest', async () => {
    remoteRows = [{ iso_date: '2026-10-16', phase1: 'r', phase2: '', phase3: '', updated_at: '2026-10-16T20:00:00Z' }];
    expect(await hydrateChronicleFromRemote('guest_1')).toBe(false);
    nav.onLine = false;
    expect(await hydrateChronicleFromRemote(USER)).toBe(false);
    expect(getChronicleEntry('2026-10-16')).toBeNull();
  });
});
