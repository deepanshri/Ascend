/**
 * Registry of debounced storage writes. Each key holds at most one pending
 * write (the latest value wins). `flushPendingWrites` runs every pending write
 * synchronously, so the app can persist everything the moment it is
 * backgrounded, before the OS can suspend timers or kill the process.
 */

type PendingWrite = { run: () => void; timer: ReturnType<typeof setTimeout> };

const pending = new Map<string, PendingWrite>();

function runSafely(run: () => void): void {
  try {
    run();
  } catch (err) {
    console.error('Persisting local data failed:', err);
  }
}

/** Run `run` after `delayMs`, replacing any write still pending under `key`. */
export function scheduleWrite(key: string, run: () => void, delayMs: number): void {
  const existing = pending.get(key);
  if (existing) clearTimeout(existing.timer);
  const timer = setTimeout(() => {
    pending.delete(key);
    runSafely(run);
  }, delayMs);
  pending.set(key, { run, timer });
}

/** Run the write pending under `key` now, if any. */
export function flushWrite(key: string): void {
  const entry = pending.get(key);
  if (!entry) return;
  clearTimeout(entry.timer);
  pending.delete(key);
  runSafely(entry.run);
}

/** Run every pending write now. Returns how many ran. */
export function flushPendingWrites(): number {
  const entries = [...pending.values()];
  pending.clear();
  for (const entry of entries) {
    clearTimeout(entry.timer);
    runSafely(entry.run);
  }
  return entries.length;
}

export function pendingWriteCount(): number {
  return pending.size;
}

/** Drop every pending write without running it (used before purging user data). */
export function discardPendingWrites(): void {
  for (const entry of pending.values()) clearTimeout(entry.timer);
  pending.clear();
}
