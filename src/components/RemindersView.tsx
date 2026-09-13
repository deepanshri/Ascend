import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { StandaloneReminder, UserSession } from '../types';
import { weekdayFromIsoDate } from '../lib/notifications';
import { ReminderCard } from './ReminderCard';
import { ReminderLongPressOverlay } from './ReminderLongPressOverlay';
import { EditReminderModal } from './EditReminderModal';
import { DeleteReminderConfirmModal } from './DeleteReminderConfirmModal';

interface RemindersViewProps {
  reminders: StandaloneReminder[];
  onAddReminder: (reminder: Omit<StandaloneReminder, 'id' | 'completed' | 'createdAt' | 'updatedAt'>) => void;
  onUpdateReminder?: (id: string, updates: Partial<Omit<StandaloneReminder, 'id' | 'createdAt'>>) => void;
  onToggleComplete: (id: string) => void;
  onSetReminderCompleted?: (id: string, completed: boolean) => void;
  onDeleteReminder: (id: string) => void;
  onSnoozeReminder?: (id: string, minutes: number) => void;
  onNotify?: (message: string) => void;
  userSession?: UserSession | null;
  onSyncReminders?: () => void;
  onScroll?: (e: React.UIEvent<HTMLDivElement>) => void;
}

export const RemindersView: React.FC<RemindersViewProps> = ({
  reminders,
  onAddReminder,
  onUpdateReminder,
  onToggleComplete,
  onSetReminderCompleted,
  onDeleteReminder,
  onSnoozeReminder,
  onNotify,
  onScroll,
}) => {
  // Bottom Sheet State for New Reminder
  const [isBottomSheetOpen, setIsBottomSheetOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [time, setTime] = useState('');

  // Long press spotlight overlay & action modal states
  const [longPressedReminder, setLongPressedReminder] = useState<StandaloneReminder | null>(null);
  const [longPressedRect, setLongPressedRect] = useState<DOMRect | null>(null);
  const [editingReminder, setEditingReminder] = useState<StandaloneReminder | null>(null);
  const [deletingReminder, setDeletingReminder] = useState<StandaloneReminder | null>(null);

  const handleOpenBottomSheet = () => {
    const now = new Date();
    setTime('');
    setDate(now.toISOString().slice(0, 10));
    setTitle('');
    setIsBottomSheetOpen(true);
  };

  const handleSubmitNewReminder = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    const trimmedTime = time.trim();
    onAddReminder({
      title: title.trim(),
      date,
      time: trimmedTime || undefined,
      alert10Min: trimmedTime ? true : false,
      alertExact: trimmedTime ? true : false,
      habitId: null,
      daysOfWeek: [weekdayFromIsoDate(date)],
      isEnabled: true,
    });

    setIsBottomSheetOpen(false);
  };

  const activeList = reminders.filter((r) => !r.completed);
  const completedList = reminders.filter((r) => r.completed);

  return (
    <div
      id="reminders-screen"
      onScroll={onScroll}
      className="absolute inset-0 w-full px-4 pt-[calc(env(safe-area-inset-top)+4.25rem)] pb-28 space-y-4 overflow-y-auto overscroll-y-contain no-scrollbar select-none"
    >
      {/* =========================================
          HEADER
          Title: "Reminders" with [+] action button on top row
          Subtitle: "Standalone alerts & focus checkpoints" on second row
         ========================================= */}
      <header className="w-full pt-1">
        <div className="w-full flex items-center justify-between">
          <h1 className="text-[28px] sm:text-[30px] font-black text-slate-900 dark:text-white tracking-tight leading-tight text-left">
            Reminders
          </h1>
          <motion.button
            id="new-reminder-btn"
            type="button"
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.88 }}
            transition={{ type: 'spring', damping: 15, stiffness: 400 }}
            onClick={handleOpenBottomSheet}
            aria-label="New Reminder"
            title="New Reminder"
            className="w-8 h-8 rounded-xl bg-white dark:bg-slate-900 border border-emerald-300 dark:border-blue-400 text-emerald-700 dark:text-blue-400 shadow-xs hover:bg-emerald-50 dark:hover:bg-blue-950/50 hover:border-emerald-400 cursor-pointer flex items-center justify-center shrink-0 ml-auto"
          >
            <svg
              className="w-4 h-4 stroke-[2.5] text-emerald-700 dark:text-blue-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
          </motion.button>
        </div>
        <p className="text-[13px] text-slate-500 dark:text-slate-400 font-normal mt-1 leading-snug text-left">
          Standalone alerts & focus checkpoints
        </p>
      </header>

      {/* =========================================
          REMINDERS LIST
         ========================================= */}
      <div className="space-y-4">
        {/* Active Reminders */}
        {activeList.length > 0 && (
          <section className="space-y-2.5">
            <div className="flex items-center justify-between px-1">
              <span className="text-[12px] font-extrabold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                Upcoming Alerts ({activeList.length})
              </span>
              <span className="text-[10.5px] text-slate-400 font-medium">
                Swipe right to complete • Long press for options
              </span>
            </div>

            {activeList.map((rem) => (
              <ReminderCard
                key={rem.id}
                reminder={rem}
                onToggleComplete={onToggleComplete}
                onSetCompleted={onSetReminderCompleted}
                onDeleteReminder={onDeleteReminder}
                onSnoozeReminder={onSnoozeReminder}
                onNotify={onNotify}
                onLongPress={(reminder, rect) => {
                  setLongPressedReminder(reminder);
                  setLongPressedRect(rect);
                }}
              />
            ))}
          </section>
        )}

        {/* Completed Reminders Section */}
        {completedList.length > 0 && (
          <section className="space-y-2.5 pt-2">
            <div className="flex items-center justify-between px-1">
              <span className="text-[12px] font-extrabold text-slate-400 uppercase tracking-wider">
                Completed ({completedList.length})
              </span>
              <span className="text-[10.5px] text-slate-400 font-medium">
                Swipe left to remove completion • Long press for options
              </span>
            </div>

            {completedList.map((rem) => (
              <ReminderCard
                key={rem.id}
                reminder={rem}
                onToggleComplete={onToggleComplete}
                onSetCompleted={onSetReminderCompleted}
                onDeleteReminder={onDeleteReminder}
                onNotify={onNotify}
                onLongPress={(reminder, rect) => {
                  setLongPressedReminder(reminder);
                  setLongPressedRect(rect);
                }}
              />
            ))}
          </section>
        )}

        {/* Empty State */}
        {reminders.length === 0 && (
          <div className="py-16 text-center text-slate-400 dark:text-slate-500 space-y-3">
            <div className="w-12 h-12 mx-auto rounded-2xl bg-slate-100 dark:bg-slate-800/80 flex items-center justify-center text-slate-400">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <p className="text-sm font-semibold text-slate-600 dark:text-slate-400">No reminders yet</p>
            <p className="text-xs text-slate-400 dark:text-slate-500 max-w-xs mx-auto">
              Tap the <span className="font-bold text-emerald-700 dark:text-blue-400">[+]</span> button above to create standalone notifications & checkpoints.
            </p>
          </div>
        )}
      </div>

      {/* =========================================
          FROSTED-GLASS BOTTOM SHEET
          For "New Reminder"
         ========================================= */}
      <AnimatePresence>
        {isBottomSheetOpen && (
          <motion.div
            id="new-reminder-sheet-backdrop"
            key="new-reminder-sheet-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex flex-col justify-end"
            onClick={(e) => {
              if (e.target === e.currentTarget) setIsBottomSheetOpen(false);
            }}
          >
            <motion.div
              id="new-reminder-bottom-sheet"
              key="new-reminder-bottom-sheet"
              initial={{ y: '100%', opacity: 0.9 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: '100%', opacity: 0.6 }}
              transition={{ type: 'spring', damping: 28, stiffness: 320 }}
              className="w-full max-w-md mx-auto bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border-t border-white/60 dark:border-slate-800 shadow-[0_-10px_40px_rgba(0,0,0,0.15)] rounded-t-[32px] p-5 pb-9 space-y-4"
            >
              {/* Sheet Handle Grabber */}
              <div className="w-12 h-1 rounded-full bg-slate-300 dark:bg-slate-700 mx-auto -mt-1 mb-2" />

              {/* Sheet Header */}
              <div className="flex items-center justify-between pb-1 border-b border-slate-100 dark:border-slate-800">
                <div>
                  <h3 className="text-[17px] font-black text-slate-900 dark:text-white tracking-tight">
                    New Reminder
                  </h3>
                  <p className="text-[11.5px] text-slate-500 dark:text-slate-400">
                    Native alerts fire 10 minutes before and at the exact time
                  </p>
                </div>

                <motion.button
                  type="button"
                  whileTap={{ scale: 0.88 }}
                  onClick={() => setIsBottomSheetOpen(false)}
                  className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 flex items-center justify-center text-slate-500 dark:text-slate-300 transition cursor-pointer"
                >
                  ✕
                </motion.button>
              </div>

              <form onSubmit={handleSubmitNewReminder} className="space-y-4">
                {/* Title Field */}
                <div>
                  <label className="block text-[11.5px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                    Title
                  </label>
                  <input
                    id="reminder-title-input"
                    type="text"
                    required
                    autoFocus
                    placeholder="e.g. Afternoon focus block & posture check"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50/80 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-[14px] text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:focus:ring-blue-500/20 focus:border-emerald-500 dark:focus:border-blue-500 font-medium"
                  />
                </div>

                {/* Date & Time Picker Row */}
                <div className="grid grid-cols-2 gap-3">
                  {/* Date Picker */}
                  <div>
                    <label className="block text-[11.5px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1 flex items-center justify-between">
                      <span>Date</span>
                      <span
                        className="text-[10px] text-emerald-700 dark:text-blue-400 font-semibold cursor-pointer hover:underline"
                        onClick={() => setDate(new Date().toISOString().slice(0, 10))}
                      >
                        Today
                      </span>
                    </label>
                    <input
                      id="reminder-date-input"
                      type="date"
                      required
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50/80 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-[13px] text-slate-800 dark:text-slate-100 font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:focus:ring-blue-500/20 focus:border-emerald-500 dark:focus:border-blue-500"
                    />
                  </div>

                  {/* Time Picker (OPTIONAL) */}
                  <div>
                    <label className="block text-[11.5px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1 flex items-center justify-between">
                      <span>
                        Time <span className="text-[10px] font-normal lowercase text-slate-400 dark:text-slate-500">(optional)</span>
                      </span>
                      {time ? (
                        <span
                          className="text-[10px] text-rose-600 dark:text-rose-400 font-semibold cursor-pointer hover:underline"
                          onClick={() => setTime('')}
                          title="Clear time"
                        >
                          Clear
                        </span>
                      ) : null}
                    </label>
                    <input
                      id="reminder-time-input"
                      type="time"
                      value={time}
                      onChange={(e) => setTime(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50/80 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-[13px] text-slate-800 dark:text-slate-100 font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:focus:ring-blue-500/20 focus:border-emerald-500 dark:focus:border-blue-500"
                    />
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <motion.button
                    type="button"
                    whileTap={{ scale: 0.94 }}
                    onClick={() => setIsBottomSheetOpen(false)}
                    className="px-4 py-2.5 rounded-xl text-[13px] font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer"
                  >
                    Cancel
                  </motion.button>
                  <motion.button
                    id="save-new-reminder-btn"
                    type="submit"
                    whileTap={{ scale: 0.94 }}
                    className="px-6 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 dark:bg-blue-600 dark:hover:bg-blue-500 text-white font-bold text-[13px] shadow-sm transition cursor-pointer flex items-center space-x-1.5"
                  >
                    <span>Save Reminder</span>
                  </motion.button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* =========================================
          SPOTLIGHTED REMINDER OVERLAY (Long Press)
          Features blurred background + Dustbin (Delete) and Pen (Edit) symbols
         ========================================= */}
      {longPressedReminder && (
        <ReminderLongPressOverlay
          reminder={longPressedReminder}
          rect={longPressedRect}
          onClose={() => {
            setLongPressedReminder(null);
            setLongPressedRect(null);
          }}
          onOpenEdit={(r) => {
            setLongPressedReminder(null);
            setEditingReminder(r);
          }}
          onOpenDeleteConfirm={(r) => {
            setLongPressedReminder(null);
            setDeletingReminder(r);
          }}
        />
      )}

      {/* =========================================
          EDIT REMINDER MODAL (Triggered via Pen)
         ========================================= */}
      {editingReminder && (
        <EditReminderModal
          isOpen={Boolean(editingReminder)}
          reminder={editingReminder}
          onClose={() => setEditingReminder(null)}
          onSave={(id, updates) => {
            if (onUpdateReminder) {
              onUpdateReminder(id, updates);
            }
          }}
        />
      )}

      {/* =========================================
          DELETE REMINDER CONFIRM MODAL (Triggered via Dustbin)
         ========================================= */}
      {deletingReminder && (
        <DeleteReminderConfirmModal
          isOpen={Boolean(deletingReminder)}
          reminder={deletingReminder}
          onClose={() => setDeletingReminder(null)}
          onConfirm={() => {
            if (deletingReminder) {
              onDeleteReminder(deletingReminder.id);
              setDeletingReminder(null);
            }
          }}
        />
      )}
    </div>
  );
};
