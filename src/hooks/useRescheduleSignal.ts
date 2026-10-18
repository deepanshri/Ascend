import { useEffect, useState } from 'react';
import { App as CapacitorApp } from '@capacitor/app';
import type { PluginListenerHandle } from '@capacitor/core';
import { timeZoneKey } from '../utils/dates';

/** How often the timezone is re-checked while the app is in the foreground. */
const ZONE_CHECK_MS = 60_000;

/**
 * A counter for effects that queue local notifications: it changes when the
 * app returns to the foreground and when the device timezone changes. Queued
 * notifications are fixed instants, so after travel they would keep firing at
 * the old zone's wall-clock times until something rescheduled them.
 */
export function useRescheduleSignal(): number {
  const [signal, setSignal] = useState(0);

  useEffect(() => {
    let zone = timeZoneKey();
    let disposed = false;
    const handles: PluginListenerHandle[] = [];
    const bump = () => setSignal((n) => n + 1);

    const onResume = () => {
      zone = timeZoneKey();
      bump();
    };
    const checkZone = () => {
      const next = timeZoneKey();
      if (next !== zone) {
        zone = next;
        bump();
      }
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') checkZone();
    };

    const interval = window.setInterval(checkZone, ZONE_CHECK_MS);
    window.addEventListener('focus', checkZone);
    document.addEventListener('visibilitychange', onVisible);
    void CapacitorApp.addListener('resume', onResume)
      .then((handle) => {
        if (disposed) void handle.remove();
        else handles.push(handle);
      })
      .catch(() => {});

    return () => {
      disposed = true;
      window.clearInterval(interval);
      window.removeEventListener('focus', checkZone);
      document.removeEventListener('visibilitychange', onVisible);
      handles.forEach((handle) => void handle.remove());
    };
  }, []);

  return signal;
}
