import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary';
// Space Grotesk ships inside the app: no network request can hold up first paint.
import '@fontsource/space-grotesk/300.css';
import '@fontsource/space-grotesk/400.css';
import '@fontsource/space-grotesk/500.css';
import '@fontsource/space-grotesk/600.css';
import '@fontsource/space-grotesk/700.css';
import './index.css';
import { applyNativeChrome } from './lib/nativeChrome';
import { THEME_STORAGE_KEY } from './lib/themeStore';
import { startOfflineSyncListener } from './lib/offlineSync';
import { migrateLegacyMomentumIds } from './lib/momentumEvents';
import { installBackgroundFlush } from './lib/backgroundFlush';

let isDarkBoot = false;
try {
  const savedTheme = localStorage.getItem(THEME_STORAGE_KEY);
  const systemDark = typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
  isDarkBoot = savedTheme === 'dark' || (!savedTheme && systemDark) || (savedTheme === 'system' && systemDark);
} catch {}
void applyNativeChrome(isDarkBoot).catch(() => {});
try {
  migrateLegacyMomentumIds();
} catch {}
startOfflineSyncListener();
installBackgroundFlush();

function Root() {
  const [appKey, setAppKey] = useState(0);
  return (
    <ErrorBoundary key={appKey} onReset={() => setAppKey((value) => value + 1)}>
      <App />
    </ErrorBoundary>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
