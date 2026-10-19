import { recordDeadLetters } from './deadLetter';
import { type InsertOutcome, isPermanentRowError } from './momentumUpload';
import { readJson, writeJson } from './storage';
import { isSupabaseConfigured, supabase } from './supabase';
import { syncGeneration, trackInFlight } from './syncState';

/**
 * Help & Feedback reports → Supabase `feedback`, with an offline queue. Reports
 * are only ever inserted; the client-made id keeps a retried upload from
 * creating a second row.
 */

export const FEEDBACK_QUEUE_KEY = 'ascend_offline_feedback_queue';
/** Dead-letter source for reports the database refused. */
export const FEEDBACK_UPLOAD_DEAD_LETTER_SOURCE = 'feedback_upload';
/** Matches the length check on feedback.message. */
export const FEEDBACK_MAX_LENGTH = 4000;

export interface FeedbackReport {
  id: string;
  message: string;
  /** ISO time the user pressed Submit. */
  createdAt: string;
  appVersion: string | null;
  platform: 'android' | 'ios' | 'web' | null;
  userAgent: string | null;
}

/**
 * - sent: the server stored it.
 * - queued: kept on this phone; uploads when the connection is back.
 * - rejected: the server refused it, so it was set aside (dead letter).
 * - unavailable: not sent and not kept (guest, or Supabase not configured).
 */
export type FeedbackSendStatus = 'sent' | 'queued' | 'rejected' | 'unavailable';

interface FeedbackQueueItem {
  userId: string;
  report: FeedbackReport;
}

export function canSendFeedback(userId?: string | null): userId is string {
  return Boolean(isSupabaseConfigured && supabase && userId && !userId.startsWith('guest_'));
}

function isOnline(): boolean {
  try {
    return typeof navigator === 'undefined' ? true : navigator.onLine;
  } catch {
    return true;
  }
}

function readQueue(): FeedbackQueueItem[] {
  return readJson<FeedbackQueueItem[]>(FEEDBACK_QUEUE_KEY, []);
}

function writeQueue(items: FeedbackQueueItem[]): void {
  writeJson(FEEDBACK_QUEUE_KEY, items);
}

/** Queue the report unless user data was purged since `gen`. */
function enqueueSince(gen: number, item: FeedbackQueueItem): void {
  if (gen !== syncGeneration()) return;
  writeQueue([...readQueue().filter((q) => q.report.id !== item.report.id), item]);
}

export function queuedFeedbackCount(): number {
  return readQueue().length;
}

function deadLetter(userId: string, report: FeedbackReport, error: InsertOutcome['error']): void {
  recordDeadLetters(FEEDBACK_UPLOAD_DEAD_LETTER_SOURCE, [
    { reason: 'server_rejected', value: { userId, report, error: error ?? {} } },
  ]);
}

/** Remote feedback writes run one at a time, so a flush and a fresh send never race. */
let chain: Promise<unknown> = Promise.resolve();
function serialize<T>(work: () => Promise<T>): Promise<T> {
  const next = chain.then(work, work);
  chain = next.catch(() => {});
  return next;
}

async function insertRemote(userId: string, report: FeedbackReport): Promise<InsertOutcome> {
  if (!supabase) return { ok: false };
  try {
    const { error } = await supabase.from('feedback').upsert(
      {
        id: report.id,
        user_id: userId,
        message: report.message,
        app_version: report.appVersion,
        platform: report.platform,
        user_agent: report.userAgent,
        created_at: report.createdAt,
      },
      { onConflict: 'id', ignoreDuplicates: true }
    );
    return error ? { ok: false, error: { code: error.code, message: error.message } } : { ok: true };
  } catch (err) {
    return { ok: false, error: { message: err instanceof Error ? err.message : String(err) } };
  }
}

/**
 * Send a report for a signed-in user. Offline or on a transient failure it
 * joins the offline queue. The status says which happened, so the UI never
 * claims a send that didn't.
 */
export async function sendFeedback(report: FeedbackReport, userId: string | null | undefined): Promise<FeedbackSendStatus> {
  if (!canSendFeedback(userId)) return 'unavailable';

  const gen = syncGeneration();
  if (!isOnline()) {
    enqueueSince(gen, { userId, report });
    return 'queued';
  }

  return serialize(async () => {
    const outcome = await trackInFlight(1, () => insertRemote(userId, report));
    if (outcome.ok) return 'sent';
    if (isPermanentRowError(outcome.error)) {
      if (gen === syncGeneration()) deadLetter(userId, report, outcome.error);
      return 'rejected';
    }
    enqueueSince(gen, { userId, report });
    return 'queued';
  });
}

/**
 * Upload queued reports, one request each, oldest first. A transient failure
 * stops the flush and keeps the rest queued; a report the database refuses is
 * dead-lettered so it can't block the queue.
 */
export function flushFeedbackQueue(): Promise<void> {
  return serialize(async () => {
    if (!isOnline() || !isSupabaseConfigured || !supabase) return;
    const queued = readQueue();
    if (queued.length === 0) return;
    const gen = syncGeneration();
    writeQueue([]);

    const remaining = await trackInFlight(queued.length, async () => {
      const left: FeedbackQueueItem[] = [];
      for (let i = 0; i < queued.length; i++) {
        const item = queued[i];
        const outcome = await insertRemote(item.userId, item.report);
        if (outcome.ok) continue;
        if (isPermanentRowError(outcome.error)) {
          if (gen === syncGeneration()) deadLetter(item.userId, item.report, outcome.error);
          continue;
        }
        left.push(...queued.slice(i));
        break;
      }
      return left;
    });

    if (gen !== syncGeneration()) return;
    // Reports queued while this ran go after the ones that are still waiting.
    const current = readQueue();
    writeQueue([...remaining.filter((r) => !current.some((c) => c.report.id === r.report.id)), ...current]);
  });
}
