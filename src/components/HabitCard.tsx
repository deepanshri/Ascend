import React, { useState, useRef, useEffect } from 'react';
import { motion } from 'motion/react';
import { Habit } from '../types';
import { getTodayDayIndex, getWeekDateNumber } from '../utils/dates';
import { habitCategoryBadge, habitCategoryLabel, habitCategoryTagClass } from '../utils/categories';
import { isHabitScheduledOnDayIndex } from '../utils/schedule';
import { resolveHabitTimeOfDay } from '../utils/timeOfDay';

const SWIPE_AXIS_LOCK_PX = 10;
const DOUBLE_TAP_MS = 250;
const LONG_PRESS_MS = 550;
const GHOST_MOUSE_MS = 700;

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

export const HabitCard: React.FC<HabitCardProps> = ({
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
  onNotify,
  onLongPress,
  onDismissLongPress,
  onOpenEdit: _onOpenEdit,
  onOpenDeleteConfirm: _onOpenDeleteConfirm,
  onToggleKeystone: _onToggleKeystone,
  keystoneAtCap: _keystoneAtCap = false,
  keystoneBoosted: _keystoneBoosted = false,
  weekOrigin,
}) => {
  const [dragStartX, setDragStartX] = useState<number | null>(null);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isFlipped, setIsFlipped] = useState(false);
  const [celebration, setCelebration] = useState<'none' | 'full' | 'fallback'>('none');
  const [fullPopSeq, setFullPopSeq] = useState(0);

  const cardRef = useRef<HTMLDivElement>(null);
  const swipeSurfaceRef = useRef<HTMLElement>(null);
  const hasMovedRef = useRef(false);
  const longPressTimerRef = useRef<number | null>(null);
  const startPosRef = useRef<{ x: number; y: number } | null>(null);
  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const dragStartXRef = useRef<number | null>(null);
  const swipeOffsetRef = useRef(0);
  const gestureAxisRef = useRef<'none' | 'horizontal' | 'vertical'>('none');
  const wasLongPressRef = useRef(false);
  const lastTapTimeRef = useRef<number>(0);
  const singleTapTimerRef = useRef<number | null>(null);
  const lastTouchAtRef = useRef<number>(0);
  const isOtherLongPressedRef = useRef(isOtherLongPressed);
  isOtherLongPressedRef.current = isOtherLongPressed;
  const gesturesLockedRef = useRef(gesturesLocked);
  gesturesLockedRef.current = gesturesLocked;

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

  useEffect(() => {
    if (celebration === 'none') return;
    const timer = window.setTimeout(() => setCelebration('none'), 700);
    return () => window.clearTimeout(timer);
  }, [celebration]);

  const clearLongPressTimer = () => {
    if (longPressTimerRef.current !== null) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const clearSingleTapTimer = () => {
    if (singleTapTimerRef.current !== null) {
      clearTimeout(singleTapTimerRef.current);
      singleTapTimerRef.current = null;
    }
  };

  useEffect(() => () => {
    clearSingleTapTimer();
    clearLongPressTimer();
  }, []);

  /** Returns true when this tap completed a double-tap (exactly two taps < 250ms). */
  const registerTap = (): boolean => {
    const now = Date.now();
    if (now - lastTapTimeRef.current < DOUBLE_TAP_MS) {
      clearSingleTapTimer();
      clearLongPressTimer();
      lastTapTimeRef.current = 0;
      wasLongPressRef.current = false;
      onDismissLongPress?.();
      setIsFlipped((prev) => !prev);
      return true;
    }

    lastTapTimeRef.current = now;
    clearSingleTapTimer();
    singleTapTimerRef.current = window.setTimeout(() => {
      singleTapTimerRef.current = null;
      lastTapTimeRef.current = 0;
    }, DOUBLE_TAP_MS);
    return false;
  };

  const shouldDeferLongPress = () => {
    const now = Date.now();
    if (now - lastTapTimeRef.current < DOUBLE_TAP_MS) return true;
    if (now - lastTouchAtRef.current < GHOST_MOUSE_MS) return true;
    return false;
  };

  const armLongPress = () => {
    clearLongPressTimer();
    if (shouldDeferLongPress()) return;
    longPressTimerRef.current = window.setTimeout(() => {
      wasLongPressRef.current = true;
      gestureAxisRef.current = 'none';
      setIsDragging(false);
      setSwipeOffset(0);
      try {
        if (navigator.vibrate) navigator.vibrate(40);
      } catch {}
      const rect = cardRef.current?.getBoundingClientRect();
      onLongPress(habit, rect);
    }, LONG_PRESS_MS);
  };

  const applySwipeOffset = (deltaX: number) => {
    if (gesturesLockedRef.current) {
      swipeOffsetRef.current = 0;
      setSwipeOffset(0);
      return;
    }
    const next = Math.abs(deltaX) < 120 ? deltaX : swipeOffsetRef.current;
    swipeOffsetRef.current = next;
    setSwipeOffset(next);
  };

  const resolveGestureAxis = (deltaX: number, deltaY: number) => {
    if (gestureAxisRef.current !== 'none') return gestureAxisRef.current;
    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);
    if (absX > absY && absX > SWIPE_AXIS_LOCK_PX) {
      gestureAxisRef.current = 'horizontal';
    } else if (absY > absX && absY > SWIPE_AXIS_LOCK_PX) {
      gestureAxisRef.current = 'vertical';
      swipeOffsetRef.current = 0;
      setSwipeOffset(0);
    }
    return gestureAxisRef.current;
  };

  // TOUCH GESTURE HANDLERS
  const handleTouchStart = (e: React.TouchEvent) => {
    if (isOtherLongPressed) return;
    const touch = e.touches[0];
    if (!touch) return;
    startXRef.current = touch.clientX;
    startYRef.current = touch.clientY;
    dragStartXRef.current = touch.clientX;
    gestureAxisRef.current = 'none';
    setDragStartX(touch.clientX);
    startPosRef.current = { x: touch.clientX, y: touch.clientY };
    wasLongPressRef.current = false;
    hasMovedRef.current = false;
    setIsDragging(true);

    armLongPress();
  };

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
  }, []);

  const handleTouchEnd = () => {
    clearLongPressTimer();
    if (wasLongPressRef.current) {
      wasLongPressRef.current = false;
      gestureAxisRef.current = 'none';
      swipeOffsetRef.current = 0;
      return;
    }

    // Double tap: second touch within 250ms flips the card
    if (!hasMovedRef.current) {
      lastTouchAtRef.current = Date.now();
      if (registerTap()) {
        swipeOffsetRef.current = 0;
        setSwipeOffset(0);
        setIsDragging(false);
        gestureAxisRef.current = 'none';
        return;
      }
    }

    if (isFlipped) {
      swipeOffsetRef.current = 0;
      setSwipeOffset(0);
      setIsDragging(false);
      gestureAxisRef.current = 'none';
      return;
    }

    finishSwipe();
  };

  // MOUSE DRAG HANDLERS
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0 || isOtherLongPressed) return;
    if (Date.now() - lastTouchAtRef.current < GHOST_MOUSE_MS) return;
    startXRef.current = e.clientX;
    startYRef.current = e.clientY;
    dragStartXRef.current = e.clientX;
    gestureAxisRef.current = 'none';
    setDragStartX(e.clientX);
    startPosRef.current = { x: e.clientX, y: e.clientY };
    wasLongPressRef.current = false;
    hasMovedRef.current = false;
    setIsDragging(true);

    armLongPress();
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    const rect = cardRef.current?.getBoundingClientRect();
    onLongPress(habit, rect);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || wasLongPressRef.current) return;

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

  const handleMouseUp = () => {
    clearLongPressTimer();
    if (wasLongPressRef.current) {
      wasLongPressRef.current = false;
      return;
    }

    // Ignore the synthetic mouseup that follows a touch tap
    if (Date.now() - lastTouchAtRef.current < GHOST_MOUSE_MS) {
      setIsDragging(false);
      return;
    }

    // Double click: second mouseup within 250ms flips the card
    if (!hasMovedRef.current) {
      if (registerTap()) {
        swipeOffsetRef.current = 0;
        setSwipeOffset(0);
        setIsDragging(false);
        gestureAxisRef.current = 'none';
        return;
      }
    }

    if (isFlipped) {
      setSwipeOffset(0);
      setIsDragging(false);
      return;
    }

    if (isDragging) {
      finishSwipe();
    }
  };

  const handleMouseLeave = () => {
    clearLongPressTimer();
    if (wasLongPressRef.current) {
      wasLongPressRef.current = false;
      return;
    }
    if (isDragging) {
      finishSwipe();
    }
  };

  // EVALUATE SWIPE GESTURE
  const finishSwipe = () => {
    if (gesturesLockedRef.current) {
      setDragStartX(null);
      dragStartXRef.current = null;
      gestureAxisRef.current = 'none';
      swipeOffsetRef.current = 0;
      setSwipeOffset(0);
      setIsDragging(false);
      return;
    }
    const threshold = 40;
    const axis = gestureAxisRef.current;
    const offset = swipeOffsetRef.current;
    if (axis !== 'vertical' && offset > threshold) {
      // Swiped Right — App.handleCompleteToday upserts today's habit_logs row and
      // counts the Evidence Ledger once per habit per calendar day (uncheck decrements).
      if (isTodayDone) {
        // Accidental completion -> swiping right again resets it to normal!
        onResetToday(habit.id);
      } else if (isFallbackActive) {
        // In fallback mode -> swiping right marks it complete with fallback micro-habit!
        setCelebration('fallback');
        onCompleteToday(habit.id, true);
      } else {
        // Normal -> mark full complete!
        setCelebration('full');
        setFullPopSeq((seq) => seq + 1);
        onCompleteToday(habit.id, false);
      }
    } else if (axis !== 'vertical' && offset < -threshold) {
      // Swiped Left
      if (isTodayDone) {
        // Already completed -> swiping left also resets to normal
        onResetToday(habit.id);
      } else if (isFallbackActive) {
        // In fallback mode -> swiped left again to cancel fallback and return to normal!
        onToggleFallbackMode(habit.id);
      } else if (!isScheduledToday) {
        onNotify('Off day — fallback only on scheduled days');
      } else {
        // Normal -> switch to fallback mode (does NOT mark complete!)
        setCelebration('fallback');
        onToggleFallbackMode(habit.id);
      }
    }

    setDragStartX(null);
    dragStartXRef.current = null;
    gestureAxisRef.current = 'none';
    swipeOffsetRef.current = 0;
    setSwipeOffset(0);
    setIsDragging(false);
  };

  const handleCardClick = (e: React.MouseEvent) => {
    // If it's already long-pressed and tapped, dismiss long-press
    if (isLongPressed) {
      e.stopPropagation();
      onDismissLongPress?.();
      return;
    }
  };

  const tagLabel = habitCategoryBadge(habit.category);
  const tagClass = habitCategoryTagClass(habit.category);
  const tagFullName = habitCategoryLabel(habit.category);

  return (
    <div
      ref={cardRef}
      data-tour={isTourTarget ? 'habit-card' : undefined}
      onContextMenu={handleContextMenu}
      className={`relative select-none ${gesturesLocked ? 'touch-pan-y' : 'touch-pan-y'} transition-all duration-200 ${
        isLongPressed
          ? 'opacity-0 pointer-events-none'
          : isOtherLongPressed
          ? 'opacity-30 pointer-events-none'
          : 'z-10'
      } ${celebration === 'full' ? 'habit-complete-glow' : ''} ${
        celebration === 'fallback' ? 'habit-fallback-ripple' : ''
      }`}
    >
      {/* Swipe layer and Foreground container */}
      <div
        className={`relative rounded-2xl ${
          isDragging || Math.abs(swipeOffset) > 2 ? 'overflow-hidden' : 'overflow-visible'
        }`}
      >
        {/* BACKGROUND SWIPE REVEAL LAYERS */}
        {/* Right swipe reveal */}
        <div
          className={`absolute inset-0 text-white flex items-center justify-start px-5 font-bold rounded-2xl transition-opacity duration-150 ${
            swipeOffset > 10 ? 'opacity-100' : 'opacity-0'
          } ${
            isTodayDone
              ? 'bg-slate-700 dark:bg-slate-700'
              : isFallbackActive
              ? 'bg-[#23C15D] dark:bg-blue-600'
              : 'bg-[#23C15D] dark:bg-blue-600'
          }`}
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
        </div>

        {/* Left swipe reveal */}
        <div
          className={`absolute inset-0 text-white flex items-center justify-end px-5 font-bold rounded-2xl transition-opacity duration-150 ${
            swipeOffset < -10 ? 'opacity-100' : 'opacity-0'
          } ${
            isTodayDone
              ? 'bg-slate-700 dark:bg-slate-700'
              : isFallbackActive
              ? 'bg-slate-600 dark:bg-slate-700'
              : 'bg-emerald-600 dark:bg-blue-600'
          }`}
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
        </div>

        {/* FOREGROUND HABIT CARD */}
        <motion.article
          ref={swipeSurfaceRef}
          id={`habit-card-${habit.id}`}
          role="button"
          tabIndex={0}
          onClick={handleCardClick}
          onContextMenu={(e) => e.preventDefault()}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          onTouchCancel={handleTouchEnd}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseLeave}
          onPointerUp={handleMouseUp}
          onPointerLeave={handleMouseLeave}
          style={{ perspective: 1000 }}
          animate={{
            x: isLongPressed ? 0 : swipeOffset,
          }}
          transition={
            isDragging ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 26, mass: 0.7 }
          }
          className="relative w-full cursor-pointer select-none"
        >
          <motion.div
            key={celebration === 'full' ? `full-${fullPopSeq}` : 'idle'}
            initial={{ scale: 1 }}
            animate={celebration === 'full' ? { scale: [1, 1.03, 1] } : { scale: 1 }}
            transition={{ duration: 0.38, times: [0, 0.4, 1], ease: [0.34, 1.56, 0.64, 1] }}
          >
          <div
            style={{
              transformStyle: 'preserve-3d',
              transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
              transition: 'transform 0.45s cubic-bezier(0.4, 0, 0.2, 1)',
            }}
            className="relative w-full"
          >
            {/* FRONT FACE */}
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
                  ? 'overflow-visible bg-emerald-50/90 dark:bg-blue-950/40 border-blue-500/50 shadow-[0_0_12px_rgba(59,130,246,0.3)] active:scale-[0.995]'
                  : 'shadow-sm border-line active:scale-[0.995]'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0 pr-3">
                  {/* Title */}
                  <div className="flex items-center space-x-2 min-w-0">
                    <h3
                      className={`text-[14px] font-bold tracking-tight truncate ${
                        isShowingFallback
                          ? 'text-accent'
                          : 'text-ink'
                      }`}
                      title={isShowingFallback ? `Fallback: ${habitDisplayName} (Normal: ${habit.name})` : habit.name}
                    >
                      {isShowingFallback && (
                        <span className="font-mono text-xs font-black mr-1 text-emerald-600 dark:text-blue-400">~</span>
                      )}
                      {habitDisplayName}
                    </h3>
                    {/* Priority Dot: green in light, blue in dark */}
                    <span
                      aria-label={`Priority: ${habit.priority || 'mid'}`}
                      className={`w-2 h-2 rounded-full shrink-0 ${
                        habit.priority === 'high'
                          ? 'bg-[#16a34a] dark:bg-blue-600'
                          : habit.priority === 'low'
                          ? 'bg-[#94a3b8] dark:bg-blue-800'
                          : 'bg-[#86efac] dark:bg-blue-400'
                      }`}
                    />
                    {habit.isKeystone && (
                      <span
                        title="Keystone habit"
                        className="shrink-0 text-[9px] font-black uppercase tracking-wide text-emerald-700 dark:text-blue-300 bg-emerald-50 dark:bg-blue-950/70 border border-emerald-300/80 dark:border-blue-500/50 rounded-md px-1 py-0.5"
                      >
                        K
                      </span>
                    )}
                    <span
                      title={resolveHabitTimeOfDay(habit) === 'night' ? 'Night bowl' : 'Morning bowl'}
                      className="shrink-0 text-[9px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md px-1 py-0.5"
                    >
                      {resolveHabitTimeOfDay(habit) === 'night' ? 'PM' : 'AM'}
                    </span>
                    {!isScheduledOnActiveDay && (
                      <span
                        title="Not scheduled on this day"
                        className="shrink-0 text-[9px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md px-1 py-0.5"
                      >
                        Off
                      </span>
                    )}
                  </div>

              {/* 7-Day Consistency Checkboxes */}
              <div className="flex items-center space-x-1.5 mt-2.5">
                {habit.days.map((isDone, dayIdx) => {
                  const isPast = dayIdx < todayIndex;
                  const isToday = dayIdx === todayIndex;
                  const isViewed = dayIdx === activeIndex;
                  const isMicro = habit.microDays?.[dayIdx];
                  const viewedRing = isViewed && !isToday ? 'ring-2 ring-amber-400/70 dark:ring-amber-400/50' : '';
                  const isScheduled = isHabitScheduledOnDayIndex(habit, dayIdx, origin);

                  if (!isScheduled) {
                    return (
                      <div
                        key={dayIdx}
                        id={`habit-${habit.id}-day-${dayIdx + 1}`}
                        title={`Day ${dayIdx + 1}: Not scheduled`}
                        className={`w-6 h-6 rounded-md flex items-center justify-center select-none cursor-default border border-dashed border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-800/40 ${viewedRing}`}
                      >
                        <span className="text-[8px] font-bold text-slate-300 dark:text-slate-600 leading-none">—</span>
                      </div>
                    );
                  }

                  // 1. PAST DAYS (Locked history)
                  if (isPast) {
                    return (
                      <div
                        key={dayIdx}
                        id={`habit-${habit.id}-day-${dayIdx + 1}`}
                        title={`Day ${dayIdx + 1}: ${isDone ? (isMicro ? 'Micro fallback (50%)' : 'Completed (100%)') : 'Missed'}`}
                        className={`w-6 h-6 rounded-md flex items-center justify-center select-none cursor-default ${viewedRing} ${
                          isDone
                            ? isMicro
                              ? 'bg-[#86efac] dark:bg-blue-400 text-emerald-950 dark:text-slate-950 border border-emerald-300 dark:border-blue-500'
                              : 'bg-[#23C15D] dark:bg-blue-600 text-white shadow-2xs'
                            : 'bg-slate-100 dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700'
                        }`}
                      >
                        {isDone ? (
                          isMicro ? (
                            <span className="text-[11px] font-black leading-none text-emerald-950 dark:text-slate-950 font-mono">~</span>
                          ) : (
                            <svg
                              className="w-3.5 h-3.5 text-white stroke-[3.5]"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path d="M4.5 12.75l6 6 9-13.5" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          )
                        ) : (
                          <span className="w-1 h-1 rounded-full bg-slate-300 dark:bg-slate-600" />
                        )}
                      </div>
                    );
                  }

                  // 2. TODAY: Shows completed/locked if already logged, OR active pending indicator, OR active fallback pending
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
                              ? 'bg-[#86efac] dark:bg-blue-400 text-emerald-950 dark:text-slate-950 border border-emerald-400 dark:border-blue-500 shadow-2xs'
                              : 'bg-[#23C15D] dark:bg-blue-600 text-white shadow-2xs border border-[#1fa750] dark:border-blue-500'
                          }`}
                        >
                          {isTodayMicro ? (
                            <span className="text-[11px] font-black leading-none text-emerald-950 dark:text-slate-950 font-mono">~</span>
                          ) : (
                            <svg
                              className="w-3.5 h-3.5 text-white stroke-[3.5]"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path d="M4.5 12.75l6 6 9-13.5" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          )}
                        </div>
                      );
                    }

                    if (isFallbackActive) {
                      // Fallback mode active, but NOT completed yet:
                      return (
                        <div
                          key={dayIdx}
                          id={`habit-${habit.id}-day-${dayIdx + 1}`}
                          title="Fallback active: Swipe right to complete fallback"
                          className="w-6 h-6 rounded-md flex items-center justify-center select-none bg-emerald-50 dark:bg-blue-950 border-2 border-emerald-500 dark:border-blue-500 text-emerald-700 dark:text-blue-300 shadow-xs"
                        >
                          <span className="text-[12px] font-black text-emerald-700 dark:text-blue-300 font-mono leading-none">~</span>
                        </div>
                      );
                    }

                    // Pending action today: regular indicator (swipe to complete)
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

                  // 3. FUTURE DAYS: Empty placeholder
                  return (
                    <div
                      key={dayIdx}
                      id={`habit-${habit.id}-day-${dayIdx + 1}`}
                      title={`Day ${dayIdx + 1}: Locked`}
                      className="w-6 h-6 rounded-md flex items-center justify-center select-none cursor-default bg-slate-50 dark:bg-slate-800/50 border border-dashed border-slate-200/80 dark:border-slate-700 text-slate-300 dark:text-slate-600"
                    >
                      <span className="text-[8.5px] font-bold text-slate-300 dark:text-slate-600 leading-none">—</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Right Tag Badge (W / SI) */}
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

        {/* BACK FACE (REVEALS PURPOSE ON DOUBLE TAP) */}
        <div
          style={{
            backfaceVisibility: 'hidden',
            WebkitBackfaceVisibility: 'hidden',
            transform: 'rotateY(180deg)',
          }}
          className="absolute inset-0 w-full h-full overflow-hidden bg-surface text-ink rounded-2xl p-4 border-2 border-accent shadow-xl flex flex-col justify-between select-none z-10"
        >
          <div className="flex items-center justify-between border-b border-emerald-100/90 dark:border-blue-900/60 pb-1.5">
            <div className="flex items-center space-x-1.5">
              <span className="w-2 h-2 rounded-full bg-[#23C15D] dark:bg-blue-500"></span>
              <span className="text-[11px] font-bold text-emerald-800 dark:text-blue-300 uppercase tracking-wider">
                Purpose
              </span>
            </div>
            <span className="text-[10px] font-medium text-slate-400 dark:text-slate-400">
              Double-tap to flip
            </span>
          </div>

          <div className="py-2 flex-1 min-h-0 min-w-0 flex flex-col justify-center gap-2 overflow-hidden">
            <p className="text-[13px] font-medium text-slate-800 dark:text-slate-100 leading-relaxed italic line-clamp-3">
              {habit.purposeAnchor?.trim()
                ? `"${habit.purposeAnchor.trim()}"`
                : 'No purpose anchor set yet. Long press to edit.'}
            </p>
            {habit.identityStatement?.trim() ? (
              <p className="text-[12px] font-semibold text-slate-600 dark:text-slate-300 leading-relaxed line-clamp-2">
                {habit.identityStatement.trim()}
              </p>
            ) : null}
          </div>

          <div className="flex items-center justify-between text-[10.5px] text-slate-400 dark:text-slate-400 pt-1.5 border-t border-slate-100 dark:border-slate-800">
            <span className="font-semibold text-slate-700 dark:text-slate-300 truncate max-w-[180px]">
              {habit.name}
            </span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsFlipped(false);
              }}
              className="text-[10px] text-emerald-700 dark:text-blue-400 font-bold hover:underline cursor-pointer flex items-center space-x-1"
            >
              <span>Flip back</span>
              <span>↺</span>
            </button>
          </div>
        </div>
      </div>
          </motion.div>
    </motion.article>
      </div>
    </div>
  );
};
