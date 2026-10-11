import React, {
  createContext,
  startTransition,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ThemeMode } from '../types';
import { usePersistEffect } from '../hooks/usePersistedState';
import { applyNativeChrome } from '../lib/nativeChrome';
import { readStorage, writeStorage } from '../lib/storage';
import { THEME_STORAGE_KEY, applyDocumentTheme, resolveThemeIsDark } from '../lib/themeStore';

interface ThemeState {
  theme: ThemeMode;
  isDark: boolean;
}

interface ThemeActions {
  setTheme: (next: ThemeMode) => void;
}

const ThemeStateContext = createContext<ThemeState | null>(null);
const ThemeActionsContext = createContext<ThemeActions | null>(null);

const DARK_QUERY = '(prefers-color-scheme: dark)';

function readInitialTheme(): ThemeMode {
  const saved = readStorage(THEME_STORAGE_KEY);
  if (saved === 'light' || saved === 'dark' || saved === 'system') return saved;
  if (typeof document !== 'undefined' && document.documentElement.classList.contains('dark')) return 'dark';
  return 'light';
}

function readSystemPrefersDark(): boolean {
  try {
    return window.matchMedia(DARK_QUERY).matches;
  } catch {
    return false;
  }
}

/** Light / dark / system theme. Device-wide, so it is kept across sign-out. */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>(readInitialTheme);
  const [systemPrefersDark, setSystemPrefersDark] = useState(readSystemPrefersDark);
  const systemPrefersDarkRef = useRef(systemPrefersDark);
  systemPrefersDarkRef.current = systemPrefersDark;
  const isDark = resolveThemeIsDark(theme, systemPrefersDark);

  useEffect(() => {
    try {
      const mq = window.matchMedia(DARK_QUERY);
      const onChange = (e: MediaQueryListEvent) => setSystemPrefersDark(e.matches);
      mq.addEventListener('change', onChange);
      return () => mq.removeEventListener('change', onChange);
    } catch {
      return undefined;
    }
  }, []);

  // Sync html.dark before paint (first paint, user toggles, system flips).
  useLayoutEffect(() => {
    applyDocumentTheme(isDark);
  }, [isDark]);

  usePersistEffect(theme, (value) => writeStorage(THEME_STORAGE_KEY, value));

  const setTheme = useCallback((next: ThemeMode) => {
    const dark = resolveThemeIsDark(next, systemPrefersDarkRef.current);
    // Switch the CSS immediately, before React re-renders the tree.
    applyDocumentTheme(dark);
    void applyNativeChrome(dark).catch(() => {});
    startTransition(() => setThemeState(next));
  }, []);

  const state = useMemo(() => ({ theme, isDark }), [theme, isDark]);
  const actions = useMemo(() => ({ setTheme }), [setTheme]);

  return (
    <ThemeActionsContext.Provider value={actions}>
      <ThemeStateContext.Provider value={state}>{children}</ThemeStateContext.Provider>
    </ThemeActionsContext.Provider>
  );
}

export function useTheme(): ThemeState {
  const value = useContext(ThemeStateContext);
  if (!value) throw new Error('useTheme must be used inside ThemeProvider');
  return value;
}

export function useThemeActions(): ThemeActions {
  const value = useContext(ThemeActionsContext);
  if (!value) throw new Error('useThemeActions must be used inside ThemeProvider');
  return value;
}
