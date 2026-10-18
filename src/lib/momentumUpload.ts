import type { MomentumEvent } from '../types';

/** Rows per insert request: keeps a full-history push well inside request size limits. */
export const MOMENTUM_BATCH_SIZE = 500;

export interface InsertError {
  code?: string;
  message?: string;
}

export interface InsertOutcome {
  ok: boolean;
  error?: InsertError | null;
}

export interface MomentumUploadResult {
  sent: MomentumEvent[];
  /** Not sent for a reason that may pass (offline, timeout, auth, server down): queue and retry. */
  retry: MomentumEvent[];
  /** Rejected by the database itself: retrying the same row can never succeed. */
  rejected: Array<{ event: MomentumEvent; error: InsertError }>;
}

/**
 * Whether the database refused the row itself: Postgres data exceptions
 * (SQLSTATE class 22, e.g. an invalid uuid) and integrity violations (class 23,
 * e.g. a failed check constraint). Anything else, including network failures
 * (no code), auth and server errors, may succeed on a later attempt.
 */
export function isPermanentRowError(error: InsertError | null | undefined): boolean {
  return /^2[23][0-9A-Z]{3}$/.test(error?.code ?? '');
}

/**
 * Upload events in batches of `batchSize`. A batch the database rejects is
 * retried row by row, so one bad row is set aside instead of blocking every
 * other event behind it. A transient failure stops the upload: that batch and
 * everything after it is returned for retry rather than sent request by request
 * into a dead connection.
 */
export async function uploadMomentumEvents(
  events: MomentumEvent[],
  insert: (batch: MomentumEvent[]) => Promise<InsertOutcome>,
  batchSize: number = MOMENTUM_BATCH_SIZE
): Promise<MomentumUploadResult> {
  const result: MomentumUploadResult = { sent: [], retry: [], rejected: [] };

  for (let start = 0; start < events.length; start += batchSize) {
    const batch = events.slice(start, start + batchSize);
    const outcome = await insert(batch);
    if (outcome.ok) {
      result.sent.push(...batch);
      continue;
    }
    if (!isPermanentRowError(outcome.error)) {
      result.retry.push(...events.slice(start));
      return result;
    }
    for (let i = 0; i < batch.length; i++) {
      const row = await insert([batch[i]]);
      if (row.ok) {
        result.sent.push(batch[i]);
      } else if (isPermanentRowError(row.error)) {
        result.rejected.push({ event: batch[i], error: row.error ?? {} });
      } else {
        result.retry.push(...batch.slice(i), ...events.slice(start + batchSize));
        return result;
      }
    }
  }
  return result;
}
