import React, { useState, useRef, useEffect, useCallback, memo, startTransition } from 'react';
import { motion, useMotionValue, useTransform, animate as motionAnimate } from 'motion/react';
import { Habit } from '../types';
import { getTodayDayIndex, getWeekDateNumber } from '../utils/dates';
import { habitCategoryBadge, habitCategoryLabel, habitCategoryTagClass } from '../utils/categories';
import { isHabitScheduledOnDayIndex } from '../utils/schedule';
import { getMarbleColor } from '../utils/colors';
import { getThemeIsDark } from '../lib/themeStore';
import {
  SWIPE_COMMIT_PX as SWIPE_COMMIT_THRESHOLD,
  SWIPE_COMMIT_VELOCITY,
  SWIPE_DRAG_CONSTRAINTS,
  SPRING_TRANSITION,
} from '../hooks/useHorizontalSwipeDrag';
import { acquireSwipeScrollLock, forceReleaseSwipeScrollLock, releaseSwipeScrollLock } from '../lib/swipeScrollLock';
import { triggerCompletionHaptic } from '../utils/feedback';

const LONG_PRESS_MS = 550;
const GHOST_MOUSE_MS = 700;
const FLIP_DEBOUNCE_MS = 400;
/** Commit complete / fallback once past this offset. */
const SWIPE_COMMIT_PX = SWIPE_COMMIT_THRESHOLD;
/** Undo window after optimistic complete — marble/score already updated. */
const COMPLETE_GRACE_MS = 3000;

/** Blocks re-entrant swipe commits while App state settles. */
const SWIPE_COMMIT_LOCK_MS = 280;
/** Defer App setState until next tick for pointer release. */
const SWIPE_COMMIT_DEFER_MS = 16;
const FULL_POP_ANIMATE = { scale: [1, 1.03, 1] };
const IDLE_SCALE = { scale: 1 };
const FULL_POP_TRANSITION = {
  duration: 0.38,
  times: [0, 0.4, 1] as number[],
  ease: [0.34, 1.56, 0.64, 1] as [number, number, number, number],
};

interface HabitCardProps {
  habit: Habit;
  todayIndex?: number;
  viewIndex?: number;
  gesturesLocked?: boolean;
  isLongPressed?: boolean;
  isOtherLongPressed?: boolean;
  isFallbackActive?: boolean;
  isTourTarget?: boolean;
  onCompleteToday: (
    habitId: string,
    isFallback?: boolean,
    originCoord?: { x: number; y: number; marbleColor?: string; touchRatio?: number }
  ) => void;
  onToggleFallbackMode: (habitId: string) => void;
  onResetToday: (habitId: string) => void;
  onLongPress: (habit: Habit, rect?: DOMRect) => void;
  onDismissLongPress?: () => void;
  onOpenEdit: (habit: Habit) => void;
  onOpenDeleteConfirm: (habit: Habit) => void;
  onToggleKeystone?: (habitId: string, next: boolean) => void;
  keystoneAtCap?: boolean;
  keystoneBoosted?: boolean;
  weekOrigin?: Date;
}

