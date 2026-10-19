import React, { Suspense } from 'react';
import { AnimatePresence } from 'motion/react';
import type { Habit, HabitCategory, IdentityEvidence, UserSession } from '../types';
import type { PendingFrictionPrompt } from '../lib/frictionAudit';
import type { ProtectionModeStatus } from '../lib/protection';
import { countActiveKeystones } from '../lib/keystone';
import { countActiveHabits } from '../lib/protection';
import { findModal } from '../providers/uiReducer';
import { useUI, useUIActions } from '../providers/UIProvider';
import { AddHabitModal } from './AddHabitModal';
import { ChangePasswordModal } from './ChangePasswordModal';
import { ExamShieldModal } from './ExamShieldModal';
import { HabitLongPressOverlay } from './HabitLongPressOverlay';
import { VisionReminderModal } from './VisionReminderModal';

const HabitDetailModal = React.lazy(() => import('./HabitDetailModal').then((m) => ({ default: m.HabitDetailModal })));
const DeleteHabitConfirmModal = React.lazy(() =>
  import('./DeleteHabitConfirmModal').then((m) => ({ default: m.DeleteHabitConfirmModal }))
);
const IdentityLedgerModal = React.lazy(() =>
  import('./IdentityLedgerModal').then((m) => ({ default: m.IdentityLedgerModal }))
);
const FrictionAuditModal = React.lazy(() => import('./FrictionAuditModal').then((m) => ({ default: m.FrictionAuditModal })));
const ChronicleModal = React.lazy(() => import('./ChronicleModal').then((m) => ({ default: m.ChronicleModal })));

/**
 * Domain data and handlers the App-level modals need. These come from App
 * until the ledger, protection and calendar providers exist (Phase 3 steps 5-8).
 */
export interface ModalHostProps {
  session: UserSession | null;
  habits: Habit[];
  todayDayIndex: number;
  todayIso: string;
  longPressedHabit: Habit | null;
  longPressedCompletedToday: boolean;
  longPressedFallbackActive: boolean;
  onAddHabit: (habit: Omit<Habit, 'id' | 'days' | 'microDays'>) => Habit | null;
  onUpdateHabit: (habit: Habit) => void;
  onArchiveHabit: (habitId: string) => void;
  onDeleteHabit: (habitId: string) => void;
  frictionPrompt: PendingFrictionPrompt | null;
  onFrictionSubmit: (reason: string) => void;
  onFrictionSkip: () => void;
  onFrictionRolloverMicro: () => void;
  onChronicleSave: () => void;
  ledgerEvidence: IdentityEvidence[];
  identityVoteCount: number;
  onAddManualVote: (habitName: string, identityStatement: string, category: HabitCategory) => void;
  examShieldStatus: ProtectionModeStatus;
  onConfirmActivateExamShield: () => void;
}

