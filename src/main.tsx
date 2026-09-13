import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary';
import './index.css';
import { applyNativeChrome } from './lib/nativeChrome';
import { startOfflineSyncListener } from './lib/offlineSync';

void applyNativeChrome(false).catch(() => {});
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
