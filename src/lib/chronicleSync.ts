import {
  type ChronicleEntry,
  loadChronicleEntries,
  mergeRemoteChronicleEntries,
  storeChronicleEntriesLocally,
} from './chronicle';
import { recordDeadLetters } from './deadLetter';
import { type InsertOutcome, isPermanentRowError } from './momentumUpload';
import { readJson, writeJson } from './storage';
import { isSupabaseConfigured, supabase } from './supabase';
import { syncGeneration, trackInFlight } from './syncState';

/**
 * Chronicle entries ↔ Supabase `chronicle_entries`: save with an offline queue,
 * flush the queue, and read entries back on sign-in and at each new day.
 */

export const CHRONICLE_QUEUE_KEY = 'ascend_offline_chronicle_queue';
/** Dead-letter source for entries the database refused. */
export const CHRONICLE_UPLOAD_DEAD_LETTER_SOURCE = 'chronicle_entries_upload';

/**
 * - synced: on this phone and confirmed by the server.
 * - queued: on this phone; uploads when the connection is back.
 * - local: on this phone only, by design (guest, or Supabase not configured).
 * - rejected: on this phone; the server refused it, so it was set aside (dead letter).
 */
export type ChronicleSaveStatus = 'synced' | 'queued' | 'local' | 'rejected';

interface ChronicleQueueItem {
  userId: string;
  entry: ChronicleEntry;
}

function canSync(userId?: string | null): userId is string {
  return Boolean(isSupabaseConfigured && supabase && userId && !userId.startsWith('guest_'));
}

function isOnline(): boolean {
  try {
    return typeof navigator === 'undefined' ? true : navigator.onLine;
  } catch {
    return true;
  }
}

function readQueue(): ChronicleQueueItem[] {
  return readJson<ChronicleQueueItem[]>(CHRONICLE_QUEUE_KEY, []);
}

function writeQueue(items: ChronicleQueueItem[]): void {
  writeJson(CHRONICLE_QUEUE_KEY, items);
}

const sameKey = (a: ChronicleQueueItem, userId: string, isoDate: string) =>
  a.userId === userId && a.entry.isoDate === isoDate;

/** Queue the entry (replacing an older one for the same day) unless user data was purged since `gen`. */
function enqueueSince(gen: number, item: ChronicleQueueItem): void {
  if (gen !== syncGeneration()) return;
  writeQueue([...readQueue().filter((q) => !sameKey(q, item.userId, item.entry.isoDate)), item]);
}

function dropQueued(userId: string, isoDate: string): void {
  const queue = readQueue();
  const next = queue.filter((q) => !sameKey(q, userId, isoDate));
  if (next.length !== queue.length) writeQueue(next);
}

export function queuedChronicleCount(): number {
  return readQueue().length;
}

function pendingDates(userId: string): Set<string> {
  return new Set(readQueue().filter((q) => q.userId === userId).map((q) => q.entry.isoDate));
}

function deadLetter(userId: string, entry: ChronicleEntry, error: InsertOutcome['error']): void {
  recordDeadLetters(CHRONICLE_UPLOAD_DEAD_LETTER_SOURCE, [
    { reason: 'server_rejected', value: { userId, entry, error: error ?? {} } },
  ]);
}

/**
 * Every remote chronicle write runs one at a time: a queued (older) entry and a
 * fresh save of the same day must reach the server in the order they were made.
 */
let chain: Promise<unknown> = Promise.resolve();
function serialize<T>(work: () => Promise<T>): Promise<T> {
  const next = chain.then(work, work);
  chain = next.catch(() => {});
  return next;
}

async function upsertRemote(userId: string, entry: ChronicleEntry): Promise<InsertOutcome> {
  if (!supabase) return { ok: false };
  try {
    const { error } = await supabase.from('chronicle_entries').upsert(
      {
        user_id: userId,
        iso_date: entry.isoDate,
        phase1: entry.phase1,
        phase2: entry.phase2,
        phase3: entry.phase3,
        updated_at: entry.updatedAt,
      },
      { onConflict: 'user_id,iso_date' }
    );
    return error ? { ok: false, error: { code: error.code, message: error.message } } : { ok: true };
  } catch (err) {
    return { ok: false, error: { message: err instanceof Error ? err.message : String(err) } };
  }
}

