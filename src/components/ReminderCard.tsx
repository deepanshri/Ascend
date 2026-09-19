import React, { useState, useRef, useEffect, useCallback, memo } from 'react';
import { motion, useMotionValue, useTransform, animate as motionAnimate } from 'motion/react';
import { StandaloneReminder } from '../types';

const COMPLETE_GRACE_MS = 3000;
const SWIPE_AXIS_LOCK_PX = 10;
const SWIPE_MAX_PX = 120;
const SWIPE_COMMIT_PX = 40;
const LONG_PRESS_MS = 400;
const GHOST_MOUSE_MS = 700;
const DRAG_TRANSITION = { duration: 0 } as const;
const SPRING_TRANSITION = { type: 'spring' as const, stiffness: 420, damping: 26, mass: 0.7 };

interface ReminderCardProps {
  reminder: StandaloneReminder;
  onToggleComplete: (id: string) => void;
  onSetCompleted?: (id: string, completed: boolean) => void;
  onDeleteReminder?: (id: string) => void;
  onSnoozeReminder?: (id: string, minutes: number) => void;
  onLongPress?: (reminder: StandaloneReminder, rect: DOMRect | null) => void;
}

function ReminderCardInner({
  reminder,
  onToggleComplete,
  onSetCompleted,
  onSnoozeReminder,
  onLongPress,
}: ReminderCardProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [localCompleted, setLocalCompleted] = useState(Boolean(reminder.completed));
  const graceTimerRef = useRef<number | null>(null);
  const pendingCommitRef = useRef(false);

  const x = useMotionValue(0);
  const revealRightOpacity = useTransform(x, [8, 36], [0, 1]);
  const revealLeftOpacity = useTransform(x, [-8, -36], [0, 1]);

  const cardRef = useRef<HTMLDivElement | null>(null);
  const swipeSurfaceRef = useRef<HTMLElement | null>(null);
  const startPosRef = useRef<{ x: number; y: number } | null>(null);
  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const dragStartXRef = useRef<number | null>(null);
  const gestureAxisRef = useRef<'none' | 'horizontal' | 'vertical'>('none');
  const wasLongPressRef = useRef(false);
  const hasMovedRef = useRef(false);
  const isDraggingRef = useRef(false);
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

  const clearLongPressTimer = useCallback(() => {
    if (longPressTimerRef.current !== null) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!pendingCommitRef.current) {
      setLocalCompleted(Boolean(reminder.completed));
    }
  }, [reminder.completed]);

  useEffect(
    () => () => {
      if (graceTimerRef.current != null) window.clearTimeout(graceTimerRef.current);
      clearLongPressTimer();
    },
    [clearLongPressTimer]
  );

  const clearGraceTimer = useCallback(() => {
    if (graceTimerRef.current != null) {
      window.clearTimeout(graceTimerRef.current);
      graceTimerRef.current = null;
    }
  }, []);

  /** 3s undo window: optimistic UI first; cancel = zero-penalty revert. */
  const requestCompleted = useCallback(
    (next: boolean) => {
      const id = reminderRef.current.id;
      if (next) {
        clearGraceTimer();
        pendingCommitRef.current = true;
        setLocalCompleted(true);
        graceTimerRef.current = window.setTimeout(() => {
          graceTimerRef.current = null;
          pendingCommitRef.current = false;
          if (onSetCompletedRef.current) onSetCompletedRef.current(id, true);
          else onToggleCompleteRef.current(id);
        }, COMPLETE_GRACE_MS);
        return;
      }

      if (pendingCommitRef.current) {
        clearGraceTimer();
        pendingCommitRef.current = false;
        setLocalCompleted(false);
        return;
      }

      setLocalCompleted(false);
      if (onSetCompletedRef.current) onSetCompletedRef.current(id, false);
      else onToggleCompleteRef.current(id);
    },
    [clearGraceTimer]
  );

  const setTouchAction = useCallback((mode: 'pan-y' | 'none') => {
    const el = swipeSurfaceRef.current;
    if (el) el.style.touchAction = mode;
  }, []);

  const applySwipeOffset = useCallback(
    (deltaX: number) => {
      const clamped = Math.max(-SWIPE_MAX_PX, Math.min(SWIPE_MAX_PX, deltaX));
      x.set(clamped);
    },
    [x]
  );

  const resolveGestureAxis = useCallback(
    (deltaX: number, deltaY: number) => {
      if (gestureAxisRef.current !== 'none') return gestureAxisRef.current;
      const absX = Math.abs(deltaX);
      const absY = Math.abs(deltaY);
      if (absX > absY && absX > SWIPE_AXIS_LOCK_PX) {
        gestureAxisRef.current = 'horizontal';
        setTouchAction('none');
      } else if (absY > absX && absY > SWIPE_AXIS_LOCK_PX) {
        gestureAxisRef.current = 'vertical';
        x.set(0);
        setTouchAction('pan-y');
      }
      return gestureAxisRef.current;
    },
    [setTouchAction, x]
  );

  const resetGesture = useCallback(() => {
    x.set(0);
    isDraggingRef.current = false;
    setIsDragging(false);
    gestureAxisRef.current = 'none';
    setTouchAction('pan-y');
  }, [setTouchAction, x]);

  const finishSwipe = useCallback(() => {
    const axis = gestureAxisRef.current;
    const offset = x.get();

    if (axis !== 'vertical' && offset > SWIPE_COMMIT_PX) {
      if (!localCompletedRef.current) {
        requestCompleted(true);
        try {
          if (navigator.vibrate) navigator.vibrate(40);
        } catch {
          /* ignore */
        }
      }
    } else if (axis !== 'vertical' && offset < -SWIPE_COMMIT_PX) {
      if (localCompletedRef.current) {
        requestCompleted(false);
        try {
          if (navigator.vibrate) navigator.vibrate(30);
        } catch {
          /* ignore */
        }
      }
    }

    dragStartXRef.current = null;
    gestureAxisRef.current = 'none';
    void motionAnimate(x, 0, SPRING_TRANSITION);
    isDraggingRef.current = false;
    setIsDragging(false);
    setTouchAction('pan-y');
  }, [requestCompleted, setTouchAction, x]);

  const endPointerGesture = useCallback(() => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    clearLongPressTimer();
    lastTouchAtRef.current = Date.now();

    if (wasLongPressRef.current) {
      wasLongPressRef.current = false;
      resetGesture();
      return;
    }

    if (!hasMovedRef.current) {
      resetGesture();
      return;
    }

    finishSwipe();
  }, [clearLongPressTimer, finishSwipe, resetGesture]);

  const endPointerGestureRef = useRef(endPointerGesture);
  endPointerGestureRef.current = endPointerGesture;

  const armLongPress = useCallback(() => {
    clearLongPressTimer();
    longPressTimerRef.current = window.setTimeout(() => {
      wasLongPressRef.current = true;
      gestureAxisRef.current = 'none';
      isDraggingRef.current = false;
      setIsDragging(false);
      x.set(0);
      setTouchAction('pan-y');
      try {
        if (navigator.vibrate) navigator.vibrate(40);
      } catch {
        /* ignore */
      }
      const rect = cardRef.current?.getBoundingClientRect() || null;
      onLongPressRef.current?.(reminderRef.current, rect);
    }, LONG_PRESS_MS);
  }, [clearLongPressTimer, setTouchAction, x]);

  useEffect(() => {
    const el = swipeSurfaceRef.current;
    if (!el) return;

    const onTouchMove = (e: TouchEvent) => {
      if (wasLongPressRef.current) return;
      const touch = e.touches[0];
      if (!touch) return;

      const deltaX = touch.clientX - startXRef.current;
      const deltaY = touch.clientY - startYRef.current;

      if (startPosRef.current) {
        const dist = Math.hypot(deltaX, deltaY);
        if (dist > 8) {
          clearLongPressTimer();
          hasMovedRef.current = true;
        }
      }

      const axis = resolveGestureAxis(deltaX, deltaY);
      if (axis === 'horizontal') {
        e.preventDefault();
        const originX = dragStartXRef.current ?? startXRef.current;
        applySwipeOffset(touch.clientX - originX);
      }
    };

    el.addEventListener('touchmove', onTouchMove, { passive: false });
    return () => el.removeEventListener('touchmove', onTouchMove);
  }, [applySwipeOffset, clearLongPressTimer, resolveGestureAxis]);

  useEffect(() => {
    if (!isDragging) return;

    const onEnd = () => endPointerGestureRef.current();
    const onMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current || wasLongPressRef.current) return;
      const deltaX = e.clientX - startXRef.current;
      const deltaY = e.clientY - startYRef.current;
      if (startPosRef.current) {
        const dist = Math.hypot(deltaX, deltaY);
        if (dist > 8) {
          clearLongPressTimer();
          hasMovedRef.current = true;
        }
      }
      const axis = resolveGestureAxis(deltaX, deltaY);
      if (axis === 'horizontal') {
        const originX = dragStartXRef.current ?? startXRef.current;
        applySwipeOffset(e.clientX - originX);
      }
    };

    window.addEventListener('touchend', onEnd);
    window.addEventListener('touchcancel', onEnd);
    window.addEventListener('mouseup', onEnd);
    window.addEventListener('blur', onEnd);
    window.addEventListener('mousemove', onMouseMove);
    return () => {
      window.removeEventListener('touchend', onEnd);
      window.removeEventListener('touchcancel', onEnd);
      window.removeEventListener('mouseup', onEnd);
      window.removeEventListener('blur', onEnd);
      window.removeEventListener('mousemove', onMouseMove);
    };
  }, [isDragging, applySwipeOffset, clearLongPressTimer, resolveGestureAxis]);

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
      isDraggingRef.current = true;
      setIsDragging(true);
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
      isDraggingRef.current = true;
      setIsDragging(true);
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
    const today = new Date().toISOString().slice(0, 10);
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

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
        color: 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800',
      };
    }
    const today = new Date().toISOString().slice(0, 10);
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
          color: 'bg-emerald-100 text-emerald-900 border-emerald-300 font-bold dark:bg-blue-900/60 dark:text-blue-200 dark:border-blue-700',
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

  const statusBadge = getStatusBadge(reminder.date, reminder.time, localCompleted);
  const whenLabel = formatReminderDate(reminder.date, reminder.time);

  return (
    <div
      ref={cardRef}
      className={`relative overflow-hidden rounded-2xl select-none touch-pan-y shadow-xs ${
        isDragging || Math.abs(x.get()) > 2 ? 'overflow-hidden' : 'overflow-hidden'
      }`}
    >
      <motion.div
        className="absolute inset-0 text-white flex items-center justify-start px-5 font-bold rounded-2xl bg-[#23C15D] dark:bg-blue-600"
        style={{ opacity: revealRightOpacity }}
      >
        <div className="flex items-center space-x-2 text-xs">
          <svg className="w-5 h-5 text-white stroke-[3.5]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
          <span>Complete</span>
        </div>
      </motion.div>

      <motion.div
        className="absolute inset-0 text-white flex items-center justify-end px-5 font-bold rounded-2xl bg-slate-700 dark:bg-slate-700"
        style={{ opacity: revealLeftOpacity }}
      >
        <div className="flex items-center space-x-2 text-xs">
          <span>Remove completion</span>
          <svg className="w-4.5 h-4.5 stroke-[2.5]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
          </svg>
        </div>
      </motion.div>

      <motion.div
        ref={swipeSurfaceRef}
        id={`reminder-card-${reminder.id}`}
        onTouchStart={handleTouchStart}
        onTouchEnd={endPointerGesture}
        onTouchCancel={endPointerGesture}
        onMouseDown={handleMouseDown}
        onMouseUp={endPointerGesture}
        onContextMenu={handleContextMenu}
        style={{ x, touchAction: 'pan-y' }}
        transition={isDragging ? DRAG_TRANSITION : SPRING_TRANSITION}
        className={`relative z-10 bg-white dark:bg-slate-900 rounded-2xl p-3.5 border border-slate-100 dark:border-slate-800 flex items-start space-x-3.5 cursor-grab active:cursor-grabbing ${
          localCompleted ? 'opacity-85' : ''
        }`}
      >
        <button
          id={`toggle-reminder-${reminder.id}`}
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            requestCompleted(!localCompleted);
          }}
          className={`mt-0.5 w-6 h-6 rounded-lg border-2 flex items-center justify-center shrink-0 cursor-pointer transition-all duration-150 ${
            localCompleted
              ? 'bg-[#23C15D] border-[#23C15D] dark:bg-blue-600 dark:border-blue-500 text-white shadow-xs'
              : 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 hover:border-emerald-500 dark:hover:border-blue-500'
          }`}
          title={localCompleted ? 'Mark pending' : 'Mark completed'}
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
              className={`text-[14px] font-bold text-slate-900 dark:text-white truncate ${
                localCompleted ? 'line-through text-slate-500 dark:text-slate-400' : ''
              }`}
            >
              {reminder.title}
            </h4>
            <div className="flex items-center gap-1.5 shrink-0">
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
              {statusBadge ? (
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
    prev.onToggleComplete === next.onToggleComplete &&
    prev.onSetCompleted === next.onSetCompleted &&
    prev.onDeleteReminder === next.onDeleteReminder &&
    prev.onSnoozeReminder === next.onSnoozeReminder &&
    prev.onLongPress === next.onLongPress
  );
}

export const ReminderCard = memo(ReminderCardInner, reminderCardPropsEqual);
