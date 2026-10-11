import React, { useCallback, useMemo } from 'react';
import { ModalHost } from '../components/ModalHost';
import { useHabitEditActions } from '../hooks/useHabitEditActions';
import { pulseCompletionHaptic } from '../lib/completionFeedback';
import { hasLogOn } from '../lib/habitLogs';
import { useCalendar } from '../providers/CalendarProvider';
import { useLedger, useLedgerActions } from '../providers/HabitLedgerProvider';
import { useProtection, useProtectionActions } from '../providers/ProtectionProvider';
import { useSession } from '../providers/SessionProvider';
import { useUI, useUIActions } from '../providers/UIProvider';
import { findModal } from '../providers/uiReducer';

/** Every app-level modal, fed from the providers. */
export const ModalLayer = React.memo(function ModalLayer() {
  const { session } = useSession();
  const { modalStack } = useUI();
  const { markChronicleSaved } = useUIActions();
  const { todayIso, originIso, todayDayIndex, isViewingToday } = useCalendar();
  const { examShieldStatus } = useProtection();
  const { activateExamShield } = useProtectionActions();
  const { habits, derivedHabits, completionEvents, activeFallbackIds, pendingFriction, evidenceList, identityVoteCount } =
    useLedger();
  const ledger = useLedgerActions();
  const edits = useHabitEditActions();

  const longPressedId = findModal(modalStack, 'habitLongPress')?.habitId ?? null;
  const longPressedHabit = useMemo(
    () => (longPressedId ? derivedHabits.find((habit) => habit.id === longPressedId) ?? null : null),
    [derivedHabits, longPressedId]
  );
  const frictionRolloverMicro = useCallback(() => {
    if (ledger.frictionRolloverMicro() > 0) void pulseCompletionHaptic('fallback');
  }, [ledger]);

  return (
    <ModalHost
      session={session}
      habits={habits}
      todayDayIndex={todayDayIndex}
      todayIso={originIso}
      longPressedHabit={longPressedHabit}
      longPressedCompletedToday={longPressedHabit ? hasLogOn(completionEvents, longPressedHabit.id, todayIso) : false}
      longPressedFallbackActive={Boolean(longPressedHabit) && isViewingToday && activeFallbackIds.includes(longPressedHabit!.id)}
      onAddHabit={ledger.addHabit}
      onUpdateHabit={edits.updateHabit}
      onArchiveHabit={edits.archiveHabit}
      onDeleteHabit={edits.deleteHabit}
      frictionPrompt={pendingFriction[0] ?? null}
      onFrictionSubmit={ledger.submitFriction}
      onFrictionSkip={ledger.skipFriction}
      onFrictionRolloverMicro={frictionRolloverMicro}
      onChronicleSave={markChronicleSaved}
      ledgerEvidence={evidenceList}
      identityVoteCount={identityVoteCount}
      onAddManualVote={ledger.addManualVote}
      examShieldStatus={examShieldStatus}
      onConfirmActivateExamShield={activateExamShield}
    />
  );
});
