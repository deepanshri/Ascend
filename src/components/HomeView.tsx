import React, { useState, useEffect, useMemo, useRef } from 'react';
import { AnimatePresence } from 'motion/react';
import { Bowl } from './Bowl';
import { MomentumPill } from './MomentumPill';
import type { AccumulationPiece, BowlFill, CycleDays } from '../services/reportService';
import type { Habit } from '../types';
import { getTodayDayIndex, getLocalDateString } from '../utils/dates';
import type { FlightHandoffVelocity } from './FlyingPieceOverlay';

interface HomeViewProps {
  isActive?: boolean;
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
  rolledOverHabits?: string[];
  onRolloverAll?: () => void;
}

const EMPTY_PIECES: AccumulationPiece[] = [];

const HomeViewInner: React.FC<HomeViewProps> = ({
  isActive = true,
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
  rolledOverHabits,
  onRolloverAll,
}) => {
  const safePieces = Array.isArray(pieces) ? pieces : EMPTY_PIECES;
  const fillPercent = Number.isFinite(bowlFill?.fillPercent) ? bowlFill.fillPercent : 0;
  const votes = Number.isFinite(bowlFill?.votes) ? bowlFill.votes : 0;
  const capacity = Number.isFinite(bowlFill?.capacity) ? Math.max(0, bowlFill.capacity) : 0;
  const cycleDays = Number.isFinite(bowlFill?.cycleDays) ? bowlFill.cycleDays : 7;
  const isOverflowing = Boolean(bowlFill?.isOverflowing);

  const checkDay = todayIndex ?? getTodayDayIndex();

  // Visual snapshot of completed habit IDs (delayed by 5000ms on state changes)
  const [visualCompletedIds, setVisualCompletedIds] = useState<Set<string>>(() => {
    const set = new Set<string>();
    if (habits) {
      for (const habit of habits) {
        if (Boolean(habit.days?.[checkDay])) {
          set.add(habit.id);
        }
      }
    }
    return set;
  });

  const initializedRef = useRef(false);
  const lastActiveDateRef = useRef(getLocalDateString());

  useEffect(() => {
    const todayStr = getLocalDateString();
    if (lastActiveDateRef.current !== todayStr) {
      lastActiveDateRef.current = todayStr;
      pendingTimersRef.current.forEach((id) => window.clearTimeout(id));
      pendingTimersRef.current.clear();
      pendingBatchChangesRef.current.clear();
      const freshSet = new Set<string>();
      for (const habit of habits || []) {
        if (Boolean(habit.days?.[checkDay])) {
          freshSet.add(habit.id);
        }
      }
      setVisualCompletedIds(freshSet);
      return;
    }

    if (!initializedRef.current && habits && habits.length > 0) {
      initializedRef.current = true;
      const initialSet = new Set<string>();
      for (const habit of habits) {
        if (Boolean(habit.days?.[checkDay])) {
          initialSet.add(habit.id);
        }
      }
      setVisualCompletedIds(initialSet);
    }
  }, [habits, checkDay]);

  // Maintain 5000ms debounced batch reordering timer when actual completion changes
  const pendingTimersRef = useRef<Map<string, number>>(new Map());
  const pendingBatchChangesRef = useRef<Map<string, boolean>>(new Map());

  useEffect(() => {
    if (!habits) return;

    for (const habit of habits) {
      const isActualDone = Boolean(habit.days?.[checkDay]);
      const isVisualDone = visualCompletedIds.has(habit.id);

      if (isActualDone !== isVisualDone) {
        pendingBatchChangesRef.current.set(habit.id, isActualDone);
      } else {
        // State reverted or settled — remove from pending batch
        pendingBatchChangesRef.current.delete(habit.id);
      }
    }

    if (pendingBatchChangesRef.current.size === 0) {
      const existingBatch = pendingTimersRef.current.get('batch');
      if (existingBatch !== undefined) {
        window.clearTimeout(existingBatch);
        pendingTimersRef.current.delete('batch');
      }
      return;
    }

    // Debounce batch transition: reset timer so multiple completions within 5s merge into a single tick
    const existingBatch = pendingTimersRef.current.get('batch');
    if (existingBatch !== undefined) {
      window.clearTimeout(existingBatch);
    }

    const timerId = window.setTimeout(() => {
      pendingTimersRef.current.delete('batch');
      const batchToApply = new Map(pendingBatchChangesRef.current);
      pendingBatchChangesRef.current.clear();

      if (batchToApply.size > 0) {
        setVisualCompletedIds((prev) => {
          const next = new Set(prev);
          for (const [habitId, isDone] of batchToApply.entries()) {
            if (isDone) {
              next.add(habitId);
            } else {
              next.delete(habitId);
            }
          }
          return next;
        });
      }
    }, 5000);

    pendingTimersRef.current.set('batch', timerId);
  }, [habits, checkDay, visualCompletedIds]);

  useEffect(() => {
    return () => {
      for (const timerId of pendingTimersRef.current.values()) {
        window.clearTimeout(timerId);
      }
      pendingTimersRef.current.clear();
      pendingBatchChangesRef.current.clear();
    };
  }, []);

  // Split habits array into Active vs Completed sections based on visualCompletedIds
  const { activeHabits, sessionCompletedHabits } = useMemo(() => {
    if (!habits || habits.length === 0) {
      return { activeHabits: [], sessionCompletedHabits: [] };
    }
    const active: Habit[] = [];
    const completed: Habit[] = [];
    for (const habit of habits) {
      if (visualCompletedIds.has(habit.id)) {
        completed.push(habit);
      } else {
        active.push(habit);
      }
    }
    // Pin uncompleted Keystone habit to index 0 at the very top of the list
    active.sort((a, b) => (b.isKeystone ? 1 : 0) - (a.isKeystone ? 1 : 0));
    return { activeHabits: active, sessionCompletedHabits: completed };
  }, [habits, visualCompletedIds]);

  const [isBowlInView, setIsBowlInView] = useState(true);
  const bowlContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const target = bowlContainerRef.current;
    if (!target) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsBowlInView(entry.isIntersecting);
      },
      { threshold: 0.05 }
    );

    observer.observe(target);
    return () => {
      observer.disconnect();
    };
  }, []);

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

      <div ref={bowlContainerRef} className="mx-auto mt-0 flex w-full flex-col items-center justify-center">
        <Bowl
          isActive={isActive && isBowlInView}
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

        {rolledOverHabits && rolledOverHabits.length > 0 && onRolloverAll && (
          <div
            id="home-rollover-banner"
            className="bg-amber-500/10 dark:bg-amber-500/15 border border-amber-500/30 rounded-2xl p-3.5 flex items-center justify-between text-xs gap-3 shadow-xs"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="w-2 h-2 rounded-full bg-amber-500 dark:bg-amber-400 shrink-0 animate-pulse" />
              <span className="text-amber-900 dark:text-amber-200 font-medium leading-snug">
                Unfinished habits from yesterday available for 24h grace rollover.
              </span>
            </div>
            <button
              type="button"
              id="home-rollover-all-btn"
              onClick={onRolloverAll}
              className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white font-semibold rounded-xl shrink-0 transition-colors cursor-pointer shadow-xs active:scale-95"
            >
              Rollover All
            </button>
          </div>
        )}

        {renderHabit && (
          <section id="habit-list" className="mt-0.5 flex flex-col gap-2.5 gpu-smooth bg-canvas">
            {activeHabits.length === 0 && sessionCompletedHabits.length === 0 ? (
              <div className="bg-white/80 dark:bg-slate-800/80 rounded-2xl p-6 text-center text-slate-400 dark:text-slate-500 text-[13px] border border-slate-200/80 dark:border-slate-700/80">
                No habits active yet. Tap &quot;+&quot; in the header to create one!
              </div>
            ) : (
              <AnimatePresence mode="popLayout">
                {activeHabits.map((habit, index) => renderHabit(habit, index))}
              </AnimatePresence>
            )}

            {sessionCompletedHabits.length > 0 && (
              <>
                <div className="mt-8 mb-4">
                  <h3 className="text-sm font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider px-4">
                    Completed
                  </h3>
                </div>
                <AnimatePresence mode="popLayout">
                  {sessionCompletedHabits.map((habit, index) =>
                    renderHabit(habit, activeHabits.length + index)
                  )}
                </AnimatePresence>
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
    prev.isActive === next.isActive &&
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
    prev.renderHabit === next.renderHabit &&
    prev.children === next.children &&
    prev.rolledOverHabits === next.rolledOverHabits &&
    prev.onRolloverAll === next.onRolloverAll
  );
}

export const HomeView = React.memo(HomeViewInner, homeViewPropsAreEqual);
