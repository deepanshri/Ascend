import { useCallback } from 'react';
import { pulseCompletionHaptic } from '../lib/completionFeedback';
import { useBowlActions } from '../providers/BowlProvider';
import { useLedgerActions } from '../providers/HabitLedgerProvider';

export type CompleteHabit = (
  habitId: string,
  isFallback?: boolean,
  originCoord?: { x: number; y: number; marbleColor?: string; touchRatio?: number }
) => void;

/**
 * Complete a habit today (full, or micro when `isFallback` or fallback mode
 * is on). The ledger records it; a first completion today earns the reward:
 * a haptic and a marble thrown from the card into the bowl.
 */
export function useCompleteHabit(): CompleteHabit {
  const { completeToday } = useLedgerActions();
  const { launchFlight } = useBowlActions();
  return useCallback(
    (habitId, isFallback = false, originCoord) => {
      const result = completeToday(habitId, isFallback);
      if (!result?.newlyCompleted) return;
      try {
        void pulseCompletionHaptic(result.isMicro ? 'fallback' : 'full');
      } catch {
        /* never block completion on feedback failure */
      }
      launchFlight({ habitId, isMicro: result.isMicro, loggedDate: result.loggedDate, originCoord });
    },
    [completeToday, launchFlight]
  );
}
