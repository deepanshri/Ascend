import React from 'react';
import { PreferencesProvider } from './PreferencesProvider';
import { RemindersProvider } from './RemindersProvider';
import { ThemeProvider } from './ThemeProvider';

/** App-wide providers, outermost first. */
export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <PreferencesProvider>
        <RemindersProvider>{children}</RemindersProvider>
      </PreferencesProvider>
    </ThemeProvider>
  );
}
