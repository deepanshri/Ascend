import React, { useState, useRef } from 'react';
import { StandaloneReminder } from '../types';

interface ReminderCardProps {
  reminder: StandaloneReminder;
  onToggleComplete: (id: string) => void;
  onSetCompleted?: (id: string, completed: boolean) => void;
  onDeleteReminder?: (id: string) => void;
  onSnoozeReminder?: (id: string, minutes: number) => void;
  onNotify?: (message: string) => void;
  onLongPress?: (reminder: StandaloneReminder, rect: DOMRect | null) => void;
}

export const ReminderCard: React.FC<ReminderCardProps> = ({
  reminder,
  onToggleComplete,
  onSetCompleted,
  onSnoozeReminder,
  onNotify,
  onLongPress,
}) => {
  const [dragStartX, setDragStartX] = useState<number | null>(null);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  const cardRef = useRef<HTMLDivElement | null>(null);
  const startPosRef = useRef<{ x: number; y: number } | null>(null);
  const isScrollingVerticallyRef = useRef(false);
  const longPressTimerRef = useRef<number | null>(null);
  const wasLongPressRef = useRef(false);
  const hasMovedRef = useRef(false);

  const clearLongPressTimer = () => {
    if (longPressTimerRef.current !== null) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  // Format date and time for reminder card
  const formatReminderDate = (dateStr: string, timeStr?: string) => {
    const today = new Date().toISOString().slice(0, 10);
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

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

  // Status Badge calculation
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
        return {
          text: 'Today',
          color: 'bg-emerald-100 text-emerald-900 border-emerald-300 font-bold dark:bg-blue-900/60 dark:text-blue-200 dark:border-blue-700',
        };
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

  const statusBadge = getStatusBadge(reminder.date, reminder.time, reminder.completed);

  // TOUCH GESTURE HANDLERS
  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    setDragStartX(touch.clientX);
    startPosRef.current = { x: touch.clientX, y: touch.clientY };
    isScrollingVerticallyRef.current = false;
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
      const rect = cardRef.current?.getBoundingClientRect() || null;
      onLongPress?.(reminder, rect);
    }, 400);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (wasLongPressRef.current) return;
    const touch = e.touches[0];

    if (startPosRef.current) {
      const dist = Math.hypot(touch.clientX - startPosRef.current.x, touch.clientY - startPosRef.current.y);
      if (dist > 8) {
        clearLongPressTimer();
        hasMovedRef.current = true;
      }
    }

    if (!isDragging || isScrollingVerticallyRef.current || !startPosRef.current) return;
    const diffX = touch.clientX - startPosRef.current.x;
    const diffY = touch.clientY - startPosRef.current.y;

    // Detect if user intended a vertical scroll rather than horizontal swipe
    if (Math.abs(diffY) > Math.abs(diffX) && Math.abs(diffY) > 8) {
      isScrollingVerticallyRef.current = true;
      clearLongPressTimer();
      setSwipeOffset(0);
      setIsDragging(false);
      return;
    }

    if (dragStartX !== null) {
      const diff = touch.clientX - dragStartX;
      if (Math.abs(diff) < 130) {
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

    if (!isScrollingVerticallyRef.current && isDragging) {
      finishSwipe();
    } else {
      setSwipeOffset(0);
      setIsDragging(false);
    }
  };

  // MOUSE DRAG HANDLERS
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    setDragStartX(e.clientX);
    startPosRef.current = { x: e.clientX, y: e.clientY };
    isScrollingVerticallyRef.current = false;
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
      const rect = cardRef.current?.getBoundingClientRect() || null;
      onLongPress?.(reminder, rect);
    }, 400);
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    clearLongPressTimer();
    const rect = cardRef.current?.getBoundingClientRect() || null;
    onLongPress?.(reminder, rect);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (wasLongPressRef.current) return;

    if (startPosRef.current) {
      const dist = Math.hypot(e.clientX - startPosRef.current.x, e.clientY - startPosRef.current.y);
      if (dist > 8) {
        clearLongPressTimer();
        hasMovedRef.current = true;
      }
    }

    if (!isDragging || dragStartX === null) return;
    const diff = e.clientX - dragStartX;
    if (Math.abs(diff) < 130) {
      setSwipeOffset(diff);
    }
  };

  const handleMouseUp = () => {
    clearLongPressTimer();
    if (wasLongPressRef.current) {
      wasLongPressRef.current = false;
      return;
    }
    if (isDragging) {
      finishSwipe();
    }
  };

  const handleMouseLeave = () => {
    clearLongPressTimer();
    if (isDragging) {
      finishSwipe();
    }
  };

  // EVALUATE SWIPE GESTURE
  // User Requirement:
  // - Swiping right means: COMPLETED
  // - Swiping left means: REMOVE MARK FOR COMPLETION (uncomplete / mark as active)
  const finishSwipe = () => {
    const threshold = 40;
    if (swipeOffset > threshold) {
      // Swiped Right -> Mark COMPLETED
      if (!reminder.completed) {
        if (onSetCompleted) {
          onSetCompleted(reminder.id, true);
        } else {
          onToggleComplete(reminder.id);
        }
        try {
          if (navigator.vibrate) navigator.vibrate(40);
        } catch {}
        onNotify?.('Reminder completed');
      } else {
        onNotify?.('Already completed');
      }
    } else if (swipeOffset < -threshold) {
      // Swiped Left -> REMOVE MARK FOR COMPLETION
      if (reminder.completed) {
        if (onSetCompleted) {
          onSetCompleted(reminder.id, false);
        } else {
          onToggleComplete(reminder.id);
        }
        try {
          if (navigator.vibrate) navigator.vibrate(30);
        } catch {}
        onNotify?.('Completion removed • Reminder active');
      } else {
        onNotify?.('Reminder is already active');
      }
    }

    setDragStartX(null);
    setSwipeOffset(0);
    setIsDragging(false);
  };

  return (
    <div className="relative overflow-hidden rounded-2xl select-none touch-pan-y transition-all duration-200 shadow-xs">
      {/* ========================================================================= */}
      {/* BACKGROUND SWIPE REVEAL LAYERS                                            */}
      {/* ========================================================================= */}
      {/* Right swipe reveal (Swipe right to complete) */}
      <div
        className={`absolute inset-0 text-white flex items-center justify-start px-5 font-bold rounded-2xl transition-opacity duration-150 ${
          swipeOffset > 10 ? 'opacity-100' : 'opacity-0'
        } bg-[#23C15D] dark:bg-blue-600`}
      >
        <div className="flex items-center space-x-2 text-xs">
          <svg className="w-5 h-5 text-white stroke-[3.5]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
          <span>Complete</span>
        </div>
      </div>

      {/* Left swipe reveal (Swipe left to remove mark for completion) */}
      <div
        className={`absolute inset-0 text-white flex items-center justify-end px-5 font-bold rounded-2xl transition-opacity duration-150 ${
          swipeOffset < -10 ? 'opacity-100' : 'opacity-0'
        } bg-slate-700 dark:bg-slate-700`}
      >
        <div className="flex items-center space-x-2 text-xs">
          <span>Remove completion</span>
          <svg className="w-4.5 h-4.5 stroke-[2.5]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
          </svg>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* FOREGROUND REMINDER CARD                                                  */}
      {/* ========================================================================= */}
      <div
        ref={cardRef}
        id={`reminder-card-${reminder.id}`}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onContextMenu={handleContextMenu}
        style={{
          transform: `translateX(${swipeOffset}px)`,
          transition: isDragging ? 'none' : 'transform 0.22s cubic-bezier(0.2, 0.9, 0.3, 1)',
        }}
        className={`relative z-10 bg-white dark:bg-slate-900 rounded-2xl p-3.5 border border-slate-100 dark:border-slate-800 flex items-start space-x-3.5 hover:border-slate-200 dark:hover:border-slate-700 transition-colors cursor-grab active:cursor-grabbing ${
          reminder.completed ? 'opacity-85 hover:opacity-100' : ''
        }`}
      >
        {/* Tap-to-toggle completion checkbox:
            Solid green in light mode (#23C15D), blue in dark mode, neutral when pending */}
        <button
          id={`toggle-reminder-${reminder.id}`}
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleComplete(reminder.id);
            onNotify?.(reminder.completed ? 'Reminder restored to active' : 'Reminder completed');
          }}
          className={`mt-0.5 w-6 h-6 rounded-lg border-2 flex items-center justify-center shrink-0 cursor-pointer transition-all duration-150 ${
            reminder.completed
              ? 'bg-[#23C15D] border-[#23C15D] dark:bg-blue-600 dark:border-blue-500 text-white shadow-xs'
              : 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 hover:border-emerald-500 dark:hover:border-blue-500'
          }`}
          title={reminder.completed ? 'Mark pending' : 'Mark completed'}
        >
          {reminder.completed && (
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          )}
        </button>

        {/* Reminder Card Details */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between space-x-2">
            <h4
              className={`text-[14px] font-bold text-slate-900 dark:text-white truncate ${
                reminder.completed ? 'line-through text-slate-500 dark:text-slate-400' : ''
              }`}
            >
              {reminder.title}
            </h4>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-xl border shrink-0 ${statusBadge.color}`}>
              {statusBadge.text}
            </span>
          </div>

          {/* Scheduled Date & Time */}
          <div className="flex items-center space-x-2 mt-1 text-[12px] font-medium text-slate-600 dark:text-slate-300">
            <div className="flex items-center space-x-1 text-emerald-800 dark:text-blue-400">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="font-semibold">
                {formatReminderDate(reminder.date, reminder.time)}
              </span>
            </div>
          </div>

          {/* Alert indicators: 10m before + exact time (only when time is set) */}
          {reminder.time && (reminder.alert10Min !== false || reminder.alertExact !== false) && (
            <div className="flex items-center space-x-1.5 mt-2 flex-wrap gap-y-1">
              {reminder.alert10Min !== false && (
                <span className="inline-flex items-center space-x-1 px-2 py-0.5 bg-emerald-50 dark:bg-blue-950/60 text-emerald-800 dark:text-blue-300 rounded-md text-[10px] font-bold border border-emerald-100 dark:border-blue-800">
                  <span>🔔 10m prior</span>
                </span>
              )}
              {reminder.alertExact !== false && (
                <span className="inline-flex items-center space-x-1 px-2 py-0.5 bg-emerald-50 dark:bg-blue-950/60 text-emerald-800 dark:text-blue-300 rounded-md text-[10px] font-bold border border-emerald-100 dark:border-blue-800">
                  <span>⚡ Exact time</span>
                </span>
              )}
            </div>
          )}

          {/* Notes if present */}
          {reminder.notes && (
            <p className="text-[11.5px] text-slate-500 dark:text-slate-400 mt-1.5 leading-snug line-clamp-2 bg-slate-50 dark:bg-slate-800/60 p-1.5 rounded-lg border border-slate-100/80 dark:border-slate-800">
              {reminder.notes}
            </p>
          )}
        </div>

        {/* Right Action: Snooze only (The dustbin icon has been removed from the card as requested) */}
        {onSnoozeReminder && reminder.time && !reminder.completed && (
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
        )}
      </div>
    </div>
  );
};
