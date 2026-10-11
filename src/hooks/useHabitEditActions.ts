import { useMemo } from 'react';
import type { Habit } from '../types';
import { useLedgerActions } from '../providers/HabitLedgerProvider';
import { useUIActions } from '../providers/UIProvider';

/** Habit edits that also close or refresh the habit's open modal. */
export function useHabitEditActions() {
  const ledger = useLedgerActions();
  const { closeModal, updateModal } = useUIActions();
  return useMemo(
    () => ({
      archiveHabit(habitId: string) {
        ledger.archiveHabit(habitId);
        closeModal('habitDetail', habitId);
      },
      deleteHabit(habitId: string) {
        ledger.deleteHabit(habitId);
        closeModal('habitDetail', habitId);
      },
      updateHabit(habit: Habit) {
        updateModal({ kind: 'habitDetail', habit: ledger.updateHabit(habit) });
      },
    }),
    [ledger, closeModal, updateModal]
  );
}
