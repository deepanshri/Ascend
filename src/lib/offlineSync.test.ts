import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { HabitCompletionEvent } from '../types';

/**
 * A recording stand-in for the Supabase client: every query chain is logged as
 * { table, op, filters }, and `respond` decides each call's { error }.
 */
interface RecordedCall {
  table: string;
  op: 'upsert' | 'insert' | 'delete';
  filters: Array<[string, unknown]>;
}

const calls: RecordedCall[] = [];
type Response = { error: { message: string } | null };
let respond: (call: RecordedCall) => Response | Promise<Response> = () => ({ error: null });

function builder(table: string, op: RecordedCall['op']) {
  const call: RecordedCall = { table, op, filters: [] };
  calls.push(call);
  const chain = {
    eq(column: string, value: unknown) {
      call.filters.push([column, value]);
      return chain;
    },
    then<T>(resolve: (value: Response) => T, reject?: (reason: unknown) => T) {
      return Promise.resolve(respond(call)).then(resolve, reject);
    },
  };
  return chain;
}

vi.mock('./supabase', () => ({
  isSupabaseConfigured: true,
  supabase: {
    from: (table: string) => ({
      upsert: () => builder(table, 'upsert'),
      insert: () => builder(table, 'insert'),
      delete: () => builder(table, 'delete'),
    }),
  },
}));
vi.mock('./momentumEvents', () => ({ flushMomentumEventQueue: async () => {}, queuedMomentumEventCount: () => 0 }));

// In-memory localStorage and an online navigator (the node test environment has neither).
const store = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => void store.set(key, value),
  removeItem: (key: string) => void store.delete(key),
});
vi.stubGlobal('navigator', { onLine: true });

const {
  flushOfflineQueue,
  pushHabitLogDeleteRemote,
  pushHabitLogRemote,
  readLogQueue,
  syncHabitLogUpsert,
  unsyncedItemCount,
} = await import('./offlineSync');
const { invalidateSyncGeneration } = await import('./syncState');

const USER = '11111111-1111-4111-8111-111111111111';
const fail = { error: { message: 'rejected' } };
const event: HabitCompletionEvent = {
  id: 'log-1',
  habitId: 'habit-1',
  dayIndex: 3,
  date: '2026-10-15',
  type: 'full',
  timestamp: Date.parse('2026-10-15T09:00:00Z'),
} as HabitCompletionEvent;

const deletes = () => calls.filter((c) => c.op === 'delete');
const filterMap = (call: RecordedCall) => Object.fromEntries(call.filters);

beforeEach(() => {
  calls.length = 0;
  store.clear();
  respond = () => ({ error: null });
});

/** A response held open until `release` is called, to observe a write while it is in flight. */
function heldResponse() {
  let release!: (value: Response) => void;
  const held = new Promise<Response>((resolve) => {
    release = resolve;
  });
  return { held, release };
}

describe('habit_logs deletes are always pinned to one day', () => {
  it('upsert fallback: every delete carries a date filter, never day_index alone', async () => {
    // Upsert and both inserts rejected: the full fallback chain runs.
    respond = (call) => (call.op === 'delete' ? { error: null } : fail);
    await pushHabitLogRemote(USER, event);

    expect(deletes().length).toBeGreaterThan(0);
    for (const call of deletes()) {
      const f = filterMap(call);
      expect(f.user_id).toBe(USER);
      expect(f.habit_id).toBe('habit-1');
      expect(f.logged_date ?? f.date).toBe('2026-10-15');
    }
  });

  it('upsert fallback: the legacy delete matches the text date and the weekday slot', async () => {
    respond = (call) => (call.op === 'delete' ? { error: null } : fail);
    await pushHabitLogRemote(USER, event);

    const legacy = deletes().find((call) => 'day_index' in filterMap(call));
    expect(legacy && filterMap(legacy)).toEqual({
      user_id: USER,
      habit_id: 'habit-1',
      date: '2026-10-15',
      day_index: 3,
    });
  });

  it('delete fallback: when the logged_date delete fails, the retry is still pinned to the day', async () => {
    respond = (call) => (call.filters.some(([column]) => column === 'logged_date') ? fail : { error: null });
    const ok = await pushHabitLogDeleteRemote(USER, 'habit-1', '2026-10-15', 3);

    expect(ok).toBe(true);
    expect(deletes().map(filterMap)).toEqual([
      { user_id: USER, habit_id: 'habit-1', logged_date: '2026-10-15' },
      { user_id: USER, habit_id: 'habit-1', date: '2026-10-15', day_index: 3 },
    ]);
  });

  it('delete fallback: no day_index means no second delete', async () => {
    respond = () => fail;
    const ok = await pushHabitLogDeleteRemote(USER, 'habit-1', '2026-10-15');

    expect(ok).toBe(false);
    expect(deletes()).toHaveLength(1);
  });

  it('never sends a day_index-only delete for a malformed date', async () => {
    respond = (call) => (call.filters.some(([column]) => column === 'logged_date') ? fail : { error: null });
    const ok = await pushHabitLogDeleteRemote(USER, 'habit-1', 'not-a-date', 3);

    expect(ok).toBe(false);
    expect(deletes().filter((call) => 'day_index' in filterMap(call))).toHaveLength(0);
  });

  it('a successful upsert sends no deletes at all', async () => {
    await pushHabitLogRemote(USER, event);
    expect(deletes()).toHaveLength(0);
  });
});

describe('unsynced writes survive until confirmed (sign-out guard)', () => {
  it('a failed live write is queued and counted', async () => {
    respond = () => fail;
    await syncHabitLogUpsert(USER, event);
    expect(readLogQueue()).toHaveLength(1);
    expect(unsyncedItemCount()).toBe(1);
  });

  it('a write still in flight is counted, and released once confirmed', async () => {
    const { held, release } = heldResponse();
    respond = () => held;
    const pending = syncHabitLogUpsert(USER, event);
    expect(unsyncedItemCount()).toBe(1);
    release({ error: null });
    await pending;
    expect(unsyncedItemCount()).toBe(0);
    expect(readLogQueue()).toHaveLength(0);
  });

  it('a queue flush counts its items while the queue itself is empty', async () => {
    respond = () => fail;
    await syncHabitLogUpsert(USER, event);

    const { held, release } = heldResponse();
    respond = () => held;
    const flushing = flushOfflineQueue();
    expect(readLogQueue()).toHaveLength(0);
    expect(unsyncedItemCount()).toBeGreaterThan(0);
    release({ error: null });
    await flushing;
    expect(unsyncedItemCount()).toBe(0);
  });

  it('a write that fails after the user data was purged is not re-queued for the next user', async () => {
    const { held, release } = heldResponse();
    respond = () => held;
    const pending = syncHabitLogUpsert(USER, event);
    invalidateSyncGeneration();
    store.clear();
    release(fail);
    await pending;
    expect(readLogQueue()).toHaveLength(0);
  });

  it('a flush interrupted by a purge drops the previous user leftovers', async () => {
    respond = () => fail;
    await syncHabitLogUpsert(USER, event);

    const { held, release } = heldResponse();
    respond = () => held;
    const flushing = flushOfflineQueue();
    invalidateSyncGeneration();
    store.clear();
    release(fail);
    respond = () => fail;
    await flushing;
    expect(readLogQueue()).toHaveLength(0);
  });
});
