import React from 'react';
import { PreferencesProvider } from './PreferencesProvider';
import { ThemeProvider } from './ThemeProvider';

/** App-wide providers, outermost first. */
export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <PreferencesProvider>{children}</PreferencesProvider>
    </ThemeProvider>
  );
}
