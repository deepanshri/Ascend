/**
 * Dead-letter store for stored data the parsers could not use. Entries are
 * kept verbatim, with the storage key they came from, so a stricter parser can
 * never permanently destroy user data; they can be inspected or migrated later.
 */
import type { RejectedEntry, RejectReason } from './ledgerStorage';
import { readStorage, writeStorage } from './storage';

export const DEAD_LETTER_STORAGE_KEY = 'ascend_dead_letter';

export interface DeadLetterEntry {
  /** Storage key the value was read from. */
  source: string;
  reason: RejectReason;
  /** The raw string, payload or single entry, exactly as parsed. */
  value: unknown;
  rejectedAt: number;
}

function fingerprint(source: string, reason: string, value: unknown): string {
  return `${source}\u0000${reason}\u0000${JSON.stringify(value)}`;
}

/**
 * Parse the stored dead-letter list. An unreadable payload is preserved as an
 * entry of its own rather than replaced.
 */
export function parseDeadLetters(raw: string | null, now: number): DeadLetterEntry[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed as DeadLetterEntry[];
    return [{ source: DEAD_LETTER_STORAGE_KEY, reason: 'not_a_list', value: parsed, rejectedAt: now }];
  } catch {
    return [{ source: DEAD_LETTER_STORAGE_KEY, reason: 'invalid_json', value: raw, rejectedAt: now }];
  }
}

/** Append `rejected` to `existing`, skipping values already recorded for `source`. */
export function mergeDeadLetters(
  existing: DeadLetterEntry[],
  source: string,
  rejected: RejectedEntry[],
  now: number
): DeadLetterEntry[] {
  const seen = new Set(existing.map((entry) => fingerprint(entry.source, entry.reason, entry.value)));
  const added: DeadLetterEntry[] = [];
  for (const { reason, value } of rejected) {
    const key = fingerprint(source, reason, value);
    if (seen.has(key)) continue;
    seen.add(key);
    added.push({ source, reason, value, rejectedAt: now });
  }
  return added.length === 0 ? existing : [...existing, ...added];
}

/** Persist rejected entries from `source` to the dead-letter store. */
export function recordDeadLetters(source: string, rejected: RejectedEntry[]): void {
  if (rejected.length === 0) return;
  const now = Date.now();
  const existing = parseDeadLetters(readStorage(DEAD_LETTER_STORAGE_KEY), now);
  const merged = mergeDeadLetters(existing, source, rejected, now);
  if (merged === existing) return;
  writeStorage(DEAD_LETTER_STORAGE_KEY, JSON.stringify(merged));
  console.warn(`Moved ${merged.length - existing.length} unreadable entries from ${source} to ${DEAD_LETTER_STORAGE_KEY}`);
}
