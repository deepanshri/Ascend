import { useCallback, useEffect, useRef, useState } from 'react';

/** Industry-standard brief undo window before a completed task leaves the active list. */
export const TASK_ARCHIVE_GRACE_MS = 2000;

/**
 * Tracks which completed task ids are still in the active list (grace / undo).
 * Persistence of `completed: true` is the caller's job — this only drives UI filtering.
 */
export function useTaskArchiveGrace(graceMs: number = TASK_ARCHIVE_GRACE_MS) {
  const [pendingArchiveIds, setPendingArchiveIds] = useState<ReadonlySet<string>>(() => new Set());
  const timersRef = useRef<Map<string, number>>(new Map());

  const clearTimer = useCallback((id: string) => {
    const timer = timersRef.current.get(id);
    if (timer != null) {
      window.clearTimeout(timer);
      timersRef.current.delete(id);
    }
  }, []);

  useEffect(
    () => () => {
      for (const timer of timersRef.current.values()) window.clearTimeout(timer);
      timersRef.current.clear();
    },
    []
  );

  const beginGrace = useCallback(
    (id: string) => {
      clearTimer(id);
      setPendingArchiveIds((prev) => {
        const next = new Set(prev);
        next.add(id);
        return next;
      });
      const timer = window.setTimeout(() => {
        timersRef.current.delete(id);
        setPendingArchiveIds((prev) => {
          if (!prev.has(id)) return prev;
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }, graceMs);
      timersRef.current.set(id, timer);
    },
    [clearTimer, graceMs]
  );

  const cancelGrace = useCallback(
    (id: string) => {
      clearTimer(id);
      setPendingArchiveIds((prev) => {
        if (!prev.has(id)) return prev;
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    },
    [clearTimer]
  );

  const isInGrace = useCallback((id: string) => pendingArchiveIds.has(id), [pendingArchiveIds]);

  return { pendingArchiveIds, beginGrace, cancelGrace, isInGrace, graceMs };
}
