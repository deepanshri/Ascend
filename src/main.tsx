import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { applyNativeChrome } from './lib/nativeChrome';
import { startOfflineSyncListener } from './lib/offlineSync';

void applyNativeChrome(false).catch(() => {});
startOfflineSyncListener();

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <App />
    </StrictMode>,
);
