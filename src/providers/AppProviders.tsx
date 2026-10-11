import React from 'react';
import { PreferencesProvider } from './PreferencesProvider';
import { RemindersProvider } from './RemindersProvider';
import { ThemeProvider } from './ThemeProvider';
import { UIProvider } from './UIProvider';

/** App-wide providers, outermost first. */
export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <PreferencesProvider>
        <RemindersProvider>
          <UIProvider>{children}</UIProvider>
        </RemindersProvider>
      </PreferencesProvider>
    </ThemeProvider>
  );
}
