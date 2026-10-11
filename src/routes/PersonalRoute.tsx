import React, { useCallback, useMemo } from 'react';
import { persistUserProfile } from '../lib/profile';
import { useAccountSync } from '../providers/AccountSyncController';
import { useCalendar } from '../providers/CalendarProvider';
import { useLedger } from '../providers/HabitLedgerProvider';
import { usePreferencesActions, usePreferences } from '../providers/PreferencesProvider';
import { toggleInterest } from '../providers/preferencesReducer';
import { useProtection, useProtectionActions } from '../providers/ProtectionProvider';
import { useSession, useSessionActions } from '../providers/SessionProvider';
import { useUIActions } from '../providers/UIProvider';
import { calculateMomentumScore } from '../utils/momentumCore';
import { endOfIsoDate } from '../utils/dates';

const PersonalView = React.lazy(() => import('../components/PersonalView').then((m) => ({ default: m.PersonalView })));

/** Profile, interests, protection modes and account actions. */
export function PersonalRoute({ onScroll }: { onScroll: (event: React.UIEvent<HTMLElement>) => void }) {
  const { session } = useSession();
  const { signOut, updateAvatar, updateName } = useSessionActions();
  const { syncNow } = useAccountSync();
  const { selectedInterests } = usePreferences();
  const { setSelectedInterests } = usePreferencesActions();
  const { protectionWindows, examShieldActive, vacationModeActive, examShieldStatus, vacationStatus } = useProtection();
  const { deactivateExamShield, toggleVacation } = useProtectionActions();
  const { isViewingToday, selectedIso } = useCalendar();
  const { habits, evidenceList, identityVoteCount, todayMomentumEvents, todayMomentumScore } = useLedger();
  const { setTab, openModal } = useUIActions();

  // Momentum as of the day selected in the calendar.
  const momentumScore = useMemo(
    () =>
      isViewingToday
        ? todayMomentumScore
        : calculateMomentumScore(todayMomentumEvents, { asOf: endOfIsoDate(selectedIso), habits, protectionWindows }),
    [isViewingToday, todayMomentumScore, todayMomentumEvents, selectedIso, habits, protectionWindows]
  );

  const onToggleInterest = useCallback(
    (interest: string) => {
      const next = toggleInterest(selectedInterests, interest);
      setSelectedInterests(next);
      if (session && !session.isGuest) void persistUserProfile(session, { interests: next }).catch(() => {});
    },
    [selectedInterests, setSelectedInterests, session]
  );
  // Turning Exam Shield on asks for confirmation first; turning it off is immediate.
  const onToggleExamShield = useCallback(() => {
    if (examShieldActive) deactivateExamShield();
    else openModal({ kind: 'examShield' });
  }, [examShieldActive, deactivateExamShield, openModal]);
  const openSettings = useCallback(() => setTab('settings'), [setTab]);
  const openLedger = useCallback(() => openModal({ kind: 'identityLedger' }), [openModal]);
  const openChangePassword = useCallback(() => openModal({ kind: 'changePassword' }), [openModal]);

  return (
    <PersonalView
      userSession={session}
      evidenceList={evidenceList}
      identityVoteCount={identityVoteCount}
      selectedInterests={selectedInterests}
      onToggleInterest={onToggleInterest}
      examShieldActive={examShieldActive}
      examShieldStatus={examShieldStatus}
      onToggleExamShield={onToggleExamShield}
      vacationModeActive={vacationModeActive}
      vacationStatus={vacationStatus}
      onToggleVacationMode={toggleVacation}
      momentumScore={momentumScore}
      onOpenSettings={openSettings}
      onOpenLedger={openLedger}
      onSyncNow={syncNow}
      onChangePassword={openChangePassword}
      onUpdateAvatar={updateAvatar}
      onLogout={signOut}
      onUpdateName={updateName}
      onScroll={onScroll}
    />
  );
}
