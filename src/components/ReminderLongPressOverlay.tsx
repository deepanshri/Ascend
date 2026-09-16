import React, { useEffect } from 'react';
import { motion } from 'motion/react';
import { StandaloneReminder } from '../types';

interface ReminderLongPressOverlayProps {
  reminder: StandaloneReminder;
  rect: DOMRect | null;
  onClose: () => void;
  onOpenEdit: (reminder: StandaloneReminder) => void;
  onOpenDeleteConfirm: (reminder: StandaloneReminder) => void;
}

export const ReminderLongPressOverlay: React.FC<ReminderLongPressOverlayProps> = ({
  reminder,
  rect,
  onClose,
  onOpenEdit,
  onOpenDeleteConfirm,
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

  // Date formatting helper
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

  return (
    <motion.div
      id="reminder-long-press-overlay-root"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className="fixed inset-0 z-50 overflow-hidden select-none transform-gpu"
    >
      {/* 1. Whole screen backdrop blur */}
      <motion.div
        id="reminder-long-press-dimming-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18, ease: 'easeOut' }}
        onClick={onClose}
        aria-label="Dismiss long press menu"
        className="fixed inset-0 bg-slate-950/45 dark:bg-black/70 backdrop-blur-md cursor-pointer"
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
        className="relative"
      >
        {/* Action Options: Dustbin (Delete) and Pen (Edit) */}
        <motion.div
          id={`reminder-${reminder.id}-action-options`}
          initial={{ opacity: 0, y: showButtonsBelow ? -8 : 8, scale: 0.92 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ type: 'spring', damping: 20, stiffness: 350 }}
          className={`absolute right-0 flex items-center space-x-2 z-52 ${
            showButtonsBelow ? 'top-full mt-3' : '-top-13'
          }`}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Dustbin Symbol (Delete Reminder) */}
          <motion.button
            type="button"
            id={`reminder-${reminder.id}-dustbin-button`}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.92 }}
            transition={{ type: 'spring', damping: 15, stiffness: 400 }}
            onClick={(e) => {
              e.stopPropagation();
              onClose();
              onOpenDeleteConfirm(reminder);
            }}
            aria-label="Delete reminder"
            title="Delete reminder"
            className="h-10 px-3.5 rounded-full bg-white dark:bg-slate-900 text-rose-600 dark:text-rose-400 shadow-2xl border border-rose-200 dark:border-rose-900/70 hover:bg-rose-50 dark:hover:bg-rose-950/60 flex items-center space-x-1.5 transition cursor-pointer font-bold text-[12px]"
          >
            <svg className="w-4.5 h-4.5 stroke-[2.2]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
              />
            </svg>
            <span>Delete</span>
          </motion.button>

          {/* Pen Symbol (Edit Reminder) */}
          <motion.button
            type="button"
            id={`reminder-${reminder.id}-pen-button`}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.92 }}
            transition={{ type: 'spring', damping: 15, stiffness: 400 }}
            onClick={(e) => {
              e.stopPropagation();
              onClose();
              onOpenEdit(reminder);
            }}
            aria-label="Edit reminder"
            title="Edit reminder"
            className="h-10 px-3.5 rounded-full bg-white dark:bg-slate-900 text-slate-800 dark:text-white shadow-2xl border border-slate-200 dark:border-slate-700 hover:bg-emerald-50 dark:hover:bg-blue-950 hover:text-emerald-600 dark:hover:text-blue-400 hover:border-emerald-300 dark:border-blue-600 flex items-center space-x-1.5 transition cursor-pointer font-bold text-[12px]"
          >
            <svg className="w-4.5 h-4.5 stroke-[2.2]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10"
              />
            </svg>
            <span>Edit</span>
          </motion.button>
        </motion.div>

        {/* The Pressed Reminder Card: completely visible, spotlighted and sharp */}
        <motion.div
          initial={{ scale: 0.96, opacity: 0.9 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', damping: 25, stiffness: 350 }}
          onClick={(e) => e.stopPropagation()}
          className="relative bg-white dark:bg-slate-900 rounded-2xl p-4 border border-emerald-300 dark:border-blue-500 shadow-2xl ring-3 ring-emerald-500/40 dark:ring-blue-500/40 flex flex-col justify-between cursor-default transition-all duration-200"
        >
          <div className="flex items-start space-x-3">
            {/* Completion indicator */}
            <div
              className={`mt-0.5 w-6 h-6 rounded-lg border-2 flex items-center justify-center shrink-0 ${
                reminder.completed
                  ? 'bg-[#23C15D] border-[#23C15D] dark:bg-blue-600 dark:border-blue-500 text-white'
                  : 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700'
              }`}
            >
              {reminder.completed && (
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              )}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between space-x-2">
                <h4
                  className={`text-[15px] font-bold text-slate-900 dark:text-white truncate ${
                    reminder.completed ? 'line-through text-slate-500 dark:text-slate-400' : ''
                  }`}
                >
                  {reminder.title}
                </h4>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border bg-emerald-50 dark:bg-blue-950/60 text-emerald-800 dark:text-blue-300 border-emerald-200 dark:border-blue-800 shrink-0">
                  {reminder.completed ? 'Done' : 'Active'}
                </span>
              </div>

              {/* Scheduled Date & Time */}
              <div className="flex items-center space-x-1.5 mt-1.5 text-[12px] font-semibold text-emerald-700 dark:text-blue-400">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>{formatReminderDate(reminder.date, reminder.time)}</span>
              </div>

              {/* Notes */}
              {reminder.notes && (
                <p className="text-[12px] text-slate-600 dark:text-slate-300 mt-2 p-2 rounded-lg bg-slate-50 dark:bg-slate-800/80 border border-slate-100 dark:border-slate-800">
                  {reminder.notes}
                </p>
              )}
            </div>
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
};
