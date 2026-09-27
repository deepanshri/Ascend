import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary';
import './index.css';
import { applyNativeChrome } from './lib/nativeChrome';
import { startOfflineSyncListener } from './lib/offlineSync';

let isDarkBoot = false;
try {
  const savedTheme = localStorage.getItem('ascend_theme');
  const systemDark = typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
  isDarkBoot = savedTheme === 'dark' || (!savedTheme && systemDark) || (savedTheme === 'system' && systemDark);
} catch {}
void applyNativeChrome(isDarkBoot).catch(() => {});
startOfflineSyncListener();

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
