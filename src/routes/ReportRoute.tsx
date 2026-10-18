import React, { useCallback } from 'react';
import { useBowl } from '../providers/BowlProvider';
import { useCalendar, useCalendarActions } from '../providers/CalendarProvider';
import { useLedger } from '../providers/HabitLedgerProvider';
import { usePreferences } from '../providers/PreferencesProvider';
import { useProtection } from '../providers/ProtectionProvider';
import { useSession } from '../providers/SessionProvider';
import { useTheme } from '../providers/ThemeProvider';
import { useUIActions } from '../providers/UIProvider';

const ReportView = React.lazy(() => import('../components/ReportView').then((m) => ({ default: m.ReportView })));

/** Momentum report, identity ledger summary and friction history. */
export function ReportRoute({ isActive, onScroll }: { isActive: boolean; onScroll: (event: React.UIEvent<HTMLElement>) => void }) {
  const { session } = useSession();
  const { isDark } = useTheme();
  const { cycleDays } = usePreferences();
  const { selectedIso } = useCalendar();
  const { selectDate } = useCalendarActions();
  const { derivedHabits, evidenceList, identityVoteCount, frictionAudits, todayMomentumScore, momentumEvents, completionEvents } =
    useLedger();
  const { cycleStartIso } = useBowl();
  const { protectionWindows } = useProtection();
  const { setTab, openModal } = useUIActions();
  const openSettings = useCallback(() => setTab('settings'), [setTab]);
  const openLedger = useCallback(() => openModal({ kind: 'identityLedger' }), [openModal]);

  return (
    <ReportView
      isActive={isActive}
      habits={derivedHabits}
      evidenceList={evidenceList}
      identityVoteCount={identityVoteCount}
      userId={session?.id}
      isGuest={session?.isGuest}
      userEmail={session?.email}
      userName={session?.name}
      onOpenLedger={openLedger}
      onOpenSettings={openSettings}
      frictionAudits={frictionAudits}
      onScroll={onScroll}
      isDark={isDark}
      momentumScore={todayMomentumScore}
      momentumEvents={momentumEvents}
      momentumHistory={momentumEvents}
      completionEvents={completionEvents}
      logs={completionEvents}
      protectionWindows={protectionWindows}
      selectedDayIso={selectedIso}
      onSelectDayIso={selectDate}
      cycleDays={cycleDays}
      cycleStartIso={cycleStartIso}
    />
  );
}
