import React, { useCallback } from 'react';
import type { HabitCompletionEvent, IdentityEvidence, Habit, MomentumEvent } from '../types';
import { useHabitEditActions } from '../hooks/useHabitEditActions';
import { clearDeviceCaches } from '../lib/deviceCache';
import { useLedger, useLedgerActions } from '../providers/HabitLedgerProvider';
import { usePreferences, usePreferencesActions } from '../providers/PreferencesProvider';
import { useSessionActions } from '../providers/SessionProvider';
import { useTheme, useThemeActions } from '../providers/ThemeProvider';
import { useUIActions } from '../providers/UIProvider';

const SettingsView = React.lazy(() => import('../components/SettingsView').then((m) => ({ default: m.SettingsView })));

/** App settings, data management, backup and account deletion. */
export function SettingsRoute({ onScroll }: { onScroll: (event: React.UIEvent<HTMLElement>) => void }) {
  const { theme } = useTheme();
  const { setTheme } = useThemeActions();
  const { notificationWindows, eveningChronicle, completionSound, hapticVibration } = usePreferences();
  const preferences = usePreferencesActions();
  const { habits, evidenceList, completionEvents, momentumEvents } = useLedger();
  const { clearWorkspace, restoreHabit, importBackup } = useLedgerActions();
  const { deleteHabit } = useHabitEditActions();
  const { deleteAccount } = useSessionActions();
  const { setTab } = useUIActions();
  const openHome = useCallback(() => setTab('home'), [setTab]);

  const onImportJSON = useCallback(
    (
      importedHabits: Habit[],
      evidence?: IdentityEvidence[],
      events?: HabitCompletionEvent[],
      momentum?: MomentumEvent[]
    ) =>
      importBackup({
        habits: importedHabits,
        evidence: Array.isArray(evidence) ? evidence : undefined,
        completionEvents: Array.isArray(events) ? events : undefined,
        momentumEvents: Array.isArray(momentum) ? momentum : undefined,
      }),
    [importBackup]
  );
  const onDeleteAccount = useCallback(async () => {
    await deleteAccount();
  }, [deleteAccount]);

  return (
    <SettingsView
      habits={habits}
      evidenceList={evidenceList}
      completionEvents={completionEvents}
      momentumEvents={momentumEvents}
      theme={theme}
      onThemeChange={setTheme}
      notificationWindows={notificationWindows}
      onToggleNotificationWindow={preferences.toggleNotificationWindow}
      eveningChronicle={eveningChronicle}
      onEveningChronicleChange={preferences.setEveningChronicle}
      completionSound={completionSound}
      onCompletionSoundChange={preferences.setCompletionSound}
      hapticVibration={hapticVibration}
      onHapticVibrationChange={preferences.setHapticVibration}
      onResetData={clearWorkspace}
      onRestoreHabit={restoreHabit}
      onDeleteHabit={deleteHabit}
      onImportJSON={onImportJSON}
      onDeleteAccount={onDeleteAccount}
      onClearCache={clearDeviceCaches}
      onScroll={onScroll}
      onOpenSettings={openHome}
    />
  );
}
