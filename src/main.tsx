import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary';
import { AppProviders } from './providers/AppProviders';
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
      <AppProviders>
        <App />
      </AppProviders>
    </ErrorBoundary>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
