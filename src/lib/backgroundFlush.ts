import { App as CapacitorApp } from '@capacitor/app';
import { flushPendingWrites } from './pendingWrites';

let installed = false;

/**
 * Flush debounced storage writes as soon as the app leaves the foreground.
 *
 * Native: Capacitor `pause` and `appStateChange` (isActive=false) fire on
 * Android onPause. Web / WebView: `visibilitychange` (hidden), `pagehide` and
 * `freeze` cover tab switches, reloads and page-lifecycle freezing. Flushing
 * is idempotent, so overlapping events are harmless.
 */
export function installBackgroundFlush(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  const flush = () => {
    flushPendingWrites();
  };

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });
  window.addEventListener('pagehide', flush);
  document.addEventListener('freeze', flush);

  void CapacitorApp.addListener('pause', flush).catch(() => {});
  void CapacitorApp.addListener('appStateChange', ({ isActive }) => {
    if (!isActive) flush();
  }).catch(() => {});
}
