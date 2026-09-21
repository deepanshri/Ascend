import React, { useState, useRef, useEffect, useCallback, memo, startTransition } from 'react';
import { motion, useMotionValue, useTransform, animate as motionAnimate } from 'motion/react';
import { StandaloneReminder } from '../types';
import { ASCEND_STATUS_CHIP_CLASS } from '../utils/categories';
import { addDaysIso, toISODate } from '../utils/dates';
import {
  SWIPE_COMMIT_PX as SWIPE_COMMIT_THRESHOLD,
  SWIPE_COMMIT_VELOCITY,
  SWIPE_DRAG_CONSTRAINTS,
  SPRING_TRANSITION,
} from '../hooks/useHorizontalSwipeDrag';
import { acquireSwipeScrollLock, forceReleaseSwipeScrollLock, releaseSwipeScrollLock } from '../lib/swipeScrollLock';

const SWIPE_COMMIT_PX = SWIPE_COMMIT_THRESHOLD;
const LONG_PRESS_MS = 400;
const GHOST_MOUSE_MS = 700;
const SWIPE_COMMIT_LOCK_MS = 280;
const SWIPE_COMMIT_DEFER_MS = 16;

interface ReminderCardProps {
  reminder: StandaloneReminder;
  /** Active list vs dimmed completed drawer. */
  variant?: 'active' | 'archived';
  /** True while the task stays in the active list after complete (Undo window). */
  inGrace?: boolean;
  onToggleComplete: (id: string) => void;
  onSetCompleted?: (id: string, completed: boolean) => void;
  onUndoGrace?: (id: string) => void;
  onDeleteReminder?: (id: string) => void;
  onSnoozeReminder?: (id: string, minutes: number) => void;
  onLongPress?: (reminder: StandaloneReminder, rect: DOMRect | null) => void;
}

