import { describe, expect, it } from 'vitest';
import {
  inFlightSyncCount,
  invalidateSyncGeneration,
  registerBeforeSignOut,
  runBeforeSignOutHooks,
  syncGeneration,
  trackInFlight,
} from './syncState';

describe('syncState', () => {
  it('counts work in flight and releases it on success and on failure', async () => {
    const before = inFlightSyncCount();
    let finish!: () => void;
    const work = trackInFlight(3, () => new Promise<void>((resolve) => (finish = resolve)));
    expect(inFlightSyncCount()).toBe(before + 3);
    finish();
    await work;
    expect(inFlightSyncCount()).toBe(before);

    await expect(trackInFlight(2, async () => Promise.reject(new Error('down')))).rejects.toThrow('down');
    expect(inFlightSyncCount()).toBe(before);
  });

  it('bumps the generation on purge', () => {
    const gen = syncGeneration();
    invalidateSyncGeneration();
    expect(syncGeneration()).toBe(gen + 1);
  });

  it('runs registered sign-out hooks until they unregister', async () => {
    let runs = 0;
    const unregister = registerBeforeSignOut(async () => {
      runs += 1;
    });
    await runBeforeSignOutHooks();
    unregister();
    await runBeforeSignOutHooks();
    expect(runs).toBe(1);
  });
});
