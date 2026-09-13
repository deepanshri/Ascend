import React, { useEffect } from 'react';
import { Habit } from '../types';
import { getTodayDayIndex, getWeekDateNumber } from '../utils/dates';
import { habitCategoryBadge, habitCategoryLabel, habitCategoryTagClass } from '../utils/categories';

interface HabitLongPressOverlayProps {
  habit: Habit;
  rect: DOMRect | null;
  todayIndex?: number;
  isFallbackActive?: boolean;
  onMarkMissed?: (habitId: string) => void;
  onClose: () => void;
  onOpenEdit: (habit: Habit) => void;
  onArchive: (habit: Habit) => void;
}

export const HabitLongPressOverlay: React.FC<HabitLongPressOverlayProps> = ({
  habit,
  rect,
  todayIndex = getTodayDayIndex(),
  isFallbackActive = false,
  onMarkMissed,
  onClose,
  onOpenEdit,
  onArchive,
}) => {
  // Dismiss on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const isTodayDone = Boolean(habit.days?.[todayIndex]);
  const isTodayMicro = Boolean(habit.microDays?.[todayIndex]);
  const isFallbackActiveToday = isFallbackActive && !isTodayDone;
  const isMicroCompletedToday = isTodayDone && isTodayMicro;
  const isShowingFallback = isFallbackActiveToday || isMicroCompletedToday;
  const habitDisplayName = isShowingFallback
    ? (habit.fallbackMicroHabit?.trim() || habit.name)
    : habit.name;

  // Compute safe coordinates to match where the card was pressed on screen
  const windowWidth = typeof window !== 'undefined' ? window.innerWidth : 380;
  const windowHeight = typeof window !== 'undefined' ? window.innerHeight : 700;

  const cardWidth = rect ? Math.min(rect.width, windowWidth - 28) : Math.min(420, windowWidth - 28);
  const cardLeft = rect
    ? Math.max(14, Math.min(windowWidth - cardWidth - 14, rect.left))
    : (windowWidth - cardWidth) / 2;

  // If card was near the top of the screen, place the action buttons below it
  const showButtonsBelow = rect ? rect.top < 68 : false;

  const cardTop = rect
    ? Math.max(68, Math.min(windowHeight - (rect.height || 110) - 70, rect.top))
    : Math.max(80, (windowHeight - 160) / 2);

  const tagLabel = habitCategoryBadge(habit.category);
  const tagClass = habitCategoryTagClass(habit.category);
  const tagFullName = habitCategoryLabel(habit.category);

  return (
    <div
      id="habit-long-press-overlay-root"
      className="fixed inset-0 z-50 overflow-hidden select-none"
    >
      {/* 1. Whole screen backdrop blur */}
      <div
        id="habit-long-press-dimming-backdrop"
        onClick={onClose}
        aria-label="Dismiss long press menu"
        className="fixed inset-0 bg-slate-950/45 dark:bg-black/70 backdrop-blur-md transition-opacity duration-200 animate-in fade-in cursor-pointer"
      />

      {/* 2. Spotlighted card container positioned above blur */}
      <div
        style={{
          position: 'fixed',
          top: `${cardTop}px`,
          left: `${cardLeft}px`,
          width: `${cardWidth}px`,
          zIndex: 51,
        }}
        className="relative transition-all duration-200"
      >
        {/* Action context menu: Mark Missed, Edit Habit, Archive */}
        <div
          id={`habit-${habit.id}-action-options`}
          className={`absolute right-0 flex flex-wrap items-center justify-end gap-2 z-52 animate-in fade-in zoom-in-95 duration-200 ${
            showButtonsBelow ? 'top-full mt-3' : '-top-13'
          }`}
          onClick={(e) => e.stopPropagation()}
        >
          {onMarkMissed && !isTodayDone && (
            <button
              type="button"
              id={`habit-${habit.id}-missed-button`}
              onClick={(e) => {
                e.stopPropagation();
                onClose();
                onMarkMissed(habit.id);
              }}
              aria-label="Mark Missed"
              className="h-10 px-3.5 rounded-full bg-white dark:bg-slate-900 text-rose-700 dark:text-rose-300 shadow-2xl border border-rose-200 dark:border-rose-900/70 hover:bg-rose-50 dark:hover:bg-rose-950/60 active:scale-95 flex items-center space-x-1.5 transition cursor-pointer font-bold text-[12px]"
            >
              <span>Mark Missed</span>
            </button>
          )}

          <button
            type="button"
            id={`habit-${habit.id}-edit-button`}
            onClick={(e) => {
              e.stopPropagation();
              onClose();
              onOpenEdit(habit);
            }}
            aria-label="Edit Habit"
            className="h-10 px-3.5 rounded-full bg-white dark:bg-slate-900 text-slate-800 dark:text-white shadow-2xl border border-slate-200 dark:border-slate-700 hover:bg-emerald-50 dark:hover:bg-blue-950 hover:text-emerald-600 dark:hover:text-blue-400 hover:border-emerald-300 dark:hover:border-blue-600 active:scale-95 flex items-center space-x-1.5 transition cursor-pointer font-bold text-[12px]"
          >
            <svg className="w-4 h-4 stroke-[2.2]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10"
              />
            </svg>
            <span>Edit Habit</span>
          </button>

          <button
            type="button"
            id={`habit-${habit.id}-archive-button`}
            onClick={(e) => {
              e.stopPropagation();
              onClose();
              onArchive(habit);
            }}
            aria-label="Archive"
            className="h-10 px-3.5 rounded-full bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 shadow-2xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 active:scale-95 flex items-center space-x-1.5 transition cursor-pointer font-bold text-[12px]"
          >
            <svg className="w-4 h-4 stroke-[2.2]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
            </svg>
            <span>Archive</span>
          </button>
        </div>

        {/* The Pressed Habit Card: completely visible and sharp */}
        <div
          onClick={(e) => e.stopPropagation()}
          className="relative bg-white dark:bg-slate-900 rounded-2xl p-4 border border-emerald-300 dark:border-blue-500 shadow-2xl ring-3 ring-emerald-500/40 dark:ring-blue-500/40 flex flex-col justify-between cursor-default transition-all duration-200 animate-in zoom-in-95"
        >
          <div className="flex items-start justify-between">
            <div className="min-w-0 pr-2">
              {/* Title */}
              <div className="flex items-center space-x-2">
                <h3
                  className={`text-[14px] font-bold tracking-tight truncate ${
                    isShowingFallback
                      ? 'text-emerald-800 dark:text-blue-300'
                      : 'text-slate-800 dark:text-white'
                  }`}
                >
                  {isShowingFallback && (
                    <span className="font-mono text-xs font-black mr-1 text-emerald-600 dark:text-blue-400">~</span>
                  )}
                  {habitDisplayName}
                </h3>
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
            </div>
          </div>

          {/* 7-Day progress blocks */}
          <div className="mt-3.5 flex items-center justify-between border-t border-slate-100 dark:border-slate-800 pt-3">
            <div className="flex items-center space-x-1.5">
              {[0, 1, 2, 3, 4, 5, 6].map((dayIdx) => {
                const isDone = Boolean(habit.days?.[dayIdx]);
                const isMicro = Boolean(habit.microDays?.[dayIdx]);
                const isToday = dayIdx === todayIndex;

                return (
                  <div
                    key={dayIdx}
                    className={`w-6 h-6 rounded-md flex items-center justify-center select-none ${
                      isDone
                        ? isMicro
                          ? 'bg-[#86efac] dark:bg-blue-400 text-emerald-950 dark:text-slate-950 border border-emerald-300 dark:border-blue-500'
                          : 'bg-[#23C15D] dark:bg-blue-600 text-white shadow-2xs'
                        : isToday
                        ? 'bg-emerald-50/90 dark:bg-blue-950/90 border-2 border-emerald-500 dark:border-blue-500 text-emerald-700 dark:text-blue-300'
                        : 'bg-slate-100 dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700'
                    }`}
                  >
                    {isDone ? (
                      isMicro ? (
                        <span className="text-[11px] font-black leading-none font-mono">~</span>
                      ) : (
                        <svg
                          className="w-3.5 h-3.5 text-white stroke-[3.5]"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      )
                    ) : isToday ? (
                      <span className="text-[9px] font-black leading-none">{getWeekDateNumber(todayIndex)}</span>
                    ) : (
                      <span className="w-1 h-1 rounded-full bg-slate-300 dark:bg-slate-600" />
                    )}
                  </div>
                );
              })}
            </div>

            {/* Tag badge */}
            <div className="flex items-center space-x-2 shrink-0">
              <span
                title={tagFullName}
                aria-label={tagFullName}
                className={`min-w-[1.75rem] px-1.5 py-1 rounded-lg text-[10px] font-black tracking-wide text-center border ${tagClass}`}
              >
                {tagLabel}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
