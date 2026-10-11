import { useEffect, useRef } from 'react';
import { App as CapacitorApp } from '@capacitor/app';
import type { PluginListenerHandle } from '@capacitor/core';

/**
 * Handle the Android hardware back button. While a listener is registered,
 * Capacitor skips its default action (going back or exiting the app), so the
 * listener is bound once for the component's lifetime and always calls the
 * latest `handler`.
 */
export function useBackButton(handler: () => void): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    let handle: PluginListenerHandle | null = null;
    let disposed = false;
    void CapacitorApp.addListener('backButton', () => handlerRef.current())
      .then((registered) => {
        if (disposed) void registered.remove();
        else handle = registered;
      })
      .catch(() => {});
    return () => {
      disposed = true;
      void handle?.remove();
    };
  }, []);
}
