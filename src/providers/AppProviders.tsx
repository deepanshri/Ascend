import React from 'react';
import { CalendarProvider } from './CalendarProvider';
import { OnboardingProvider } from './OnboardingProvider';
import { PreferencesProvider } from './PreferencesProvider';
import { ProtectionProvider } from './ProtectionProvider';
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
            <CalendarProvider>
              <ProtectionProvider>
                <RemindersProvider>
                  <UIProvider>{children}</UIProvider>
                </RemindersProvider>
              </ProtectionProvider>
            </CalendarProvider>
          </PreferencesProvider>
        </OnboardingProvider>
      </SessionProvider>
    </ThemeProvider>
  );
}
