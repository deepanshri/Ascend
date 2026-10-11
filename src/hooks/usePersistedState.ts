import { useEffect, useId, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { flushWrite, scheduleWrite } from '../lib/pendingWrites';

/**
 * Persist `value` whenever it changes. With `debounceMs > 0` only the latest
 * value inside the window is written, so rapid updates (swipe-complete) don't
 * block the main thread. Pending writes are flushed on unmount and, through
 * installBackgroundFlush, when the app is backgrounded. `persist` may be an
 * inline function.
 */
export function usePersistEffect<T>(value: T, persist: (value: T) => void, debounceMs = 0): void {
  const writeKey = useId();
  const persistRef = useRef(persist);
  persistRef.current = persist;

  useEffect(() => {
    if (debounceMs <= 0) {
      persistRef.current(value);
      return;
    }
    scheduleWrite(writeKey, () => persistRef.current(value), debounceMs);
  }, [value, debounceMs, writeKey]);

  useEffect(() => () => flushWrite(writeKey), [writeKey]);
}

/** `useState` that hydrates from `load` once and persists every change. */
export function usePersistedState<T>(
  load: () => T,
  persist: (value: T) => void,
  debounceMs = 0
): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(load);
  usePersistEffect(value, persist, debounceMs);
  return [value, setValue];
}
