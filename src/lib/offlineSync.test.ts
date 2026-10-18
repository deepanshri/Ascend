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
vi.mock('./momentumEvents', () => ({ flushMomentumEventQueue: async () => {} }));

const { pushHabitLogDeleteRemote, pushHabitLogRemote } = await import('./offlineSync');

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
  respond = () => ({ error: null });
});

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
