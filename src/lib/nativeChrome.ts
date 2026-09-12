import { Capacitor, SystemBars, SystemBarsStyle, SystemBarType } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';
import { SplashScreen } from '@capacitor/splash-screen';

export const NATIVE_LIGHT_BG = '#F8FAF9';
export const NATIVE_DARK_BG = '#020617';

export async function applyNativeChrome(isDark: boolean): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;

  const background = isDark ? NATIVE_DARK_BG : NATIVE_LIGHT_BG;
  const statusStyle = isDark ? Style.Dark : Style.Light;
  const barsStyle = isDark ? SystemBarsStyle.Dark : SystemBarsStyle.Light;

  try {
    await StatusBar.setOverlaysWebView({ overlay: true });
    await StatusBar.setBackgroundColor({ color: background });
    await StatusBar.setStyle({ style: statusStyle });
  } catch {
    // Web preview and unsupported platforms skip native chrome.
  }

  try {
    await SystemBars.setStyle({ style: barsStyle });
    await SystemBars.setStyle({ style: barsStyle, bar: SystemBarType.NavigationBar });
  } catch {
    // SystemBars is bundled with Capacitor 8; older webviews can ignore it.
  }
}

export async function hideNativeSplash(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await SplashScreen.hide({ fadeOutDuration: 250 });
  } catch {
    // Splash plugin is a no-op on web.
  }
}
