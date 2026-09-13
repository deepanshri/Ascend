import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { StandaloneReminder, UserSession } from '../types';
import { reminderNotificationIds, weekdayFromIsoDate } from '../lib/notifications';
import { upsertPublicReminder } from '../lib/supabase';

interface EditReminderModalProps {
  reminder: StandaloneReminder | null;
  isOpen: boolean;
  onClose: () => void;
  userSession?: UserSession | null;
  onSave: (
    id: string,
    updates: {
      title: string;
      date: string;
      time?: string;
      notes?: string;
      alert10Min?: boolean;
      alertExact?: boolean;
      habitId?: string | null;
      daysOfWeek?: number[];
      isEnabled?: boolean;
      notificationId1?: number;
      notificationId2?: number;
    }
  ) => void;
}

export const EditReminderModal: React.FC<EditReminderModalProps> = ({
  reminder,
  isOpen,
  onClose,
  userSession,
  onSave,
}) => {
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [notes, setNotes] = useState('');
  const [alert10Min, setAlert10Min] = useState(true);
  const [alertExact, setAlertExact] = useState(true);

  useEffect(() => {
    if (reminder) {
      setTitle(reminder.title);
      setDate(reminder.date);
      setTime(reminder.time || '');
      setNotes(reminder.notes || '');
      setAlert10Min(reminder.alert10Min !== false);
      setAlertExact(reminder.alertExact !== false);
    }
  }, [reminder, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reminder || !title.trim()) return;

    const trimmedTime = time.trim();
    const alert10 = trimmedTime ? alert10Min : false;
    const alertExactTime = trimmedTime ? alertExact : false;
    const ids = reminderNotificationIds(reminder.id);
    const notificationId1 = Math.trunc(reminder.notificationId1 ?? ids.notificationId1);
    const notificationId2 = Math.trunc(reminder.notificationId2 ?? ids.notificationId2);
    const daysOfWeek = [weekdayFromIsoDate(date)];
    const isEnabled = !reminder.completed && (trimmedTime ? alert10 || alertExactTime : true);
    const updates = {
      title: title.trim(),
      date,
      time: trimmedTime || undefined,
      notes: notes.trim() || undefined,
      alert10Min: alert10,
      alertExact: alertExactTime,
      habitId: reminder.habitId ?? null,
      daysOfWeek,
      isEnabled,
      notificationId1,
      notificationId2,
    };

    await upsertPublicReminder(userSession, {
      ...reminder,
      ...updates,
      updatedAt: Date.now(),
    });

    onSave(reminder.id, updates);
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && reminder && (
        <motion.div
          id="edit-reminder-modal-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/45 dark:bg-slate-950/60 backdrop-blur-[8px]"
          onClick={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
        >
          <motion.div
            id="edit-reminder-modal-card"
            initial={{ opacity: 0, y: 20, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="relative w-full max-w-[390px] max-h-[min(92dvh,740px)] bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-2xl border border-slate-100 dark:border-slate-800 flex flex-col overflow-y-auto"
          >
        <div className="flex justify-between items-center pb-3 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h2 className="text-[17px] font-bold text-slate-900 dark:text-white leading-tight">Edit Reminder</h2>
            <p className="text-[11.5px] text-slate-500 dark:text-slate-400">Update time, alerts & notes</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white transition cursor-pointer"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-3.5 text-[13px] text-left">
          {/* Title */}
          <div>
            <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1 text-[12px]">
              Title
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Morning Meds, Drink water"
              className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white text-[12.5px] focus:outline-none focus:ring-2 focus:ring-[#22C55E]/25 dark:focus:ring-[#3B82F6]/25 focus:border-[#22C55E] dark:focus:border-[#3B82F6]"
            />
          </div>

          {/* Date & Time */}
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1 text-[12px]">
                Date
              </label>
              <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white text-[12.5px] focus:outline-none focus:ring-2 focus:ring-[#22C55E]/25 dark:focus:ring-[#3B82F6]/25 focus:border-[#22C55E] dark:focus:border-[#3B82F6]"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1 text-[12px]">
                Time <span className="text-[10px] font-normal text-slate-400">optional</span>
              </label>
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white text-[12.5px] focus:outline-none focus:ring-2 focus:ring-[#22C55E]/25 dark:focus:ring-[#3B82F6]/25 focus:border-[#22C55E] dark:focus:border-[#3B82F6]"
              />
            </div>
          </div>

          {/* Alert Toggles (if time is set) */}
          {time.trim() && (
            <div className="flex items-center space-x-2 pt-0.5">
              <button
                type="button"
                onClick={() => setAlert10Min((prev) => !prev)}
                className={`px-2.5 py-1.5 rounded-xl text-xs font-bold border transition cursor-pointer flex items-center space-x-1.5 ${
                  alert10Min
                    ? 'bg-emerald-50 border-[#22C55E] text-emerald-800 dark:bg-blue-950/60 dark:border-[#3B82F6] dark:text-blue-300'
                    : 'bg-slate-50 border-slate-200 text-slate-400 dark:bg-slate-800 dark:border-slate-700'
                }`}
              >
                <span>🔔 10m Prior</span>
              </button>
              <button
                type="button"
                onClick={() => setAlertExact((prev) => !prev)}
                className={`px-2.5 py-1.5 rounded-xl text-xs font-bold border transition cursor-pointer flex items-center space-x-1.5 ${
                  alertExact
                    ? 'bg-emerald-50 border-[#22C55E] text-emerald-800 dark:bg-blue-950/60 dark:border-[#3B82F6] dark:text-blue-300'
                    : 'bg-slate-50 border-slate-200 text-slate-400 dark:bg-slate-800 dark:border-slate-700'
                }`}
              >
                <span>⚡ Exact Time</span>
              </button>
            </div>
          )}
          {time.trim() && (
            <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
              Saves to your account and schedules native alerts 10 minutes before and at the exact time on this device.
            </p>
          )}

          {/* Notes */}
          <div>
            <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1 text-[12px]">
              Notes <span className="text-[10px] font-normal text-slate-400">optional</span>
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add additional details or context..."
              className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white text-[12.5px] focus:outline-none focus:ring-2 focus:ring-[#22C55E]/25 dark:focus:ring-[#3B82F6]/25 focus:border-[#22C55E] dark:focus:border-[#3B82F6] resize-none"
            />
          </div>

          <div className="pt-2 flex space-x-2.5">
            <motion.button
              type="button"
              whileTap={{ scale: 0.95 }}
              onClick={onClose}
              className="flex-1 py-2.5 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold hover:bg-slate-200 dark:hover:bg-slate-700 transition cursor-pointer"
            >
              Cancel
            </motion.button>
            <motion.button
              type="submit"
              whileTap={{ scale: 0.95 }}
              className="flex-1 py-2.5 rounded-2xl bg-[#22C55E] dark:bg-[#3B82F6] text-white font-semibold hover:bg-emerald-600 dark:hover:bg-blue-500 shadow-md transition cursor-pointer"
            >
              Save Changes
            </motion.button>
          </div>
        </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
