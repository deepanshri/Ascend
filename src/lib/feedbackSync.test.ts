import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FeedbackReport } from './feedbackSync';

type Response = { error: { code?: string; message: string } | null };
type Row = { id: string; user_id: string; message: string; platform: string | null; app_version: string | null };
type Options = { onConflict?: string; ignoreDuplicates?: boolean };
const upserts: Array<{ row: Row; options: Options }> = [];
let respond: (row: Row) => Response | Promise<Response> = () => ({ error: null });

vi.mock('./supabase', () => ({
  isSupabaseConfigured: true,
  supabase: {
    from: (table: string) => ({
      upsert: async (row: Row, options: Options) => {
        if (table !== 'feedback') throw new Error(`unexpected table ${table}`);
        upserts.push({ row, options });
        return respond(row);
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
const nav = { onLine: true };
vi.stubGlobal('navigator', nav);
vi.spyOn(console, 'warn').mockImplementation(() => {});

const { flushFeedbackQueue, queuedFeedbackCount, sendFeedback } = await import('./feedbackSync');
const { readDeadLetters } = await import('./deadLetter');
const { invalidateSyncGeneration } = await import('./syncState');

const USER = '11111111-1111-4111-8111-111111111111';
const NETWORK: Response = { error: { message: 'TypeError: Failed to fetch' } };
let seq = 0;
const report = (message = 'The widget is slow'): FeedbackReport => ({
  id: `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`,
  message,
  createdAt: '2026-10-19T08:00:00.000Z',
  appVersion: '1.0.5 (6)',
  platform: 'android',
  userAgent: 'Mozilla/5.0 (Linux; Android 17)',
});

beforeEach(() => {
  upserts.length = 0;
  store.clear();
  nav.onLine = true;
  respond = () => ({ error: null });
});

describe('sendFeedback', () => {
  it('reports sent only when the server accepted it, with the details to act on it', async () => {
    const r = report();
    expect(await sendFeedback(r, USER)).toBe('sent');
    expect(upserts).toHaveLength(1);
    expect(upserts[0].row).toMatchObject({
      id: r.id,
      user_id: USER,
      message: 'The widget is slow',
      app_version: '1.0.5 (6)',
      platform: 'android',
      created_at: r.createdAt,
    });
    expect(queuedFeedbackCount()).toBe(0);
  });

  it('never overwrites: a retried id is ignored by the server, not updated', async () => {
    await sendFeedback(report(), USER);
    expect(upserts[0].options).toEqual({ onConflict: 'id', ignoreDuplicates: true });
  });

  it('queues and says so when offline, without a request', async () => {
    nav.onLine = false;
    expect(await sendFeedback(report(), USER)).toBe('queued');
    expect(upserts).toHaveLength(0);
    expect(queuedFeedbackCount()).toBe(1);
  });

  it('queues on a network failure', async () => {
    respond = () => NETWORK;
    expect(await sendFeedback(report(), USER)).toBe('queued');
    expect(queuedFeedbackCount()).toBe(1);
  });

  it('a refused report is set aside, not queued forever', async () => {
    respond = () => ({ error: { code: '23514', message: 'violates check constraint' } });
    expect(await sendFeedback(report(), USER)).toBe('rejected');
    expect(queuedFeedbackCount()).toBe(0);
    expect(readDeadLetters().some((d) => d.source === 'feedback_upload')).toBe(true);
  });

  it('guests and missing users cannot send, and nothing is stored', async () => {
    expect(await sendFeedback(report(), 'guest_123')).toBe('unavailable');
    expect(await sendFeedback(report(), null)).toBe('unavailable');
    expect(upserts).toHaveLength(0);
    expect(queuedFeedbackCount()).toBe(0);
  });
});

describe('flushFeedbackQueue', () => {
  it('uploads queued reports in order once back online', async () => {
    nav.onLine = false;
    await sendFeedback(report('first'), USER);
    await sendFeedback(report('second'), USER);
    nav.onLine = true;
    await flushFeedbackQueue();
    expect(upserts.map((u) => u.row.message)).toEqual(['first', 'second']);
    expect(queuedFeedbackCount()).toBe(0);
  });

  it('stops at a network failure and keeps the rest', async () => {
    nav.onLine = false;
    await sendFeedback(report('first'), USER);
    await sendFeedback(report('second'), USER);
    nav.onLine = true;
    respond = () => NETWORK;
    await flushFeedbackQueue();
    expect(upserts).toHaveLength(1);
    expect(queuedFeedbackCount()).toBe(2);
  });

  it('dead-letters a refused report and carries on', async () => {
    nav.onLine = false;
    await sendFeedback(report('bad'), USER);
    await sendFeedback(report('good'), USER);
    nav.onLine = true;
    respond = (row) => (row.message === 'bad' ? { error: { code: '22001', message: 'too long' } } : { error: null });
    await flushFeedbackQueue();
    expect(upserts.map((u) => u.row.message)).toEqual(['bad', 'good']);
    expect(queuedFeedbackCount()).toBe(0);
  });

  it('a sign-out purge during the flush is not undone', async () => {
    nav.onLine = false;
    await sendFeedback(report('first'), USER);
    nav.onLine = true;
    respond = () => {
      invalidateSyncGeneration();
      store.clear();
      return NETWORK;
    };
    await flushFeedbackQueue();
    expect(queuedFeedbackCount()).toBe(0);
  });
});
