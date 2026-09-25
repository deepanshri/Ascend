/**
 * Theme store — sync DOM class instantly; React subscribers update WebGL in-place.
 * Avoids waiting on App re-render for visual theme switches.
 */

type ThemeListener = () => void;

let dark = false;
const listeners = new Set<ThemeListener>();

try {
  if (typeof document !== 'undefined' && document.documentElement.classList.contains('dark')) {
    dark = true;
  } else if (typeof localStorage !== 'undefined') {
    const saved = localStorage.getItem('ascend_theme');
    if (saved === 'dark') {
      dark = true;
    } else if (saved === 'system' && typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      dark = true;
    }
  }
} catch {
  dark = false;
}

export function getThemeIsDark(): boolean {
  return dark;
}

export function subscribeTheme(listener: ThemeListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Apply html.dark + notify WebGL leaves. Call synchronously on user toggle. */
export function applyDocumentTheme(nextDark: boolean): void {
  if (typeof document !== 'undefined') {
    if (nextDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    document.documentElement.style.colorScheme = nextDark ? 'dark' : 'light';
  }
  if (dark === nextDark) return;
  dark = nextDark;
  listeners.forEach((listener) => {
    try {
      listener();
    } catch {
      /* subscriber errors must not block theme */
    }
  });
}

export function resolveThemeIsDark(
  theme: 'light' | 'dark' | 'system',
  systemPrefersDark: boolean
): boolean {
  return theme === 'dark' || (theme === 'system' && systemPrefersDark);
}
