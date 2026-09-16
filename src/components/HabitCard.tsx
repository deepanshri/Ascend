import React, { useState, useRef, useEffect, useCallback, memo } from 'react';
import { motion, useMotionValue, useTransform, animate as motionAnimate } from 'motion/react';
import { Habit } from '../types';
import { getTodayDayIndex, getWeekDateNumber } from '../utils/dates';
import { habitCategoryBadge, habitCategoryLabel, habitCategoryTagClass } from '../utils/categories';
import { isHabitScheduledOnDayIndex } from '../utils/schedule';

const SWIPE_AXIS_LOCK_PX = 10;
const LONG_PRESS_MS = 550;
const GHOST_MOUSE_MS = 700;
const FLIP_DEBOUNCE_MS = 400;
const SWIPE_MAX_PX = 120;
const SWIPE_COMMIT_PX = 40;

const DRAG_TRANSITION = { duration: 0 } as const;
const SPRING_TRANSITION = { type: 'spring' as const, stiffness: 420, damping: 26, mass: 0.7 };
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
  onCompleteToday: (habitId: string, isFallback?: boolean) => void;
  onToggleFallbackMode: (habitId: string) => void;
  onResetToday: (habitId: string) => void;
  onNotify: (message: string) => void;
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
  onNotify: _onNotify,
  onLongPress,
  onDismissLongPress,
  onOpenEdit: _onOpenEdit,
  onOpenDeleteConfirm: _onOpenDeleteConfirm,
  onToggleKeystone: _onToggleKeystone,
  keystoneAtCap: _keystoneAtCap = false,
  keystoneBoosted: _keystoneBoosted = false,
  weekOrigin,
}: HabitCardProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isFlipped, setIsFlipped] = useState(false);
  const [celebration, setCelebration] = useState<'none' | 'full' | 'fallback'>('none');
  const [fullPopSeq, setFullPopSeq] = useState(0);

  const x = useMotionValue(0);
  const revealRightOpacity = useTransform(x, [8, 36], [0, 1]);
  const revealLeftOpacity = useTransform(x, [-8, -36], [0, 1]);

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
  const isTodayDone = Boolean(habit.days?.[activeIndex]);
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
    if (isLongPressed) {
      x.set(0);
      setIsDragging(false);
      isDraggingRef.current = false;
    }
  }, [isLongPressed, x]);

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
    if (el) el.style.touchAction = mode;
  }, []);

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
      const rect = cardRef.current?.getBoundingClientRect();
      onLongPressRef.current(habitRef.current, rect);
    }, LONG_PRESS_MS);
  }, [clearLongPressTimer, setTouchAction, x]);

  const applySwipeOffset = useCallback(
    (deltaX: number) => {
      if (gesturesLockedRef.current) {
        x.set(0);
        return;
      }
      const clamped = Math.max(-SWIPE_MAX_PX, Math.min(SWIPE_MAX_PX, deltaX));
      x.set(clamped);
    },
    [x]
  );

  const resolveGestureAxis = useCallback((deltaX: number, deltaY: number) => {
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
  }, [setTouchAction, x]);

  const resetGesture = useCallback(() => {
    x.set(0);
    isDraggingRef.current = false;
    setIsDragging(false);
    gestureAxisRef.current = 'none';
    setTouchAction('pan-y');
  }, [setTouchAction, x]);

  const finishSwipe = useCallback(() => {
    if (gesturesLockedRef.current) {
      dragStartXRef.current = null;
      gestureAxisRef.current = 'none';
      void motionAnimate(x, 0, SPRING_TRANSITION);
      isDraggingRef.current = false;
      setIsDragging(false);
      setTouchAction('pan-y');
      return;
    }

    const axis = gestureAxisRef.current;
    const offset = x.get();
    const habitId = habitRef.current.id;

    if (axis !== 'vertical' && offset > SWIPE_COMMIT_PX) {
      if (isTodayDoneRef.current) {
        onResetTodayRef.current(habitId);
      } else if (isFallbackActiveRef.current) {
        setCelebration('fallback');
        onCompleteTodayRef.current(habitId, true);
      } else {
        setCelebration('full');
        setFullPopSeq((seq) => seq + 1);
        onCompleteTodayRef.current(habitId, false);
      }
    } else if (axis !== 'vertical' && offset < -SWIPE_COMMIT_PX) {
      if (isTodayDoneRef.current) {
        onResetTodayRef.current(habitId);
      } else if (isFallbackActiveRef.current) {
        onToggleFallbackModeRef.current(habitId);
      } else if (!isScheduledTodayRef.current) {
        // Off day: settle silently.
      } else {
        setCelebration('fallback');
        onToggleFallbackModeRef.current(habitId);
      }
    }

    dragStartXRef.current = null;
    gestureAxisRef.current = 'none';
    void motionAnimate(x, 0, SPRING_TRANSITION);
    isDraggingRef.current = false;
    setIsDragging(false);
    setTouchAction('pan-y');
  }, [setTouchAction, x]);

  const endPointerGesture = useCallback(() => {
    // Claim the gesture immediately so element + window end events cannot double-fire.
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    clearLongPressTimer();
    lastTouchAtRef.current = Date.now();

    if (wasLongPressRef.current) {
      wasLongPressRef.current = false;
      resetGesture();
      return;
    }

    const moved = hasMovedRef.current;
    if (!moved) {
      ignoreClickRef.current = true;
      resetGesture();
      requestFlip();
      return;
    }

    ignoreClickRef.current = true;
    if (isFlippedRef.current) {
      resetGesture();
      return;
    }

    finishSwipe();
  }, [clearLongPressTimer, finishSwipe, requestFlip, resetGesture]);

  const endPointerGestureRef = useRef(endPointerGesture);
  endPointerGestureRef.current = endPointerGesture;

  // Native non-passive touchmove so horizontal swipes can call preventDefault.
  useEffect(() => {
    const el = swipeSurfaceRef.current;
    if (!el) return;

    const onTouchMove = (e: TouchEvent) => {
      if (isOtherLongPressedRef.current || wasLongPressRef.current) return;
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
        if (gesturesLockedRef.current) return;
        e.preventDefault();
        const originX = dragStartXRef.current ?? startXRef.current;
        applySwipeOffset(touch.clientX - originX);
      }
    };

    el.addEventListener('touchmove', onTouchMove, { passive: false });
    return () => el.removeEventListener('touchmove', onTouchMove);
  }, [applySwipeOffset, clearLongPressTimer, resolveGestureAxis]);

  // Global end listeners prevent stuck drag / frozen gestures when the finger leaves the card.
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
      if (isOtherLongPressedRef.current) return;
      const touch = e.touches[0];
      if (!touch) return;
      startXRef.current = touch.clientX;
      startYRef.current = touch.clientY;
      dragStartXRef.current = touch.clientX;
      gestureAxisRef.current = 'none';
      startPosRef.current = { x: touch.clientX, y: touch.clientY };
      wasLongPressRef.current = false;
      hasMovedRef.current = false;
      ignoreClickRef.current = false;
      lastTouchAtRef.current = Date.now();
      isDraggingRef.current = true;
      setIsDragging(true);
      armLongPress();
    },
    [armLongPress]
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0 || isOtherLongPressedRef.current) return;
      if (Date.now() - lastTouchAtRef.current < GHOST_MOUSE_MS) return;
      startXRef.current = e.clientX;
      startYRef.current = e.clientY;
      dragStartXRef.current = e.clientX;
      gestureAxisRef.current = 'none';
      startPosRef.current = { x: e.clientX, y: e.clientY };
      wasLongPressRef.current = false;
      hasMovedRef.current = false;
      ignoreClickRef.current = false;
      isDraggingRef.current = true;
      setIsDragging(true);
      armLongPress();
    },
    [armLongPress]
  );

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

  const tagLabel = habitCategoryBadge(habit.category);
  const tagClass = habitCategoryTagClass(habit.category);
  const tagFullName = habitCategoryLabel(habit.category);

  return (
    <div
      ref={cardRef}
      data-tour={isTourTarget ? 'habit-card' : undefined}
      onContextMenu={handleContextMenu}
      className={`relative select-none touch-pan-y transition-opacity duration-200 ${
        isLongPressed
          ? 'opacity-0 pointer-events-none'
          : isOtherLongPressed
          ? 'opacity-30 pointer-events-none'
          : 'z-10'
      } ${celebration === 'full' ? 'habit-complete-glow' : ''} ${
        celebration === 'fallback' ? 'habit-fallback-ripple' : ''
      }`}
    >
      <div
        className={`relative rounded-2xl ${
          isDragging || Math.abs(x.get()) > 2 ? 'overflow-hidden' : 'overflow-visible'
        }`}
      >
        <motion.div
          className={`absolute inset-0 text-white flex items-center justify-start px-5 font-bold rounded-2xl ${
            isTodayDone
              ? 'bg-slate-700 dark:bg-slate-700'
              : 'bg-emerald-600 dark:bg-blue-600'
          }`}
          style={{ opacity: revealRightOpacity }}
        >
          {isTodayDone ? (
            <div className="flex items-center space-x-2 text-xs">
              <svg className="w-4 h-4 stroke-[2.5]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
              </svg>
              <span>Reset to normal</span>
            </div>
          ) : isFallbackActive ? (
            <div className="flex items-center space-x-2 text-xs">
              <svg className="w-5 h-5 text-white stroke-[3.5]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
              <span>Complete Fallback (50%)</span>
            </div>
          ) : (
            <div className="flex items-center space-x-2 text-xs">
              <svg className="w-5 h-5 text-white stroke-[3.5]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
              <span>Complete (100%)</span>
            </div>
          )}
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
          {isTodayDone ? (
            <div className="flex items-center space-x-2 text-xs">
              <span>Reset to normal</span>
              <svg className="w-4 h-4 stroke-[2.5]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
              </svg>
            </div>
          ) : isFallbackActive ? (
            <div className="flex items-center space-x-2 text-xs">
              <span>Cancel Fallback</span>
              <svg className="w-4 h-4 stroke-[2.5]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
          ) : (
            <div className="flex items-center space-x-2 text-xs">
              <span>Switch to Fallback</span>
              <span className="text-lg font-black font-mono ml-1">~</span>
            </div>
          )}
        </motion.div>

        <motion.article
          ref={swipeSurfaceRef}
          id={`habit-card-${habit.id}`}
          role="button"
          tabIndex={0}
          onClick={handleCardClick}
          onKeyDown={handleCardKeyDown}
          onContextMenu={(e) => e.preventDefault()}
          onTouchStart={handleTouchStart}
          onTouchEnd={endPointerGesture}
          onTouchCancel={endPointerGesture}
          onMouseDown={handleMouseDown}
          onMouseUp={endPointerGesture}
          style={{ perspective: 1000, x, touchAction: 'pan-y' }}
          transition={isDragging ? DRAG_TRANSITION : SPRING_TRANSITION}
          className="relative w-full cursor-pointer select-none"
        >
          <motion.div
            key={celebration === 'full' ? `full-${fullPopSeq}` : 'idle'}
            initial={IDLE_SCALE}
            animate={celebration === 'full' ? FULL_POP_ANIMATE : IDLE_SCALE}
            transition={FULL_POP_TRANSITION}
          >
            <div
              style={{
                transformStyle: 'preserve-3d',
                transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
                transition: 'transform 0.45s cubic-bezier(0.4, 0, 0.2, 1)',
              }}
              className="relative w-full"
            >
              <div
                style={{
                  backfaceVisibility: 'hidden',
                  WebkitBackfaceVisibility: 'hidden',
                }}
                className={`relative bg-surface text-ink rounded-2xl p-4 border flex flex-col justify-between transition-all duration-200 ${
                  isLongPressed
                    ? 'scale-[1.025] shadow-2xl ring-2 ring-accent border-accent'
                    : celebration === 'fallback'
                    ? 'shadow-sm border-amber-500 ring-1 ring-amber-500 bg-amber-100 dark:bg-amber-950'
                    : isFallbackActive && !isTodayDone
                    ? 'shadow-sm border-accent ring-1 ring-accent bg-accent-soft active:scale-[0.995]'
                    : habit.isKeystone
                    ? 'overflow-visible bg-emerald-50/90 dark:bg-blue-950/40 border-emerald-500/60 shadow-[0_0_12px_rgba(16,185,129,0.35)] dark:border-blue-500/60 dark:shadow-[0_0_12px_rgba(59,130,246,0.35)] active:scale-[0.995]'
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
                      {habit.days.map((isDone, dayIdx) => {
                        const isPast = dayIdx < todayIndex;
                        const isToday = dayIdx === todayIndex;
                        const isViewed = dayIdx === activeIndex;
                        const isMicro = habit.microDays?.[dayIdx];
                        const viewedRing =
                          isViewed && !isToday ? 'ring-2 ring-amber-400/70 dark:ring-amber-400/50' : '';
                        const isScheduled = isHabitScheduledOnDayIndex(habit, dayIdx, origin);

                        if (!isScheduled) {
                          return (
                            <div
                              key={dayIdx}
                              id={`habit-${habit.id}-day-${dayIdx + 1}`}
                              title={`Day ${dayIdx + 1}: Not scheduled`}
                              className={`w-6 h-6 rounded-md flex items-center justify-center select-none cursor-default border border-dashed border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-800/40 ${viewedRing}`}
                            >
                              <span className="text-[8px] font-bold text-slate-300 dark:text-slate-600 leading-none">
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
                              className={`w-6 h-6 rounded-md flex items-center justify-center select-none cursor-default ${viewedRing} ${
                                isDone
                                  ? isMicro
                                    ? 'bg-emerald-300 dark:bg-blue-400 text-emerald-950 dark:text-slate-950 border border-emerald-300 dark:border-blue-500'
                                    : 'bg-emerald-600 dark:bg-blue-600 text-white shadow-2xs'
                                  : 'bg-slate-100 dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700'
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
                                <span className="w-1 h-1 rounded-full bg-slate-300 dark:bg-slate-600" />
                              )}
                            </div>
                          );
                        }

                        if (isToday) {
                          if (isTodayDone) {
                            return (
                              <div
                                key={dayIdx}
                                id={`habit-${habit.id}-day-${dayIdx + 1}`}
                                title={`Day ${dayIdx + 1} (Today): ${
                                  isTodayMicro ? 'Micro fallback completed' : 'Completed'
                                }. Swipe to reset.`}
                                className={`w-6 h-6 rounded-md flex items-center justify-center select-none ring-2 ring-emerald-500/20 dark:ring-blue-500/20 ${
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
                              </div>
                            );
                          }

                          if (isFallbackActive) {
                            return (
                              <div
                                key={dayIdx}
                                id={`habit-${habit.id}-day-${dayIdx + 1}`}
                                title="Fallback active: Swipe right to complete fallback"
                                className="w-6 h-6 rounded-md flex items-center justify-center select-none bg-emerald-50 dark:bg-blue-950 border-2 border-emerald-500 dark:border-blue-500 text-emerald-700 dark:text-blue-300 shadow-xs"
                              >
                                <span className="text-[12px] font-black text-emerald-700 dark:text-blue-300 font-mono leading-none">
                                  ~
                                </span>
                              </div>
                            );
                          }

                          return (
                            <div
                              key={dayIdx}
                              id={`habit-${habit.id}-day-${dayIdx + 1}`}
                              title="Today: Swipe right to complete, swipe left for fallback"
                              className="w-6 h-6 rounded-md flex items-center justify-center select-none bg-emerald-50/90 dark:bg-blue-950/90 border-2 border-emerald-500 dark:border-blue-500 text-emerald-700 dark:text-blue-300 shadow-xs"
                            >
                              <span className="text-[9px] font-black text-emerald-700 dark:text-blue-300">
                                {getWeekDateNumber(todayIndex)}
                              </span>
                            </div>
                          );
                        }

                        return (
                          <div
                            key={dayIdx}
                            id={`habit-${habit.id}-day-${dayIdx + 1}`}
                            title={`Day ${dayIdx + 1}: Locked`}
                            className="w-6 h-6 rounded-md flex items-center justify-center select-none cursor-default bg-slate-50 dark:bg-slate-800/50 border border-dashed border-slate-200/80 dark:border-slate-700 text-slate-300 dark:text-slate-600"
                          >
                            <span className="text-[8.5px] font-bold text-slate-300 dark:text-slate-600 leading-none">
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
                      className={`min-w-[1.75rem] px-1.5 py-1 rounded-lg text-[10px] font-black tracking-wide text-center border transition ${tagClass}`}
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

function habitCardPropsEqual(prev: HabitCardProps, next: HabitCardProps): boolean {
  return (
    prev.habit === next.habit &&
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
    prev.onNotify === next.onNotify &&
    prev.onLongPress === next.onLongPress &&
    prev.onDismissLongPress === next.onDismissLongPress &&
    prev.onOpenEdit === next.onOpenEdit &&
    prev.onOpenDeleteConfirm === next.onOpenDeleteConfirm &&
    prev.onToggleKeystone === next.onToggleKeystone
  );
}

export const HabitCard = memo(HabitCardInner, habitCardPropsEqual);
