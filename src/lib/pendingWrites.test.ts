import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPendingWrites, flushWrite, pendingWriteCount, scheduleWrite } from './pendingWrites';

describe('pendingWrites', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    flushPendingWrites();
    vi.useRealTimers();
  });

  it('runs a write once its delay elapses', () => {
    const write = vi.fn();
    scheduleWrite('a', write, 320);
    vi.advanceTimersByTime(319);
    expect(write).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(write).toHaveBeenCalledTimes(1);
    expect(pendingWriteCount()).toBe(0);
  });

  it('keeps only the latest write per key', () => {
    const first = vi.fn();
    const second = vi.fn();
    scheduleWrite('a', first, 320);
    scheduleWrite('a', second, 320);
    vi.advanceTimersByTime(320);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('flushes every pending write synchronously, without waiting for timers', () => {
    const a = vi.fn();
    const b = vi.fn();
    scheduleWrite('a', a, 320);
    scheduleWrite('b', b, 10_000);
    expect(flushPendingWrites()).toBe(2);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(20_000);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });

  it('flushes a single key and leaves the others pending', () => {
    const a = vi.fn();
    const b = vi.fn();
    scheduleWrite('a', a, 320);
    scheduleWrite('b', b, 320);
    flushWrite('a');
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).not.toHaveBeenCalled();
    expect(pendingWriteCount()).toBe(1);
  });

  it('does nothing when flushing with nothing pending', () => {
    expect(flushPendingWrites()).toBe(0);
    expect(() => flushWrite('missing')).not.toThrow();
  });

  it('keeps flushing after one write throws', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const after = vi.fn();
    scheduleWrite('a', () => {
      throw new Error('quota');
    }, 320);
    scheduleWrite('b', after, 320);
    expect(flushPendingWrites()).toBe(2);
    expect(after).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });
});
