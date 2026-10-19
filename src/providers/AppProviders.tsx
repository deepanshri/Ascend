import React from 'react';
import { AccountSyncController } from './AccountSyncController';
import { BowlProvider } from './BowlProvider';
import { CalendarProvider } from './CalendarProvider';
import { ChronicleHydrator } from './ChronicleHydrator';
import { ChronicleReminderSync } from './ChronicleReminderSync';
import { HabitLedgerProvider } from './HabitLedgerProvider';
import { NativeSyncController } from './NativeSyncController';
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
                <HabitLedgerProvider>
                  <AccountSyncController>
                    <RemindersProvider>
                      <NativeSyncController>
                        <BowlProvider>
                          <UIProvider>
                            <ChronicleHydrator />
                            <ChronicleReminderSync />
                            {children}
                          </UIProvider>
                        </BowlProvider>
                      </NativeSyncController>
                    </RemindersProvider>
                  </AccountSyncController>
                </HabitLedgerProvider>
              </ProtectionProvider>
            </CalendarProvider>
          </PreferencesProvider>
        </OnboardingProvider>
      </SessionProvider>
    </ThemeProvider>
  );
}
