/**
 * Bookkeeping that lets sign-out tell whether anything is still unsynced:
 *
 * - In-flight writes: requests already sent but not yet confirmed. A queue
 *   flush empties its queue before sending, so without this count a flush in
 *   progress would look like an empty queue.
 * - A generation counter, bumped when local user data is purged. A write that
 *   started before the purge must not re-queue its failures afterwards, or the
 *   previous user's rows would land in the next user's queue.
 * - Hooks run before sign-out, for writes held back on a timer (the momentum
 *   undo window), so they are sent or queued instead of silently dropped.
 *
 * Pure module state: no storage, no network.
 */

let generation = 0;
let inFlight = 0;
const beforeSignOutHooks = new Set<() => Promise<void> | void>();

export function syncGeneration(): number {
  return generation;
}

/** Called when local user data is purged: in-flight writes stop re-queueing. */
export function invalidateSyncGeneration(): void {
  generation += 1;
}

/** Count `items` as in flight while `work` runs. */
export async function trackInFlight<T>(items: number, work: () => Promise<T>): Promise<T> {
  inFlight += items;
  try {
    return await work();
  } finally {
    inFlight -= items;
  }
}

export function inFlightSyncCount(): number {
  return inFlight;
}

/** Register work that must run before sign-out decides what is unsynced. Returns the unregister function. */
export function registerBeforeSignOut(hook: () => Promise<void> | void): () => void {
  beforeSignOutHooks.add(hook);
  return () => {
    beforeSignOutHooks.delete(hook);
  };
}

export async function runBeforeSignOutHooks(): Promise<void> {
  await Promise.all([...beforeSignOutHooks].map(async (hook) => hook()));
}