/** Renders every App-level modal from the UI modal stack. */
export function ModalHost(props: ModalHostProps) {
  const { modalStack } = useUI();
  const { openModal, closeModal } = useUIActions();

  const addHabit = findModal(modalStack, 'addHabit');
  const detail = findModal(modalStack, 'habitDetail');
  const deleteConfirm = findModal(modalStack, 'deleteHabit');
  const longPress = findModal(modalStack, 'habitLongPress');
  const vision = findModal(modalStack, 'visionReminder');
  const chronicleOpen = Boolean(findModal(modalStack, 'chronicle'));
  const ledgerOpen = Boolean(findModal(modalStack, 'identityLedger'));
  const examShieldOpen = Boolean(findModal(modalStack, 'examShield'));
  const passwordOpen = Boolean(findModal(modalStack, 'changePassword'));
  const activeKeystoneCount = countActiveKeystones(props.habits);

  /** Replace whatever habit modal is showing with the delete confirmation. */
  const confirmDelete = (habit: Habit) => {
    closeModal('habitLongPress');
    closeModal('habitDetail');
    openModal({ kind: 'deleteHabit', habit });
  };

  return (
    <>
      {/* Spotlighted habit with whole-screen blur and edit / delete actions */}
      <AnimatePresence>
        {longPress && props.longPressedHabit && (
          <HabitLongPressOverlay
            key="habit-long-press"
            habit={props.longPressedHabit}
            rect={longPress.rect}
            todayIndex={props.todayDayIndex}
            isCompletedToday={props.longPressedCompletedToday}
            isFallbackActive={props.longPressedFallbackActive}
            onClose={() => closeModal('habitLongPress')}
            onOpenEdit={(habit) => {
              closeModal('habitLongPress');
              openModal({ kind: 'habitDetail', habit });
            }}
            onDelete={confirmDelete}
          />
        )}
      </AnimatePresence>

      {addHabit && (
        <Suspense fallback={null}>
          <AddHabitModal
            isOpen
            onClose={() => closeModal('addHabit')}
            onAddHabit={props.onAddHabit}
            userId={props.session?.id}
            isGuest={props.session?.isGuest}
            activeHabitCount={countActiveHabits(props.habits)}
            activeKeystoneCount={activeKeystoneCount}
          />
        </Suspense>
      )}

      {detail && (
        <Suspense fallback={null}>
          <HabitDetailModal
            habit={detail.habit}
            isOpen
            onClose={() => closeModal('habitDetail')}
            onDeleteHabit={(habitId) => {
              const target = props.habits.find((item) => item.id === habitId) || detail.habit;
              confirmDelete(target);
            }}
            onUpdateHabit={props.onUpdateHabit}
            onArchiveHabit={props.onArchiveHabit}
            todayIndex={props.todayDayIndex}
            activeKeystoneCount={activeKeystoneCount}
          />
        </Suspense>
      )}

      {deleteConfirm && (
        <Suspense fallback={null}>
          <DeleteHabitConfirmModal
            habit={deleteConfirm.habit}
            isOpen
            onClose={() => closeModal('deleteHabit')}
            onConfirm={() => {
              props.onDeleteHabit(deleteConfirm.habit.id);
              closeModal('deleteHabit');
            }}
          />
        </Suspense>
      )}

      {props.frictionPrompt && !chronicleOpen && (
        <Suspense fallback={null}>
          <FrictionAuditModal
            isOpen
            habitName={props.frictionPrompt.habitName || ''}
            loggedDate={props.frictionPrompt.loggedDate}
            onSubmit={props.onFrictionSubmit}
            onSkip={props.onFrictionSkip}
            onRolloverMicro={props.onFrictionRolloverMicro}
          />
        </Suspense>
      )}

      <AnimatePresence>
        {vision && (
          <VisionReminderModal isOpen visionText={vision.text} onDismiss={() => closeModal('visionReminder')} />
        )}
      </AnimatePresence>

      {chronicleOpen && (
        <Suspense fallback={null}>
          <ChronicleModal
            isOpen
            todayIso={props.todayIso}
            onClose={() => closeModal('chronicle')}
            onSave={props.onChronicleSave}
            userId={props.session && !props.session.isGuest ? props.session.id : null}
          />
        </Suspense>
      )}

      {ledgerOpen && (
        <Suspense fallback={null}>
          <IdentityLedgerModal
            isOpen
            onClose={() => closeModal('identityLedger')}
            evidenceList={props.ledgerEvidence}
            identityVoteCount={props.identityVoteCount}
            onAddVote={props.onAddManualVote}
          />
        </Suspense>
      )}

      <ExamShieldModal
        isOpen={examShieldOpen}
        onClose={() => closeModal('examShield')}
        onConfirmActivate={props.onConfirmActivateExamShield}
        status={props.examShieldStatus}
      />

      <ChangePasswordModal isOpen={passwordOpen} onClose={() => closeModal('changePassword')} />
    </>
  );
}
