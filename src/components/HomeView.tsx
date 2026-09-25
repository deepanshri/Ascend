import React, { useEffect, useMemo, useState } from 'react';
import { Bowl } from './Bowl';
import { MomentumPill } from './MomentumPill';
import type { AccumulationPiece, BowlFill, CycleDays } from '../services/reportService';
import type { Habit } from '../types';
import { getTodayDayIndex } from '../utils/dates';
import type { FlightHandoffVelocity } from './FlyingPieceOverlay';

interface HomeViewProps {
  pieces: AccumulationPiece[];
  bowlFill: BowlFill;
  momentumScore: number;
  /** Increments on each habit completion / miss so the island always pulses. */
  momentumPulse?: number;
  onCycleDaysChange: (days: CycleDays) => void;
  celebrating?: boolean;
  onCelebrationDone?: () => void;
  deferredPieceIds?: ReadonlySet<string>;
  settlePieceIds?: ReadonlySet<string>;
  settleHandoffs?: ReadonlyMap<string, FlightHandoffVelocity>;
  habits?: Habit[];
  todayIndex?: number;
  renderHabit?: (habit: Habit, index: number) => React.ReactNode;
  children?: React.ReactNode;
  examShieldActive?: boolean;
  onOpenExamShield?: () => void;
}

const EMPTY_PIECES: AccumulationPiece[] = [];

const HomeViewInner: React.FC<HomeViewProps> = ({
  pieces,
  bowlFill,
  momentumScore,
  momentumPulse = 0,
  onCycleDaysChange,
  celebrating = false,
  onCelebrationDone,
  deferredPieceIds,
  settlePieceIds,
  settleHandoffs,
  habits,
  todayIndex,
  renderHabit,
  children,
  examShieldActive = false,
  onOpenExamShield,
}) => {
  const safePieces = Array.isArray(pieces) ? pieces : EMPTY_PIECES;
  const fillPercent = Number.isFinite(bowlFill?.fillPercent) ? bowlFill.fillPercent : 0;
  const votes = Number.isFinite(bowlFill?.votes) ? bowlFill.votes : 0;
  const capacity = Number.isFinite(bowlFill?.capacity) ? Math.max(0, bowlFill.capacity) : 0;
  const cycleDays = Number.isFinite(bowlFill?.cycleDays) ? bowlFill.cycleDays : 7;
  const isOverflowing = Boolean(bowlFill?.isOverflowing);

  // Session-captured set of habit IDs that were ALREADY completed when the app opened
  const [initialCompletedIds, setInitialCompletedIds] = useState<Set<string> | null>(null);

  // Capture initial completion state ONCE per session when habits data is first loaded
  useEffect(() => {
    if (initialCompletedIds === null && habits && habits.length > 0) {
      const completedSet = new Set<string>();
      const checkDay = todayIndex ?? getTodayDayIndex();
      for (const habit of habits) {
        if (Boolean(habit.days?.[checkDay])) {
          completedSet.add(habit.id);
        }
      }
      setInitialCompletedIds(completedSet);
    }
  }, [habits, todayIndex, initialCompletedIds]);

  // Split habits array into Active vs Completed sections based strictly on initial mount status
  const { activeHabits, sessionCompletedHabits } = useMemo(() => {
    if (!habits || habits.length === 0) {
      return { activeHabits: [], sessionCompletedHabits: [] };
    }
    if (!initialCompletedIds) {
      // Prior to initial snapshot settling, keep habits in active list
      return { activeHabits: habits, sessionCompletedHabits: [] };
    }
    const active: Habit[] = [];
    const completed: Habit[] = [];
    for (const habit of habits) {
      if (initialCompletedIds.has(habit.id)) {
        completed.push(habit);
      } else {
        active.push(habit);
      }
    }
    return { activeHabits: active, sessionCompletedHabits: completed };
  }, [habits, initialCompletedIds]);

  return (
    <div className="mt-0 flex w-full flex-col items-center pt-1">
      <div className="relative z-10 mb-1 flex flex-col items-center justify-center">
        <MomentumPill
          momentumScore={momentumScore}
          momentumPulse={momentumPulse}
        />
        {examShieldActive && (
          <div
            id="home-exam-shield-banner"
            className="mt-1.5 px-3 py-1 rounded-full bg-[#E8F8EE]/90 dark:bg-blue-950/80 border border-[#23C15D]/40 dark:border-blue-800 text-[11px] font-semibold text-[#165B33] dark:text-blue-300 flex items-center space-x-1.5 shadow-xs pointer-events-none select-none"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-[#23C15D] dark:bg-blue-400 animate-pulse" />
            <span>Exam Shield Active · Momentum decay is frozen (δ = 0)</span>
          </div>
        )}
      </div>

      <div className="mx-auto mt-0 flex w-full flex-col items-center justify-center">
        <Bowl
          completedCount={safePieces.length}
          pieces={safePieces}
          fillPercent={fillPercent}
          isOverflowing={isOverflowing}
          votes={votes}
          capacity={capacity}
          cycleDays={cycleDays}
          onCycleDaysChange={onCycleDaysChange}
          celebrating={celebrating}
          onCelebrationDone={onCelebrationDone}
          deferredPieceIds={deferredPieceIds}
          settlePieceIds={settlePieceIds}
          settleHandoffs={settleHandoffs}
        />
      </div>

      <div className="mt-1.5 flex w-full flex-col gap-2">
        {children}

        {renderHabit && (
          <section id="habit-list" className="mt-0.5 flex flex-col gap-2.5 gpu-smooth">
            {activeHabits.length === 0 && sessionCompletedHabits.length === 0 ? (
              <div className="bg-white/80 dark:bg-slate-800/80 rounded-2xl p-6 text-center text-slate-400 dark:text-slate-500 text-[13px] border border-slate-200/80 dark:border-slate-700/80">
                No habits active yet. Tap &quot;+&quot; in the header to create one!
              </div>
            ) : (
              activeHabits.map((habit, index) => renderHabit(habit, index))
            )}

            {sessionCompletedHabits.length > 0 && (
              <>
                <div className="mt-8 mb-4">
                  <h3 className="text-sm font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider px-4">
                    Completed
                  </h3>
                </div>
                {sessionCompletedHabits.map((habit, index) =>
                  renderHabit(habit, activeHabits.length + index)
                )}
              </>
            )}
          </section>
        )}
      </div>
    </div>
  );
};

function homeViewPropsAreEqual(prev: HomeViewProps, next: HomeViewProps): boolean {
  return (
    prev.momentumScore === next.momentumScore &&
    prev.momentumPulse === next.momentumPulse &&
    prev.celebrating === next.celebrating &&
    prev.todayIndex === next.todayIndex &&
    prev.examShieldActive === next.examShieldActive &&
    prev.pieces === next.pieces &&
    prev.bowlFill === next.bowlFill &&
    prev.habits === next.habits &&
    prev.deferredPieceIds === next.deferredPieceIds &&
    prev.settlePieceIds === next.settlePieceIds &&
    prev.settleHandoffs === next.settleHandoffs &&
    prev.onCycleDaysChange === next.onCycleDaysChange &&
    prev.onCelebrationDone === next.onCelebrationDone &&
    prev.onOpenExamShield === next.onOpenExamShield &&
    prev.renderHabit === next.renderHabit &&
    prev.children === next.children
  );
}

export const HomeView = React.memo(HomeViewInner, homeViewPropsAreEqual);