function HabitCardInner({
  habit,
  todayIndex = getTodayDayIndex(),
  viewIndex,
  gesturesLocked = false,
  isLongPressed = false,
  isOtherLongPressed = false,
  isFallbackActive = false,
  isTourTarget = false,
  onCompleteToday,
  onToggleFallbackMode,
  onResetToday,
  onLongPress,
  onDismissLongPress,
  onOpenEdit: _onOpenEdit,
  onOpenDeleteConfirm: _onOpenDeleteConfirm,
  onToggleKeystone: _onToggleKeystone,
  keystoneAtCap: _keystoneAtCap = false,
  keystoneBoosted = false,
  weekOrigin,
}: HabitCardProps) {
  const [isFlipped, setIsFlipped] = useState(false);
  const [celebration, setCelebration] = useState<'none' | 'full' | 'fallback'>('none');
  const [fullPopSeq, setFullPopSeq] = useState(0);
  /** Optimistic done during the undo grace after an immediate complete. */
  const [optimisticDone, setOptimisticDone] = useState(false);
  const pendingCompleteRef = useRef<{ timer: number; isFallback: boolean } | null>(null);

  const x = useMotionValue(0);
  const revealRightOpacity = useTransform(x, [8, 36], [0, 1]);
  const revealLeftOpacity = useTransform(x, [-8, -36], [0, 1]);
  const cardRotateZ = useTransform(x, [-130, 130], [-3.2, 3.2]);
  const cardScale = useTransform(x, [-130, 0, 130], [0.972, 1, 0.972]);
  const revealRightScale = useTransform(x, [8, SWIPE_COMMIT_PX, 120], [0.8, 1.12, 1.2]);
  const revealLeftScale = useTransform(x, [-8, -SWIPE_COMMIT_PX, -120], [0.8, 1.12, 1.2]);

  const cardRef = useRef<HTMLDivElement>(null);
  const swipeSurfaceRef = useRef<HTMLElement>(null);
  const hasMovedRef = useRef(false);
  const longPressTimerRef = useRef<number | null>(null);
  const startPosRef = useRef<{ x: number; y: number } | null>(null);
  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const dragStartXRef = useRef<number | null>(null);
  const gestureAxisRef = useRef<'none' | 'horizontal' | 'vertical'>('none');
  const wasLongPressRef = useRef(false);
  const ignoreClickRef = useRef(false);
  const lastFlipAtRef = useRef(0);
  const lastTouchAtRef = useRef(0);
  const isDraggingRef = useRef(false);
  /** Prevents double-commit / re-entrant App updates while a swipe settles. */
  const commitLockRef = useRef(false);
  /** Optimistic tap mutex: blocks rapid repeated day-pill clicks within 300ms. */
  const tapLockRef = useRef(false);
  const TAP_DEBOUNCE_MS = 300;
  const isFlippedRef = useRef(isFlipped);
  isFlippedRef.current = isFlipped;
  const isOtherLongPressedRef = useRef(isOtherLongPressed);
  isOtherLongPressedRef.current = isOtherLongPressed;
  const gesturesLockedRef = useRef(gesturesLocked);
  gesturesLockedRef.current = gesturesLocked;
  const habitRef = useRef(habit);
  habitRef.current = habit;
  const isTodayDoneRef = useRef(false);
  const isFallbackActiveRef = useRef(isFallbackActive);
  isFallbackActiveRef.current = isFallbackActive;
  /** Optimistic flag — set on left-swipe activate before App re-renders isFallbackActive. */
  const optimisticFallbackRef = useRef(isFallbackActive);
  useEffect(() => {
    optimisticFallbackRef.current = isFallbackActive;
  }, [isFallbackActive]);
  const isScheduledTodayRef = useRef(true);

  const onCompleteTodayRef = useRef(onCompleteToday);
  onCompleteTodayRef.current = onCompleteToday;
  const onToggleFallbackModeRef = useRef(onToggleFallbackMode);
  onToggleFallbackModeRef.current = onToggleFallbackMode;
  const onResetTodayRef = useRef(onResetToday);
  onResetTodayRef.current = onResetToday;
  const onLongPressRef = useRef(onLongPress);
  onLongPressRef.current = onLongPress;
  const onDismissLongPressRef = useRef(onDismissLongPress);
  onDismissLongPressRef.current = onDismissLongPress;

  const activeIndex = viewIndex ?? todayIndex;
  const origin = weekOrigin ?? new Date();
  const isScheduledOnActiveDay = isHabitScheduledOnDayIndex(habit, activeIndex, origin);
  const isScheduledToday = isHabitScheduledOnDayIndex(habit, todayIndex, origin);
  const isTodayDone = Boolean(habit.days?.[activeIndex]) || optimisticDone;
  const isTodayMicro = Boolean(habit.microDays?.[activeIndex]);
  const isFallbackActiveToday = isFallbackActive && !isTodayDone;
  const isMicroCompletedToday = isTodayDone && isTodayMicro;
  const isShowingFallback = isFallbackActiveToday || isMicroCompletedToday;
  const habitDisplayName = isShowingFallback
    ? (habit.fallbackMicroHabit?.trim() || habit.name)
    : habit.name;

  isTodayDoneRef.current = isTodayDone;
  isScheduledTodayRef.current = isScheduledToday;

  useEffect(() => {
    if (celebration === 'none') return;
    const timer = window.setTimeout(() => setCelebration('none'), 700);
    return () => window.clearTimeout(timer);
  }, [celebration]);

  useEffect(() => {
    if (habit.days?.[activeIndex]) setOptimisticDone(false);
  }, [habit.days, activeIndex]);

  useEffect(
    () => () => {
      if (pendingCompleteRef.current) {
        window.clearTimeout(pendingCompleteRef.current.timer);
        pendingCompleteRef.current = null;
      }
    },
    []
  );

  const clearPendingComplete = useCallback(() => {
    if (pendingCompleteRef.current) {
      window.clearTimeout(pendingCompleteRef.current.timer);
      pendingCompleteRef.current = null;
    }
  }, []);

  /** Card-centre coordinates — canonical launch point for flying marbles. */
  const getCardCenter = useCallback((): { x: number; y: number } => {
    const rect = cardRef.current?.getBoundingClientRect();
    if (rect && rect.width > 0) {
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    }
    // Last-resort: wherever the pointer was when the gesture began.
    return { x: startXRef.current, y: startYRef.current };
  }, []);

  const scheduleComplete = useCallback(
    (isFallback: boolean, originCoord?: { x: number; y: number; touchRatio?: number }) => {
      clearPendingComplete();
      setOptimisticDone(true);
      void triggerCompletionHaptic();
      // Exact same boolean used for flight color and App → habit_logs type.
      const fallback = Boolean(isFallback);
      const marbleColor = getMarbleColor(getThemeIsDark(), fallback);
      // Resolve origin: prefer explicit coord, fall back to card centre (never 0,0).
      const resolved =
        originCoord && originCoord.x !== 0 && originCoord.y !== 0
          ? originCoord
          : getCardCenter();
      onCompleteTodayRef.current(habitRef.current.id, fallback, {
        x: resolved.x,
        y: resolved.y,
        marbleColor,
        touchRatio: originCoord?.touchRatio ?? 0.5,
      });
      pendingCompleteRef.current = {
        isFallback: fallback,
        timer: window.setTimeout(() => {
          pendingCompleteRef.current = null;
        }, COMPLETE_GRACE_MS),
      };
    },
    [clearPendingComplete, getCardCenter]
  );

  const undoOrResetToday = useCallback(() => {
    clearPendingComplete();
    setOptimisticDone(false);
    setCelebration('none');
    onResetTodayRef.current(habitRef.current.id);
  }, [clearPendingComplete]);

  const handlePillClick = useCallback(
    (e: React.MouseEvent, action: (coord: { x: number; y: number; touchRatio?: number }) => void) => {
      e.stopPropagation();
      if (tapLockRef.current || commitLockRef.current || gesturesLockedRef.current) {
        return;
      }
      tapLockRef.current = true;
      commitLockRef.current = true;
      const rect = cardRef.current?.getBoundingClientRect();
      let touchRatio = 0.5;
      if (rect && rect.width > 0 && e.clientX > 0) {
        touchRatio = (e.clientX - rect.left) / rect.width;
      }
      const coord = { ...getCardCenter(), touchRatio };
      try {
        action(coord);
      } finally {
        window.setTimeout(() => {
          tapLockRef.current = false;
          commitLockRef.current = false;
        }, TAP_DEBOUNCE_MS);
      }
    },
    [getCardCenter]
  );

  const clearLongPressTimer = useCallback(() => {
    if (longPressTimerRef.current !== null) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  useEffect(() => () => {
    clearLongPressTimer();
  }, [clearLongPressTimer]);

  const setTouchAction = useCallback((mode: 'pan-y' | 'none') => {
    const el = swipeSurfaceRef.current;
    if (!el) return;
    el.style.touchAction = mode;
    el.classList.toggle('is-swiping', mode === 'none');
  }, []);

  const beginSwipeSession = useCallback(() => {
    clearLongPressTimer();
    hasMovedRef.current = true;
    ignoreClickRef.current = true;
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

  // Abort drag when long-press menu opens — refs only (no setState mid-gesture).
  useEffect(() => {
    if (!isLongPressed) return;
    try {
      x.stop();
    } catch {
      /* ignore */
    }
    x.set(0);
    endSwipeSession();
  }, [isLongPressed, endSwipeSession, x]);

  const requestFlip = useCallback(() => {
    const now = Date.now();
    if (now - lastFlipAtRef.current < FLIP_DEBOUNCE_MS) return;
    lastFlipAtRef.current = now;
    onDismissLongPressRef.current?.();
    setIsFlipped((prev) => !prev);
  }, []);

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
      const rect = cardRef.current?.getBoundingClientRect();
      onLongPressRef.current(habitRef.current, rect);
    }, LONG_PRESS_MS);
  }, [clearLongPressTimer, endSwipeSession, x]);

  const lastPointerCoordRef = useRef<{ x: number; y: number } | null>(null);

  const finishSwipe = useCallback(
    (endOffset?: number, endVelocityX = 0, commitPoint?: { x: number; y: number }) => {
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

      if (gesturesLockedRef.current || commitLockRef.current) {
        springHome();
        return;
      }

      const axis = gestureAxisRef.current;
      const offset = endOffset !== undefined ? endOffset : x.get();
      const velocityX = endVelocityX;
      const habitId = habitRef.current.id;
      let pendingAction: (() => void) | null = null;

      const commitsRight =
        axis !== 'vertical' &&
        (offset > SWIPE_COMMIT_PX || (velocityX > SWIPE_COMMIT_VELOCITY && offset > 20));
      const commitsLeft =
        axis !== 'vertical' &&
        (offset < -SWIPE_COMMIT_PX || (velocityX < -SWIPE_COMMIT_VELOCITY && offset < -20));

      // Always anchor launch origin to the card DOM rect center with horizontal touch ratio
      const rect = cardRef.current?.getBoundingClientRect();
      let touchRatio = 0.5;
      if (rect && rect.width > 0 && startXRef.current > 0) {
        touchRatio = (startXRef.current - rect.left) / rect.width;
      }
      const originCoord = { ...getCardCenter(), touchRatio };

      if (commitsRight) {
        if (isTodayDoneRef.current) {
          // Intentional "Reset to normal" — undo today's ledger row (momentum votes stay permanent outside grace).
          pendingAction = () => undoOrResetToday();
        } else if (!isScheduledTodayRef.current) {
          // Off day: settle silently — no complete / momentum.
        } else if (optimisticFallbackRef.current || isFallbackActiveRef.current) {
          // Fallback mode (optimistic or prop): complete as micro → light marble.
          pendingAction = () => {
            setCelebration('fallback');
            void triggerCompletionHaptic();
            scheduleComplete(true, originCoord);
          };
        } else {
          // Normal full completion → solid marble.
          pendingAction = () => {
            setCelebration('full');
            setFullPopSeq((seq) => seq + 1);
            void triggerCompletionHaptic();
            scheduleComplete(false, originCoord);
          };
        }
      } else if (commitsLeft) {
        if (isTodayDoneRef.current) {
          pendingAction = () => undoOrResetToday();
        } else if (optimisticFallbackRef.current || isFallbackActiveRef.current) {
          pendingAction = () => {
            optimisticFallbackRef.current = false;
            onToggleFallbackModeRef.current(habitId);
          };
        } else if (!isScheduledTodayRef.current) {
          // Off day: settle silently.
        } else {
          pendingAction = () => {
            // Switch into fallback mode (optimistic so an immediate right-swipe is micro).
            optimisticFallbackRef.current = true;
            setCelebration('fallback');
            onToggleFallbackModeRef.current(habitId);
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
    [endSwipeSession, getCardCenter, scheduleComplete, undoOrResetToday, x]
  );

  const handleDragStart = useCallback(() => {
    beginSwipeSession();
  }, [beginSwipeSession]);

  const handleDrag = useCallback(
    (_e: unknown, info: { offset: { x: number; y: number }; point?: { x: number; y: number } }) => {
      if (info.point) {
        lastPointerCoordRef.current = { x: info.point.x, y: info.point.y };
      }
      if (Math.hypot(info.offset.x, info.offset.y) > 8) {
        clearLongPressTimer();
        hasMovedRef.current = true;
      }
      gestureAxisRef.current = 'horizontal';
    },
    [clearLongPressTimer]
  );

  const handleDragEnd = useCallback(
    (_e: unknown, info: { offset: { x: number }; velocity?: { x: number }; point?: { x: number; y: number } }) => {
      isDraggingRef.current = true;
      x.set(info.offset.x);
      gestureAxisRef.current = 'horizontal';
      const commitPoint = info.point ?? lastPointerCoordRef.current ?? undefined;
      finishSwipe(info.offset.x, info.velocity?.x || 0, commitPoint);
    },
    [finishSwipe, x]
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (isOtherLongPressedRef.current) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (e.pointerType === 'mouse' && Date.now() - lastTouchAtRef.current < GHOST_MOUSE_MS) return;
      if (e.pointerType === 'touch') lastTouchAtRef.current = Date.now();
      lastPointerCoordRef.current = { x: e.clientX, y: e.clientY };
      startXRef.current = e.clientX;
      startYRef.current = e.clientY;
      gestureAxisRef.current = 'none';
      wasLongPressRef.current = false;
      hasMovedRef.current = false;
      ignoreClickRef.current = false;
      armLongPress();
    },
    [armLongPress]
  );

  const handlePointerUp = useCallback(() => {
    clearLongPressTimer();
  }, [clearLongPressTimer]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const rect = cardRef.current?.getBoundingClientRect();
    onLongPressRef.current(habitRef.current, rect);
  }, []);

  const handleCardClick = useCallback(
    (e: React.MouseEvent) => {
      if (isLongPressed) {
        e.stopPropagation();
        onDismissLongPressRef.current?.();
        return;
      }
      if (ignoreClickRef.current) {
        ignoreClickRef.current = false;
        return;
      }
      if (hasMovedRef.current) return;
      requestFlip();
    },
    [isLongPressed, requestFlip]
  );

  const handleCardKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      requestFlip();
    },
    [requestFlip]
  );

  // Abort in-flight drag / long-press when the card unmounts (tab switch).
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

  const tagLabel = habitCategoryBadge(habit.category);
  const tagClass = habitCategoryTagClass(habit.category);
  const tagFullName = habitCategoryLabel(habit.category);

  return (
    <div
      ref={cardRef}
      data-tour={isTourTarget ? 'habit-card' : undefined}
      onContextMenu={handleContextMenu}
      style={{ contain: 'paint' }}
      className={`relative select-none touch-pan-y overflow-hidden contain-paint gpu-smooth ${
        isLongPressed
          ? 'opacity-0 pointer-events-none'
          : isOtherLongPressed
          ? 'opacity-30 pointer-events-none'
          : 'z-10'
      }`}
    >
      <div className="relative rounded-2xl overflow-hidden bg-surface contain-paint" style={{ contain: 'paint' }}>
        <motion.div
          className={`absolute inset-0 text-white flex items-center justify-start px-5 font-bold rounded-2xl ${
            isTodayDone
              ? 'bg-slate-700 dark:bg-slate-700'
              : 'bg-emerald-600 dark:bg-blue-600'
          }`}
          style={{ opacity: revealRightOpacity }}
        >
          <motion.div style={{ scale: revealRightScale }} className="flex items-center space-x-2 text-xs">
            {isTodayDone ? (
              <>
                <svg className="w-4 h-4 stroke-[2.5]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
                </svg>
                <span>Reset to normal</span>
              </>
            ) : isFallbackActive ? (
              <>
                <svg className="w-5 h-5 text-white stroke-[3.5]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
                <span>Complete Fallback (50%)</span>
              </>
            ) : (
              <>
                <svg className="w-5 h-5 text-white stroke-[3.5]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
                <span>Complete (100%)</span>
              </>
            )}
          </motion.div>
        </motion.div>

        <motion.div
          className={`absolute inset-0 text-white flex items-center justify-end px-5 font-bold rounded-2xl ${
            isTodayDone
              ? 'bg-slate-700 dark:bg-slate-700'
              : isFallbackActive
              ? 'bg-slate-600 dark:bg-slate-700'
              : 'bg-emerald-600 dark:bg-blue-600'
          }`}
          style={{ opacity: revealLeftOpacity }}
        >
          <motion.div style={{ scale: revealLeftScale }} className="flex items-center space-x-2 text-xs">
            {isTodayDone ? (
              <>
                <span>Reset to normal</span>
                <svg className="w-4 h-4 stroke-[2.5]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
                </svg>
              </>
            ) : isFallbackActive ? (
              <>
                <span>Cancel Fallback</span>
                <svg className="w-4 h-4 stroke-[2.5]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </>
            ) : (
              <>
                <span>Switch to Fallback</span>
                <span className="text-lg font-black font-mono ml-1">~</span>
              </>
            )}
          </motion.div>
        </motion.div>

        <motion.article
          ref={swipeSurfaceRef}
          id={`habit-card-${habit.id}`}
          role="group"
          tabIndex={0}
          aria-label={habitDisplayName}
          onClick={handleCardClick}
          onKeyDown={handleCardKeyDown}
          onContextMenu={(e) => e.preventDefault()}
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          drag={!gesturesLocked && !isLongPressed && !isOtherLongPressed && !isFlipped ? 'x' : false}
          dragConstraints={SWIPE_DRAG_CONSTRAINTS}
          dragElastic={0.38}
          dragMomentum={false}
          dragPropagation={false}
          layout={false}
          onDragStart={handleDragStart}
          onDrag={handleDrag}
          onDragEnd={handleDragEnd}
          style={{ x, rotateZ: cardRotateZ, scale: cardScale }}
          className="swipe-card-surface gpu-accelerated gpu-smooth relative w-full cursor-pointer select-none will-change-transform"
        >
          <motion.div
            key={celebration === 'full' ? `full-${fullPopSeq}` : 'idle'}
            initial={IDLE_SCALE}
            animate={celebration === 'full' ? FULL_POP_ANIMATE : IDLE_SCALE}
            transition={FULL_POP_TRANSITION}
          >
            {/* perspective lives here — never on the Motion drag node (x + 3D compositing deadlocks WebView). */}
            <div
              style={{
                perspective: 1000,
                transformStyle: 'preserve-3d',
                transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
                transition: 'transform 0.45s cubic-bezier(0.32, 0.72, 0, 1)',
              }}
              className="relative w-full"
            >
              <div
                style={{
                  backfaceVisibility: 'hidden',
                  WebkitBackfaceVisibility: 'hidden',
                }}
                className={`relative bg-surface text-ink rounded-2xl p-4 border flex flex-col justify-between transition-[border-color,background-color,box-shadow] duration-200 ease-out ${
                  isLongPressed
                    ? 'scale-[1.025] shadow-2xl ring-2 ring-accent border-accent'
                    : isFallbackActive && !isTodayDone
                    ? 'shadow-sm border-accent ring-1 ring-accent bg-accent-soft active:scale-[0.995]'
                    : habit.isKeystone || keystoneBoosted
                    ? 'overflow-visible bg-emerald-50/90 dark:bg-blue-950/40 border-emerald-500/60 dark:border-blue-500/60 keystone-boost-glow active:scale-[0.995]'
                    : 'shadow-sm border-line active:scale-[0.995]'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0 pr-3">
                    <div className="flex items-center space-x-2 min-w-0">
                      <h3
                        className={`text-[14px] font-bold tracking-tight truncate ${
                          isShowingFallback ? 'text-accent' : 'text-ink'
                        }`}
                        title={
                          isShowingFallback
                            ? `Fallback: ${habitDisplayName} (Normal: ${habit.name})`
                            : habit.name
                        }
                      >
                        {isShowingFallback && (
                          <span className="font-mono text-xs font-black mr-1 text-emerald-600 dark:text-blue-400">
                            ~
                          </span>
                        )}
                        {habitDisplayName}
                      </h3>
                      <span
                        aria-label={`Priority: ${habit.priority || 'mid'}`}
                        className={`w-2 h-2 rounded-full shrink-0 ${
                          habit.priority === 'high'
                            ? 'bg-emerald-600 dark:bg-blue-600'
                            : habit.priority === 'low'
                            ? 'bg-slate-400 dark:bg-blue-800'
                            : 'bg-emerald-300 dark:bg-blue-400'
                        }`}
                      />
                      {!isScheduledOnActiveDay && (
                        <span
                          title="Not scheduled on this day"
                          className="shrink-0 text-[9px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md px-1 py-0.5"
                        >
                          Off
                        </span>
                      )}
                    </div>

                    <div className="flex items-center space-x-1.5 mt-2.5">
                      {(habit.days ?? [false, false, false, false, false, false, false]).map((isDone, dayIdx) => {
                        const isPast = dayIdx < todayIndex;
                        const isToday = dayIdx === todayIndex;
                        const isViewed = dayIdx === activeIndex;
                        const isMicro = habit.microDays?.[dayIdx];
                        const viewedRing =
                          isViewed && !isToday ? 'ring-2 ring-orange-400/70 dark:ring-orange-400/50' : '';
                        const isScheduled = isHabitScheduledOnDayIndex(habit, dayIdx, origin);

                        if (!isScheduled) {
                          return (
                            <div
                              key={dayIdx}
                              id={`habit-${habit.id}-day-${dayIdx + 1}`}
                              title={`Day ${dayIdx + 1}: Not scheduled`}
                              className={`w-6 h-6 rounded-lg flex items-center justify-center select-none cursor-default bg-slate-100/80 dark:bg-slate-800/80 border border-slate-200/60 dark:border-slate-700/60 text-slate-400 ${viewedRing}`}
                            >
                              <span className="text-[8.5px] font-bold text-slate-400 dark:text-slate-500 leading-none">
                                —
                              </span>
                            </div>
                          );
                        }

                        if (isPast) {
                          return (
                            <div
                              key={dayIdx}
                              id={`habit-${habit.id}-day-${dayIdx + 1}`}
                              title={`Day ${dayIdx + 1}: ${
                                isDone
                                  ? isMicro
                                    ? 'Micro fallback (50%)'
                                    : 'Completed (100%)'
                                  : 'Missed'
                              }`}
                              className={`w-6 h-6 rounded-lg flex items-center justify-center select-none cursor-default ${viewedRing} ${
                                isDone
                                  ? isMicro
                                    ? 'bg-emerald-300 dark:bg-blue-400 text-emerald-950 dark:text-slate-950 border border-emerald-300 dark:border-blue-500'
                                    : 'bg-emerald-600 dark:bg-blue-600 text-white shadow-2xs'
                                  : 'bg-slate-100/80 dark:bg-slate-800/80 border border-slate-200/60 dark:border-slate-700/60 text-slate-400'
                              }`}
                            >
                              {isDone ? (
                                isMicro ? (
                                  <span className="text-[11px] font-black leading-none text-emerald-950 dark:text-slate-950 font-mono">
                                    ~
                                  </span>
                                ) : (
                                  <svg
                                    className="w-3.5 h-3.5 text-white stroke-[3.5]"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                  >
                                    <path
                                      d="M4.5 12.75l6 6 9-13.5"
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                    />
                                  </svg>
                                )
                              ) : (
                                <span className="w-1 h-1 rounded-full bg-slate-400 dark:bg-slate-500" />
                              )}
                            </div>
                          );
                        }

                        if (isToday) {
                          if (isTodayDone) {
                            return (
                              <motion.button
                                type="button"
                                key={dayIdx}
                                id={`habit-${habit.id}-day-${dayIdx + 1}`}
                                data-today-button="true"
                                whileTap={{ scale: 0.86 }}
                                transition={{ type: 'spring', stiffness: 500, damping: 15 }}
                                onClick={(e) => {
                                  handlePillClick(e, () => {
                                    undoOrResetToday();
                                  });
                                }}
                                title={`Day ${dayIdx + 1} (Today): ${
                                  isTodayMicro ? 'Micro fallback completed' : 'Completed'
                                }. Tap or swipe to reset.`}
                                className={`w-6 h-6 rounded-lg flex items-center justify-center select-none cursor-pointer ring-2 ring-emerald-500/20 dark:ring-blue-500/20 ${
                                  isTodayMicro
                                    ? 'bg-emerald-300 dark:bg-blue-400 text-emerald-950 dark:text-slate-950 border border-emerald-400 dark:border-blue-500 shadow-2xs'
                                    : 'bg-emerald-600 dark:bg-blue-600 text-white shadow-2xs border border-emerald-700 dark:border-blue-500'
                                }`}
                              >
                                {isTodayMicro ? (
                                  <span className="text-[11px] font-black leading-none text-emerald-950 dark:text-slate-950 font-mono">
                                    ~
                                  </span>
                                ) : (
                                  <svg
                                    className="w-3.5 h-3.5 text-white stroke-[3.5]"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                  >
                                    <path
                                      d="M4.5 12.75l6 6 9-13.5"
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                    />
                                  </svg>
                                )}
                              </motion.button>
                            );
                          }

                          if (isFallbackActive) {
                            return (
                              <motion.button
                                type="button"
                                key={dayIdx}
                                id={`habit-${habit.id}-day-${dayIdx + 1}`}
                                data-today-button="true"
                                whileTap={{ scale: 0.86 }}
                                transition={{ type: 'spring', stiffness: 500, damping: 15 }}
                                onClick={(e) => {
                                  handlePillClick(e, (coord) => {
                                    setCelebration('fallback');
                                    scheduleComplete(true, coord);
                                  });
                                }}
                                title="Fallback active: Tap or swipe right to complete fallback"
                                className="w-6 h-6 rounded-lg flex items-center justify-center select-none cursor-pointer bg-emerald-50 dark:bg-blue-950 border-2 border-emerald-500 dark:border-blue-500 text-emerald-700 dark:text-blue-300 shadow-xs"
                              >
                                <span className="text-[12px] font-black text-emerald-700 dark:text-blue-300 font-mono leading-none">
                                  ~
                                </span>
                              </motion.button>
                            );
                          }

                          return (
                            <motion.button
                              type="button"
                              key={dayIdx}
                              id={`habit-${habit.id}-day-${dayIdx + 1}`}
                              data-today-button="true"
                              whileTap={{ scale: 0.86 }}
                              transition={{ type: 'spring', stiffness: 500, damping: 15 }}
                              onClick={(e) => {
                                handlePillClick(e, (coord) => {
                                  setCelebration('full');
                                  setFullPopSeq((seq) => seq + 1);
                                  scheduleComplete(false, coord);
                                });
                              }}
                              title="Today: Tap or swipe right to complete, swipe left for fallback"
                              className="w-6 h-6 rounded-lg flex items-center justify-center select-none cursor-pointer bg-emerald-50/90 dark:bg-blue-950/90 border-2 border-emerald-500 dark:border-blue-500 text-emerald-700 dark:text-blue-300 shadow-xs"
                            >
                              <span className="text-[9px] font-black text-emerald-700 dark:text-blue-300">
                                {getWeekDateNumber(todayIndex)}
                              </span>
                            </motion.button>
                          );
                        }

                        return (
                          <div
                            key={dayIdx}
                            id={`habit-${habit.id}-day-${dayIdx + 1}`}
                            title={`Day ${dayIdx + 1}: Locked`}
                            className="w-6 h-6 rounded-lg flex items-center justify-center select-none cursor-default bg-slate-100/80 dark:bg-slate-800/80 border border-slate-200/60 dark:border-slate-700/60 text-slate-400"
                          >
                            <span className="text-[8.5px] font-bold text-slate-400 dark:text-slate-500 leading-none">
                              —
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="flex items-center space-x-2 shrink-0">
                    <span
                      title={tagFullName}
                      aria-label={tagFullName}
                      className={`min-w-[1.75rem] px-1.5 py-1 rounded-md text-[10px] font-black tracking-wide text-center border transition ${tagClass}`}
                    >
                      {tagLabel}
                    </span>
                  </div>
                </div>
              </div>

              <div
                style={{
                  backfaceVisibility: 'hidden',
                  WebkitBackfaceVisibility: 'hidden',
                  transform: 'rotateY(180deg)',
                }}
                className="absolute inset-0 w-full h-full overflow-hidden bg-surface text-ink rounded-2xl p-4 border-2 border-accent shadow-xl flex items-center justify-center select-none z-10"
              >
                <div className="min-h-0 min-w-0 px-1 flex flex-col justify-center gap-2 text-center">
                  <p className="text-[13px] font-medium text-slate-800 dark:text-slate-100 leading-relaxed italic line-clamp-4">
                    {habit.purposeAnchor?.trim()
                      ? `"${habit.purposeAnchor.trim()}"`
                      : 'No purpose anchor set yet. Long press to edit.'}
                  </p>
                  {habit.identityStatement?.trim() ? (
                    <p className="text-[12px] font-semibold text-slate-600 dark:text-slate-300 leading-relaxed line-clamp-3">
                      {habit.identityStatement.trim()}
                    </p>
                  ) : null}
                </div>
              </div>
            </div>
          </motion.div>
        </motion.article>
      </div>
    </div>
  );
}

function boolArrEqual(a?: boolean[] | null, b?: boolean[] | null): boolean {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (Boolean(a[i]) !== Boolean(b[i])) return false;
  }
  return true;
}

function numArrEqual(a?: number[] | null, b?: number[] | null): boolean {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function habitVisualEqual(prev: Habit, next: Habit): boolean {
  return (
    prev.id === next.id &&
    prev.name === next.name &&
    prev.archived === next.archived &&
    prev.isKeystone === next.isKeystone &&
    prev.category === next.category &&
    prev.priority === next.priority &&
    prev.fallbackMicroHabit === next.fallbackMicroHabit &&
    prev.identityStatement === next.identityStatement &&
    prev.updatedAt === next.updatedAt &&
    prev.scheduleType === next.scheduleType &&
    prev.timeOfDay === next.timeOfDay &&
    boolArrEqual(prev.days, next.days) &&
    boolArrEqual(prev.microDays, next.microDays) &&
    numArrEqual(prev.scheduledDays, next.scheduledDays)
  );
}

function habitCardPropsEqual(prev: HabitCardProps, next: HabitCardProps): boolean {
  return (
    habitVisualEqual(prev.habit, next.habit) &&
    prev.todayIndex === next.todayIndex &&
    prev.viewIndex === next.viewIndex &&
    prev.gesturesLocked === next.gesturesLocked &&
    prev.isLongPressed === next.isLongPressed &&
    prev.isOtherLongPressed === next.isOtherLongPressed &&
    prev.isFallbackActive === next.isFallbackActive &&
    prev.isTourTarget === next.isTourTarget &&
    prev.keystoneAtCap === next.keystoneAtCap &&
    prev.keystoneBoosted === next.keystoneBoosted &&
    prev.weekOrigin === next.weekOrigin &&
    prev.onCompleteToday === next.onCompleteToday &&
    prev.onToggleFallbackMode === next.onToggleFallbackMode &&
    prev.onResetToday === next.onResetToday &&
    prev.onLongPress === next.onLongPress &&
    prev.onDismissLongPress === next.onDismissLongPress &&
    prev.onOpenEdit === next.onOpenEdit &&
    prev.onOpenDeleteConfirm === next.onOpenDeleteConfirm &&
    prev.onToggleKeystone === next.onToggleKeystone
  );
}

export const HabitCard = memo(HabitCardInner, habitCardPropsEqual);
