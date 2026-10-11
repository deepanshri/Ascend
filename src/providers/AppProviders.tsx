import React from 'react';
import { OnboardingProvider } from './OnboardingProvider';
import { PreferencesProvider } from './PreferencesProvider';
import { RemindersProvider } from './RemindersProvider';
import { SessionProvider } from './SessionProvider';
import { ThemeProvider } from './ThemeProvider';
import { UIProvider } from './UIProvider';

/** App-wide providers, outermost first. */
export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <SessionProvider>
        <OnboardingProvider>
          <PreferencesProvider>
            <RemindersProvider>
              <UIProvider>{children}</UIProvider>
            </RemindersProvider>
          </PreferencesProvider>
        </OnboardingProvider>
      </SessionProvider>
    </ThemeProvider>
  );
}
