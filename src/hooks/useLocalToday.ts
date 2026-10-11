import { useEffect, useRef, useState } from 'react';
import { App as CapacitorApp } from '@capacitor/app';
import type { PluginListenerHandle } from '@capacitor/core';
import { getLocalDateString, msUntilNextLocalDay } from '../utils/dates';

/** Re-check interval: catches throttled timers and clock or timezone changes. */
const SAFETY_CHECK_MS = 60_000;

/**
 * Today's device-local date as strict `YYYY-MM-DD`. It is re-derived from the
 * clock (never by adding 24h), at the next local midnight, on Capacitor
 * resume / foreground, on focus or visibility, and every minute as a safety
 * net, so DST shifts and timezone changes while backgrounded resolve to the
 * real local date. State changes only when the date string changes.
 */
export function useLocalToday(): string {
  const [todayIso, setTodayIso] = useState(() => getLocalDateString());
  const todayRef = useRef(todayIso);

  useEffect(() => {
    let midnightTimer: number | undefined;
    let disposed = false;
    const handles: PluginListenerHandle[] = [];

    const check = () => {
      const fresh = getLocalDateString();
      if (fresh !== todayRef.current) {
        todayRef.current = fresh;
        setTodayIso(fresh);
      }
      // Re-aim at the next local midnight from the current clock and timezone.
      window.clearTimeout(midnightTimer);
      midnightTimer = window.setTimeout(check, msUntilNextLocalDay());
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') check();
    };
    const keep = (registration: Promise<PluginListenerHandle>) => {
      void registration
        .then((handle) => {
          if (disposed) void handle.remove();
          else handles.push(handle);
        })
        .catch(() => {});
    };

    check();
    const interval = window.setInterval(check, SAFETY_CHECK_MS);
    window.addEventListener('focus', check);
    document.addEventListener('visibilitychange', onVisible);
    keep(CapacitorApp.addListener('resume', check));
    keep(CapacitorApp.addListener('appStateChange', ({ isActive }) => {
      if (isActive) check();
    }));

    return () => {
      disposed = true;
      window.clearTimeout(midnightTimer);
      window.clearInterval(interval);
      window.removeEventListener('focus', check);
      document.removeEventListener('visibilitychange', onVisible);
      handles.forEach((handle) => void handle.remove());
    };
  }, []);

  return todayIso;
}
