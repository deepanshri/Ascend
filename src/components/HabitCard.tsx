import React, { useState, useRef } from 'react';
import { Habit } from '../types';
import { getTodayDayIndex, getWeekDateNumber } from '../utils/dates';

interface HabitCardProps {
  habit: Habit;
  todayIndex?: number;
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
}

export const HabitCard: React.FC<HabitCardProps> = ({
  habit,
  todayIndex = getTodayDayIndex(),
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
  onOpenEdit,
  onOpenDeleteConfirm,
}) => {
  const [dragStartX, setDragStartX] = useState<number | null>(null);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isFlipped, setIsFlipped] = useState(false);

  const cardRef = useRef<HTMLDivElement>(null);
  const hasMovedRef = useRef(false);
  const longPressTimerRef = useRef<number | null>(null);
  const startPosRef = useRef<{ x: number; y: number } | null>(null);
  const wasLongPressRef = useRef(false);
  const lastTapTimeRef = useRef<number>(0);

  const isTodayDone = Boolean(habit.days?.[todayIndex]);
  const isTodayMicro = Boolean(habit.microDays?.[todayIndex]);
  const isFallbackActiveToday = isFallbackActive && !isTodayDone;
  const isMicroCompletedToday = isTodayDone && isTodayMicro;
  const isShowingFallback = isFallbackActiveToday || isMicroCompletedToday;
  const habitDisplayName = isShowingFallback
    ? (habit.fallbackMicroHabit?.trim() || habit.name)
    : habit.name;

  const clearLongPressTimer = () => {
    if (longPressTimerRef.current !== null) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  // TOUCH GESTURE HANDLERS
  const handleTouchStart = (e: React.TouchEvent) => {
    if (isOtherLongPressed) return;
    const touch = e.touches[0];
    setDragStartX(touch.clientX);
    startPosRef.current = { x: touch.clientX, y: touch.clientY };
    wasLongPressRef.current = false;
    hasMovedRef.current = false;
    setIsDragging(true);

    clearLongPressTimer();
    longPressTimerRef.current = window.setTimeout(() => {
      wasLongPressRef.current = true;
      setIsDragging(false);
      setSwipeOffset(0);
      try {
        if (navigator.vibrate) navigator.vibrate(40);
      } catch {}
      const rect = cardRef.current?.getBoundingClientRect();
      onLongPress(habit, rect);
    }, 400);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (isOtherLongPressed || wasLongPressRef.current) return;
    const touch = e.touches[0];

    if (startPosRef.current) {
      const dist = Math.hypot(touch.clientX - startPosRef.current.x, touch.clientY - startPosRef.current.y);
      if (dist > 8) {
        clearLongPressTimer();
        hasMovedRef.current = true;
      }
    }

    if (dragStartX !== null && !wasLongPressRef.current) {
      const diff = touch.clientX - dragStartX;
      if (Math.abs(diff) < 120) {
        setSwipeOffset(diff);
      }
    }
  };

  const handleTouchEnd = () => {
    clearLongPressTimer();
    if (wasLongPressRef.current) {
      wasLongPressRef.current = false;
      return;
    }

    // Double tap detection on touch
    if (!hasMovedRef.current) {
      const now = Date.now();
      const diff = now - lastTapTimeRef.current;
      if (diff > 40 && diff < 350) {
        setIsFlipped((prev) => !prev);
        lastTapTimeRef.current = 0;
        setSwipeOffset(0);
        setIsDragging(false);
        return;
      }
      lastTapTimeRef.current = now;
    }

    if (isFlipped) {
      setSwipeOffset(0);
      setIsDragging(false);
      return;
    }

    finishSwipe();
  };

  // MOUSE DRAG HANDLERS
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0 || isOtherLongPressed) return;
    setDragStartX(e.clientX);
    startPosRef.current = { x: e.clientX, y: e.clientY };
    wasLongPressRef.current = false;
    hasMovedRef.current = false;
    setIsDragging(true);

    clearLongPressTimer();
    longPressTimerRef.current = window.setTimeout(() => {
      wasLongPressRef.current = true;
      setIsDragging(false);
      setSwipeOffset(0);
      const rect = cardRef.current?.getBoundingClientRect();
      onLongPress(habit, rect);
    }, 400);
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    const rect = cardRef.current?.getBoundingClientRect();
    onLongPress(habit, rect);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || wasLongPressRef.current) return;

    if (startPosRef.current) {
      const dist = Math.hypot(e.clientX - startPosRef.current.x, e.clientY - startPosRef.current.y);
      if (dist > 8) {
        clearLongPressTimer();
        hasMovedRef.current = true;
      }
    }

    if (dragStartX !== null && !wasLongPressRef.current) {
      const diff = e.clientX - dragStartX;
      if (Math.abs(diff) < 120) {
        setSwipeOffset(diff);
      }
    }
  };

  const handleMouseUp = () => {
    clearLongPressTimer();
    if (wasLongPressRef.current) {
      wasLongPressRef.current = false;
      return;
    }

    // Double tap/click detection on mouse
    if (!hasMovedRef.current) {
      const now = Date.now();
      const diff = now - lastTapTimeRef.current;
      if (diff > 40 && diff < 350) {
        setIsFlipped((prev) => !prev);
        lastTapTimeRef.current = 0;
        setSwipeOffset(0);
        setIsDragging(false);
        return;
      }
      lastTapTimeRef.current = now;
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
    const threshold = 40;
    if (swipeOffset > threshold) {
      // Swiped Right
      if (isTodayDone) {
        // Accidental completion -> swiping right again resets it to normal!
        onResetToday(habit.id);
      } else if (isFallbackActive) {
        // In fallback mode -> swiping right marks it complete with fallback micro-habit!
        onCompleteToday(habit.id, true);
      } else {
        // Normal -> mark full complete!
        onCompleteToday(habit.id, false);
      }
    } else if (swipeOffset < -threshold) {
      // Swiped Left
      if (isTodayDone) {
        // Already completed -> swiping left also resets to normal
        onResetToday(habit.id);
      } else if (isFallbackActive) {
        // In fallback mode -> swiped left again to cancel fallback and return to normal!
        onToggleFallbackMode(habit.id);
      } else {
        // Normal -> switch to fallback mode (does NOT mark complete!)
        onToggleFallbackMode(habit.id);
      }
    }

    setDragStartX(null);
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

  const tag = (habit.tags && habit.tags.length > 0)
    ? habit.tags[0]
    : habit.category === 'work'
    ? 'Work'
    : habit.category === 'self'
    ? 'Self'
    : null;

  return (
    <div
      ref={cardRef}
      data-tour={isTourTarget ? 'habit-card' : undefined}
      onContextMenu={handleContextMenu}
      className={`relative select-none touch-pan-y transition-all duration-200 ${
        isLongPressed
          ? 'opacity-0 pointer-events-none'
          : isOtherLongPressed
          ? 'opacity-30 pointer-events-none'
          : 'z-10'
      }`}
    >
      {/* Swipe layer and Foreground container */}
      <div className="relative overflow-hidden rounded-2xl">
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
        <article
          id={`habit-card-${habit.id}`}
          role="button"
          tabIndex={0}
          onClick={handleCardClick}
          onDoubleClick={(e) => {
            e.stopPropagation();
            setIsFlipped((prev) => !prev);
          }}
          onContextMenu={(e) => e.preventDefault()}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseLeave}
          style={{
            transform: isLongPressed ? 'none' : `translateX(${swipeOffset}px)`,
            transition: isDragging ? 'none' : 'transform 0.22s cubic-bezier(0.2, 0.9, 0.3, 1)',
            perspective: 1000,
          }}
          className="relative w-full cursor-pointer select-none"
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
              className={`relative bg-white dark:bg-slate-900 rounded-2xl p-4 border flex flex-col justify-between transition-all duration-200 ${
                isLongPressed
                  ? 'scale-[1.025] shadow-2xl ring-2 ring-emerald-500/60 dark:ring-blue-500/60 border-emerald-300 dark:border-blue-400'
                  : isFallbackActive && !isTodayDone
                  ? 'shadow-sm border-emerald-400/80 dark:border-blue-400/80 ring-1 ring-emerald-400/40 dark:ring-blue-400/40 bg-emerald-50/20 dark:bg-blue-950/20 active:scale-[0.995]'
                  : 'shadow-sm border-slate-100/90 dark:border-slate-800 active:scale-[0.995]'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0 pr-3">
                  {/* Title */}
                  <div className="flex items-center space-x-2 min-w-0">
                    <h3
                      className={`text-[14px] font-bold tracking-tight truncate ${
                        isShowingFallback
                          ? 'text-emerald-800 dark:text-blue-300'
                          : 'text-slate-800 dark:text-white'
                      }`}
                      title={isShowingFallback ? `Fallback: ${habitDisplayName} (Normal: ${habit.name})` : habit.name}
                    >
                      {isShowingFallback && (
                        <span className="font-mono text-xs font-black mr-1 text-emerald-600 dark:text-blue-400">~</span>
                      )}
                      {habitDisplayName}
                    </h3>
                    {/* Priority Dot: green for high, light green for mid, grey dot for low */}
                    <span
                      aria-label={`Priority: ${habit.priority || 'mid'}`}
                      className={`w-2 h-2 rounded-full shrink-0 ${
                        habit.priority === 'high'
                          ? 'bg-[#16a34a]'
                          : habit.priority === 'low'
                          ? 'bg-[#94a3b8]'
                          : 'bg-[#86efac]'
                      }`}
                    />
                  </div>

              {/* 7-Day Consistency Checkboxes */}
              <div className="flex items-center space-x-1.5 mt-2.5">
                {habit.days.map((isDone, dayIdx) => {
                  const isPast = dayIdx < todayIndex;
                  const isToday = dayIdx === todayIndex;
                  const isMicro = habit.microDays?.[dayIdx];

                  // 1. PAST DAYS (Locked history)
                  if (isPast) {
                    return (
                      <div
                        key={dayIdx}
                        id={`habit-${habit.id}-day-${dayIdx + 1}`}
                        title={`Day ${dayIdx + 1}: ${isDone ? (isMicro ? 'Micro fallback (50%)' : 'Completed (100%)') : 'Missed'}`}
                        className={`w-6 h-6 rounded-md flex items-center justify-center select-none cursor-default ${
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

            {/* Right Tag Badge (Work / Self) */}
            <div className="flex items-center space-x-2 shrink-0">
              {tag && (
                <span
                  className="px-2.5 py-1 rounded-lg text-[11px] font-bold border transition bg-emerald-50 dark:bg-blue-950 text-emerald-800 dark:text-blue-300 border-emerald-200/80 dark:border-blue-800"
                >
                  {tag}
                </span>
              )}
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
          className="absolute inset-0 w-full h-full bg-white dark:bg-slate-900 rounded-2xl p-4 border-2 border-[#23C15D] dark:border-blue-500 shadow-xl flex flex-col justify-between select-none z-10"
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

          <div className="py-2 flex-1 flex flex-col justify-center">
            <p className="text-[13px] font-medium text-slate-800 dark:text-slate-100 leading-relaxed italic line-clamp-3">
              {habit.purposeAnchor?.trim()
                ? `"${habit.purposeAnchor.trim()}"`
                : 'No purpose anchor set yet. Long press to edit.'}
            </p>
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
    </article>
      </div>
    </div>
  );
};
