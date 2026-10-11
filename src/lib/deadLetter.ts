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

/** Append `entries` to `existing`, skipping any already recorded. */
export function appendDeadLetters(existing: DeadLetterEntry[], entries: DeadLetterEntry[]): DeadLetterEntry[] {
  const seen = new Set(existing.map((entry) => fingerprint(entry.source, entry.reason, entry.value)));
  const added: DeadLetterEntry[] = [];
  for (const entry of entries) {
    const key = fingerprint(entry.source, entry.reason, entry.value);
    if (seen.has(key)) continue;
    seen.add(key);
    added.push(entry);
  }
  return added.length === 0 ? existing : [...existing, ...added];
}

/** Append `rejected` to `existing`, skipping values already recorded for `source`. */
export function mergeDeadLetters(
  existing: DeadLetterEntry[],
  source: string,
  rejected: RejectedEntry[],
  now: number
): DeadLetterEntry[] {
  return appendDeadLetters(
    existing,
    rejected.map(({ reason, value }) => ({ source, reason, value, rejectedAt: now }))
  );
}

const REJECT_REASONS: ReadonlySet<string> = new Set<RejectReason>(['invalid_json', 'not_a_list', 'invalid_entry']);

/** Source recorded for backup content that is not itself a valid dead-letter entry. */
export const BACKUP_IMPORT_SOURCE = 'backup_import';

/**
 * Dead-letter entries from a backup file. Anything that is not a well-formed
 * entry is wrapped as one, so importing a backup can never lose content.
 */
export function deadLettersFromBackup(imported: unknown, now: number): DeadLetterEntry[] {
  if (!Array.isArray(imported)) {
    return [{ source: BACKUP_IMPORT_SOURCE, reason: 'not_a_list', value: imported, rejectedAt: now }];
  }
  return imported.map((entry): DeadLetterEntry => {
    const candidate = entry as Partial<DeadLetterEntry> | null;
    if (
      candidate &&
      typeof candidate === 'object' &&
      typeof candidate.source === 'string' &&
      typeof candidate.reason === 'string' &&
      REJECT_REASONS.has(candidate.reason) &&
      'value' in candidate
    ) {
      return {
        source: candidate.source,
        reason: candidate.reason,
        value: candidate.value,
        rejectedAt: typeof candidate.rejectedAt === 'number' ? candidate.rejectedAt : now,
      };
    }
    return { source: BACKUP_IMPORT_SOURCE, reason: 'invalid_entry', value: entry, rejectedAt: now };
  });
}

/** Persist rejected entries from `source` to the dead-letter store. */
export function recordDeadLetters(source: string, rejected: RejectedEntry[]): void {
  if (rejected.length === 0) return;
  const existing = readDeadLetters();
  const merged = mergeDeadLetters(existing, source, rejected, Date.now());
  if (merged === existing) return;
  writeStorage(DEAD_LETTER_STORAGE_KEY, JSON.stringify(merged));
  console.warn(`Moved ${merged.length - existing.length} unreadable entries from ${source} to ${DEAD_LETTER_STORAGE_KEY}`);
}

/** Current dead-letter entries, for the JSON backup export. */
export function readDeadLetters(): DeadLetterEntry[] {
  return parseDeadLetters(readStorage(DEAD_LETTER_STORAGE_KEY), Date.now());
}

/** Merge dead-letter entries from a backup file into the store. Returns how many were new. */
export function importDeadLetters(imported: unknown): number {
  const now = Date.now();
  const existing = readDeadLetters();
  const merged = appendDeadLetters(existing, deadLettersFromBackup(imported, now));
  if (merged !== existing) writeStorage(DEAD_LETTER_STORAGE_KEY, JSON.stringify(merged));
  return merged.length - existing.length;
}