/**
 * Save an entry: always to this phone first, then to Supabase for a signed-in
 * user. Offline or on a transient failure it joins the offline queue. The
 * status says which of those happened, so the UI never claims a sync that didn't.
 */
export async function saveChronicleEntry(entry: ChronicleEntry, userId: string | null | undefined): Promise<ChronicleSaveStatus> {
  storeChronicleEntriesLocally([entry]);
  if (!canSync(userId)) return 'local';

  const gen = syncGeneration();
  if (!isOnline()) {
    enqueueSince(gen, { userId, entry });
    return 'queued';
  }

  return serialize(async () => {
    const outcome = await trackInFlight(1, () => upsertRemote(userId, entry));
    if (outcome.ok) {
      // This save supersedes any older queued version of the same day.
      if (gen === syncGeneration()) dropQueued(userId, entry.isoDate);
      return 'synced';
    }
    if (isPermanentRowError(outcome.error)) {
      if (gen === syncGeneration()) {
        dropQueued(userId, entry.isoDate);
        deadLetter(userId, entry, outcome.error);
      }
      return 'rejected';
    }
    enqueueSince(gen, { userId, entry });
    return 'queued';
  });
}

/**
 * Upload queued entries, one request each, oldest first. A transient failure
 * stops the flush and keeps the rest queued; a row the database refuses is
 * dead-lettered so it can't block the queue.
 */
export function flushChronicleQueue(): Promise<void> {
  return serialize(async () => {
    if (!isOnline() || !isSupabaseConfigured || !supabase) return;
    const queued = readQueue();
    if (queued.length === 0) return;
    const gen = syncGeneration();
    writeQueue([]);

    const remaining = await trackInFlight(queued.length, async () => {
      const left: ChronicleQueueItem[] = [];
      for (let i = 0; i < queued.length; i++) {
        const item = queued[i];
        const outcome = await upsertRemote(item.userId, item.entry);
        if (outcome.ok) continue;
        if (isPermanentRowError(outcome.error)) {
          if (gen === syncGeneration()) deadLetter(item.userId, item.entry, outcome.error);
          continue;
        }
        left.push(...queued.slice(i));
        break;
      }
      return left;
    });

    if (gen !== syncGeneration()) return;
    // An entry queued for the same day while this ran is newer: it wins.
    const current = readQueue();
    writeQueue([
      ...remaining.filter((r) => !current.some((c) => sameKey(c, r.userId, r.entry.isoDate))),
      ...current,
    ]);
  });
}

interface ChronicleRow {
  iso_date: string;
  phase1: string | null;
  phase2: string | null;
  phase3: string | null;
  updated_at: string | null;
}

/**
 * Bring this phone up to date with the account: upload queued entries, then
 * read every entry back and keep the newer version of each day. Returns
 * whether any local entry changed.
 */
export async function hydrateChronicleFromRemote(userId: string | null | undefined): Promise<boolean> {
  if (!canSync(userId) || !isOnline()) return false;
  await flushChronicleQueue();
  return serialize(async () => {
    if (!supabase) return false;
    const gen = syncGeneration();
    try {
      const { data, error } = await supabase
        .from('chronicle_entries')
        .select('iso_date, phase1, phase2, phase3, updated_at')
        .eq('user_id', userId);
      if (error || !Array.isArray(data) || gen !== syncGeneration()) return false;
      const remote: ChronicleEntry[] = (data as ChronicleRow[])
        .filter((row) => typeof row.iso_date === 'string')
        .map((row) => ({
          isoDate: row.iso_date,
          phase1: row.phase1 ?? '',
          phase2: row.phase2 ?? '',
          phase3: row.phase3 ?? '',
          updatedAt: row.updated_at ?? '',
        }));
      const incoming = mergeRemoteChronicleEntries(loadChronicleEntries(), remote, pendingDates(userId));
      storeChronicleEntriesLocally(incoming);
      return incoming.length > 0;
    } catch {
      return false;
    }
  });
}
