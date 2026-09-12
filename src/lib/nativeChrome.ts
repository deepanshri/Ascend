import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';

export const NATIVE_LIGHT_BG = '#F8FAF9';
export const NATIVE_DARK_BG = '#020617';

export async function applyNativeChrome(isDark: boolean): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;

  try {
    await StatusBar.setOverlaysWebView({ overlay: true });
    await StatusBar.setBackgroundColor({
      color: isDark ? NATIVE_DARK_BG : NATIVE_LIGHT_BG,
    });
    await StatusBar.setStyle({
      style: isDark ? Style.Dark : Style.Light,
    });
  } catch {
    // Web preview and unsupported platforms skip native chrome.
  }
}