function ReminderCardInner({
  reminder,
  variant = 'active',
  inGrace = false,
  onToggleComplete,
  onSetCompleted,
  onUndoGrace,
  onSnoozeReminder,
  onLongPress,
}: ReminderCardProps) {
  const [localCompleted, setLocalCompleted] = useState(Boolean(reminder.completed));
  const isArchived = variant === 'archived';

  const x = useMotionValue(0);
  const revealRightOpacity = useTransform(x, [8, 36], [0, 1]);
  const revealLeftOpacity = useTransform(x, [-8, -36], [0, 1]);
  const cardRotateZ = useTransform(x, [-125, 125], [-1.8, 1.8]);
  const cardScale = useTransform(x, [-125, 0, 125], [0.985, 1, 0.985]);
  const revealRightScale = useTransform(x, [10, SWIPE_COMMIT_PX], [0.85, 1.06]);
  const revealLeftScale = useTransform(x, [-10, -SWIPE_COMMIT_PX], [0.85, 1.06]);

  const cardRef = useRef<HTMLDivElement | null>(null);
  const swipeSurfaceRef = useRef<HTMLDivElement | null>(null);
  const startPosRef = useRef<{ x: number; y: number } | null>(null);
  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const dragStartXRef = useRef<number | null>(null);
  const gestureAxisRef = useRef<'none' | 'horizontal' | 'vertical'>('none');
  const wasLongPressRef = useRef(false);
  const hasMovedRef = useRef(false);
  const isDraggingRef = useRef(false);
  const commitLockRef = useRef(false);
  const lastTouchAtRef = useRef(0);
  const longPressTimerRef = useRef<number | null>(null);
  const localCompletedRef = useRef(localCompleted);
  localCompletedRef.current = localCompleted;
  const reminderRef = useRef(reminder);
  reminderRef.current = reminder;
  const onLongPressRef = useRef(onLongPress);
  onLongPressRef.current = onLongPress;
  const onToggleCompleteRef = useRef(onToggleComplete);
  onToggleCompleteRef.current = onToggleComplete;
  const onSetCompletedRef = useRef(onSetCompleted);
  onSetCompletedRef.current = onSetCompleted;
  const onUndoGraceRef = useRef(onUndoGrace);
  onUndoGraceRef.current = onUndoGrace;

  const clearLongPressTimer = useCallback(() => {
    if (longPressTimerRef.current !== null) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    setLocalCompleted(Boolean(reminder.completed));
  }, [reminder.completed]);

  useEffect(
    () => () => {
      clearLongPressTimer();
    },
    [clearLongPressTimer]
  );

  /** Persist completed immediately so metrics stay accurate; parent owns grace/archive UI. */
  const requestCompleted = useCallback((next: boolean) => {
    const id = reminderRef.current.id;
    setLocalCompleted(next);
    if (onSetCompletedRef.current) onSetCompletedRef.current(id, next);
    else onToggleCompleteRef.current(id);
  }, []);

  const setTouchAction = useCallback((mode: 'pan-y' | 'none') => {
    const el = swipeSurfaceRef.current;
    if (!el) return;
    el.style.touchAction = mode;
    el.classList.toggle('is-swiping', mode === 'none');
  }, []);

  const beginSwipeSession = useCallback(() => {
    clearLongPressTimer();
    hasMovedRef.current = true;
    gestureAxisRef.current = 'horizontal';
    isDraggingRef.current = true;
    setTouchAction('none');
    acquireSwipeScrollLock();
  }, [clearLongPressTimer, setTouchAction]);

  const endSwipeSession = useCallback(() => {
    isDraggingRef.current = false;
    gestureAxisRef.current = 'none';
    setTouchAction('pan-y');
    releaseSwipeScrollLock();
  }, [setTouchAction]);

  const finishSwipe = useCallback(
    (endOffset?: number, endVelocityX = 0) => {
      const springHome = () => {
        dragStartXRef.current = null;
        try {
          x.stop();
        } catch {
          /* ignore */
        }
        void motionAnimate(x, 0, SPRING_TRANSITION);
        endSwipeSession();
      };

      if (commitLockRef.current) {
        springHome();
        return;
      }

      const axis = gestureAxisRef.current;
      const offset = endOffset !== undefined ? endOffset : x.get();
      const velocityX = endVelocityX;
      let pendingAction: (() => void) | null = null;

      const commitsRight =
        !isArchived &&
        axis !== 'vertical' &&
        (offset > SWIPE_COMMIT_PX || (velocityX > SWIPE_COMMIT_VELOCITY && offset > 20));
      const commitsLeft =
        !isArchived &&
        axis !== 'vertical' &&
        (offset < -SWIPE_COMMIT_PX || (velocityX < -SWIPE_COMMIT_VELOCITY && offset < -20));

      if (commitsRight) {
        if (!localCompletedRef.current) {
          pendingAction = () => {
            requestCompleted(true);
            try {
              if (navigator.vibrate) navigator.vibrate(40);
            } catch {
              /* ignore */
            }
          };
        }
      } else if (commitsLeft) {
        if (localCompletedRef.current) {
          pendingAction = () => {
            if (onUndoGraceRef.current) onUndoGraceRef.current(reminderRef.current.id);
            else requestCompleted(false);
            try {
              if (navigator.vibrate) navigator.vibrate(30);
            } catch {
              /* ignore */
            }
          };
        }
      }

      springHome();

      if (!pendingAction) return;

      commitLockRef.current = true;
      const run = pendingAction;
      window.setTimeout(() => {
        startTransition(() => {
          try {
            run();
          } finally {
            window.setTimeout(() => {
              commitLockRef.current = false;
            }, SWIPE_COMMIT_LOCK_MS);
          }
        });
      }, SWIPE_COMMIT_DEFER_MS);
    },
    [endSwipeSession, isArchived, requestCompleted, x]
  );

  const armLongPress = useCallback(() => {
    clearLongPressTimer();
    longPressTimerRef.current = window.setTimeout(() => {
      wasLongPressRef.current = true;
      try {
        x.stop();
      } catch {
        /* ignore */
      }
      x.set(0);
      endSwipeSession();
      try {
        if (navigator.vibrate) navigator.vibrate(40);
      } catch {
        /* ignore */
      }
      const rect = cardRef.current?.getBoundingClientRect() || null;
      onLongPressRef.current?.(reminderRef.current, rect);
    }, LONG_PRESS_MS);
  }, [clearLongPressTimer, endSwipeSession, x]);

  const handleDragStart = useCallback(() => {
    beginSwipeSession();
  }, [beginSwipeSession]);

  const handleDrag = useCallback(
    (_e: unknown, info: { offset: { x: number; y: number } }) => {
      if (Math.hypot(info.offset.x, info.offset.y) > 8) {
        clearLongPressTimer();
        hasMovedRef.current = true;
      }
      gestureAxisRef.current = 'horizontal';
    },
    [clearLongPressTimer]
  );

  const handleDragEnd = useCallback(
    (_e: unknown, info: { offset: { x: number }; velocity?: { x: number } }) => {
      isDraggingRef.current = true;
      x.set(info.offset.x);
      gestureAxisRef.current = 'horizontal';
      finishSwipe(info.offset.x, info.velocity?.x || 0);
    },
    [finishSwipe, x]
  );

  useEffect(
    () => () => {
      clearLongPressTimer();
      try {
        x.stop();
      } catch {
        /* ignore */
      }
      x.set(0);
      forceReleaseSwipeScrollLock();
      isDraggingRef.current = false;
    },
    [clearLongPressTimer, x]
  );

  // Motion drag="x" owns horizontal pan — native move/end listeners removed to avoid double commits.

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      const touch = e.touches[0];
      if (!touch) return;
      startXRef.current = touch.clientX;
      startYRef.current = touch.clientY;
      dragStartXRef.current = touch.clientX;
      gestureAxisRef.current = 'none';
      startPosRef.current = { x: touch.clientX, y: touch.clientY };
      wasLongPressRef.current = false;
      hasMovedRef.current = false;
      lastTouchAtRef.current = Date.now();
      armLongPress();
    },
    [armLongPress]
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return;
      if (Date.now() - lastTouchAtRef.current < GHOST_MOUSE_MS) return;
      startXRef.current = e.clientX;
      startYRef.current = e.clientY;
      dragStartXRef.current = e.clientX;
      gestureAxisRef.current = 'none';
      startPosRef.current = { x: e.clientX, y: e.clientY };
      wasLongPressRef.current = false;
      hasMovedRef.current = false;
      armLongPress();
    },
    [armLongPress]
  );

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    clearLongPressTimer();
    const rect = cardRef.current?.getBoundingClientRect() || null;
    onLongPressRef.current?.(reminderRef.current, rect);
  }, [clearLongPressTimer]);

  const formatReminderDate = (dateStr: string, timeStr?: string) => {
    const today = toISODate();
    const tomorrow = addDaysIso(today, 1);

    if (!timeStr && dateStr === today) return '';

    let prefix = '';
    if (dateStr === today) {
      prefix = 'Today';
    } else if (dateStr === tomorrow) {
      prefix = 'Tomorrow';
    } else {
      const [y, m, d] = dateStr.split('-').map(Number);
      const target = new Date(y, m - 1, d);
      prefix = target.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    }

    return timeStr ? `${prefix} at ${timeStr}` : prefix;
  };

  const getStatusBadge = (dateStr: string, timeStr?: string, completed?: boolean) => {
    if (completed) {
      return {
        text: 'Done',
        color: ASCEND_STATUS_CHIP_CLASS,
      };
    }
    const today = toISODate();
    if (!timeStr) {
      if (dateStr < today) {
        return {
          text: 'Past Due',
          color: 'bg-slate-100 text-slate-800 border-slate-300 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700',
        };
      }
      if (dateStr === today) {
        return null;
      }
      return {
        text: 'Upcoming',
        color: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800/80 dark:text-slate-300 dark:border-slate-700',
      };
    }
    try {
      const [y, m, d] = dateStr.split('-').map(Number);
      const [h, min] = timeStr.split(':').map(Number);
      const target = new Date(y, m - 1, d, h, min).getTime();
      const diffMs = target - Date.now();

      if (diffMs < 0) {
        return {
          text: 'Past Due',
          color: 'bg-slate-100 text-slate-800 border-slate-300 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700',
        };
      }
      if (diffMs <= 60 * 60 * 1000) {
        const mins = Math.max(1, Math.round(diffMs / 60000));
        return {
          text: `In ${mins}m`,
          color: ASCEND_STATUS_CHIP_CLASS + ' font-bold',
        };
      }
      return {
        text: 'Upcoming',
        color: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800/80 dark:text-slate-300 dark:border-slate-700',
      };
    } catch {
      return {
        text: 'Scheduled',
        color: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800/80 dark:text-slate-300 dark:border-slate-700',
      };
    }
  };

  const statusBadge = getStatusBadge(reminder.date, reminder.time, localCompleted && !inGrace);
  const whenLabel = formatReminderDate(reminder.date, reminder.time);
  const showUndo = Boolean(inGrace && localCompleted && onUndoGrace);

  return (
    <div
      ref={cardRef}
      className={`relative overflow-hidden rounded-2xl select-none touch-pan-y shadow-xs ${
        isArchived ? 'opacity-75' : ''
      }`}
    >
      {!isArchived ? (
        <>
          <motion.div
            className="absolute inset-0 text-white flex items-center justify-start px-5 font-bold rounded-2xl bg-[#23C15D] dark:bg-blue-600"
            style={{ opacity: revealRightOpacity }}
          >
            <motion.div style={{ scale: revealRightScale }} className="flex items-center space-x-2 text-xs">
              <svg className="w-5 h-5 text-white stroke-[3.5]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
              <span>Complete</span>
            </motion.div>
          </motion.div>

          <motion.div
            className="absolute inset-0 text-white flex items-center justify-end px-5 font-bold rounded-2xl bg-slate-700 dark:bg-slate-700"
            style={{ opacity: revealLeftOpacity }}
          >
            <motion.div style={{ scale: revealLeftScale }} className="flex items-center space-x-2 text-xs">
              <span>Undo</span>
              <svg className="w-4.5 h-4.5 stroke-[2.5]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
              </svg>
            </motion.div>
          </motion.div>
        </>
      ) : null}

      <motion.div
        ref={swipeSurfaceRef}
        id={`reminder-card-${reminder.id}`}
        onTouchStart={isArchived ? undefined : handleTouchStart}
        onTouchEnd={isArchived ? undefined : () => clearLongPressTimer()}
        onTouchCancel={isArchived ? undefined : () => clearLongPressTimer()}
        onMouseDown={isArchived ? undefined : handleMouseDown}
        onMouseUp={isArchived ? undefined : () => clearLongPressTimer()}
        onContextMenu={handleContextMenu}
        drag={isArchived ? false : 'x'}
        dragConstraints={SWIPE_DRAG_CONSTRAINTS}
        dragElastic={0.34}
        dragMomentum={false}
        dragPropagation={false}
        layout={false}
        onDragStart={handleDragStart}
        onDrag={handleDrag}
        onDragEnd={handleDragEnd}
        style={{ x, rotateZ: cardRotateZ, scale: cardScale }}
        className={`swipe-card-surface will-change-transform relative z-10 rounded-2xl p-3.5 border flex items-start space-x-3.5 cursor-grab active:cursor-grabbing ${
          isArchived
            ? 'bg-slate-50 dark:bg-slate-900/70 border-slate-200/80 dark:border-slate-800'
            : 'bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-800'
        } ${localCompleted ? 'opacity-90' : ''}`}
      >
        <button
          id={`toggle-reminder-${reminder.id}`}
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (localCompleted) {
              if (onUndoGrace) onUndoGrace(reminder.id);
              else requestCompleted(false);
            } else {
              requestCompleted(true);
            }
          }}
          onPointerDown={(e) => e.stopPropagation()}
          className={`mt-0.5 w-6 h-6 rounded-lg border-2 flex items-center justify-center shrink-0 cursor-pointer transition-all duration-150 ${
            localCompleted
              ? 'bg-[#23C15D] border-[#23C15D] dark:bg-blue-600 dark:border-blue-500 text-white shadow-xs'
              : 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 hover:border-emerald-500 dark:hover:border-blue-500'
          }`}
          title={localCompleted ? 'Restore to active' : 'Mark completed'}
        >
          {localCompleted && (
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          )}
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between space-x-2">
            <h4
              className={`text-[14px] font-bold truncate ${
                localCompleted
                  ? 'line-through text-slate-500 dark:text-slate-400'
                  : 'text-slate-900 dark:text-white'
              }`}
            >
              {reminder.title}
            </h4>
            <div className="flex items-center gap-1.5 shrink-0">
              {showUndo ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onUndoGrace?.(reminder.id);
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                  className="text-[10.5px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-lg border border-orange-300 text-orange-800 bg-orange-50 dark:border-orange-600 dark:text-orange-200 dark:bg-orange-950/40 cursor-pointer"
                >
                  Undo
                </button>
              ) : null}
              <span
                className={`text-[9px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded-md border ${
                  reminder.time?.trim()
                    ? 'border-emerald-300 text-emerald-800 bg-emerald-50 dark:border-blue-600 dark:text-blue-200 dark:bg-blue-950/50'
                    : 'border-slate-300 text-slate-600 bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:bg-slate-800/60'
                }`}
                title={reminder.time?.trim() ? 'Timed reminder' : 'To-do (no time)'}
              >
                {reminder.time?.trim() ? 'R' : 'TD'}
              </span>
              {statusBadge && !showUndo ? (
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-xl border ${statusBadge.color}`}>
                  {statusBadge.text}
                </span>
              ) : null}
            </div>
          </div>

          {whenLabel ? (
            <div className="flex items-center space-x-2 mt-1 text-[12px] font-medium text-slate-600 dark:text-slate-300">
              <div className="flex items-center space-x-1 text-emerald-800 dark:text-blue-400">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="font-semibold">{whenLabel}</span>
              </div>
            </div>
          ) : null}

          {reminder.notes ? (
            <p className="text-[11.5px] text-slate-500 dark:text-slate-400 mt-1.5 leading-snug line-clamp-2 bg-slate-50 dark:bg-slate-800/60 p-1.5 rounded-lg border border-slate-100/80 dark:border-slate-800">
              {reminder.notes}
            </p>
          ) : null}
        </div>

        {onSnoozeReminder && reminder.time && !localCompleted ? (
          <div className="flex flex-col items-center space-y-1 shrink-0">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onSnoozeReminder(reminder.id, 15);
              }}
              title="Snooze 15 minutes"
              className="px-1.5 py-1 rounded-lg text-slate-400 hover:text-emerald-700 dark:hover:text-blue-400 hover:bg-emerald-50 dark:hover:bg-blue-950/50 text-[10.5px] font-bold transition cursor-pointer"
            >
              +15m
            </button>
          </div>
        ) : null}
      </motion.div>
    </div>
  );
}

function reminderCardPropsEqual(prev: ReminderCardProps, next: ReminderCardProps): boolean {
  return (
    prev.reminder === next.reminder &&
    prev.variant === next.variant &&
    prev.inGrace === next.inGrace &&
    prev.onToggleComplete === next.onToggleComplete &&
    prev.onSetCompleted === next.onSetCompleted &&
    prev.onUndoGrace === next.onUndoGrace &&
    prev.onDeleteReminder === next.onDeleteReminder &&
    prev.onSnoozeReminder === next.onSnoozeReminder &&
    prev.onLongPress === next.onLongPress
  );
}

export const ReminderCard = memo(ReminderCardInner, reminderCardPropsEqual);
