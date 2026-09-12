import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { StandaloneReminder } from '../types';

interface EditReminderModalProps {
  reminder: StandaloneReminder | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (
    id: string,
    updates: {
      title: string;
      date: string;
      time?: string;
      notes?: string;
      alert10Min?: boolean;
      alertExact?: boolean;
    }
  ) => void;
}

export const EditReminderModal: React.FC<EditReminderModalProps> = ({
  reminder,
  isOpen,
  onClose,
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reminder || !title.trim()) return;

    onSave(reminder.id, {
      title: title.trim(),
      date,
      time: time.trim() || undefined,
      notes: notes.trim() || undefined,
      alert10Min: time.trim() ? alert10Min : false,
      alertExact: time.trim() ? alertExact : false,
    });
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
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="relative w-full max-w-[390px] bg-white dark:bg-slate-900 rounded-3xl p-5 shadow-2xl border border-slate-100 dark:border-slate-800 flex flex-col space-y-4"
          >
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-xl bg-emerald-50 dark:bg-blue-950/60 flex items-center justify-center text-emerald-700 dark:text-blue-400">
              <svg className="w-4 h-4 stroke-[2.2]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10"
                />
              </svg>
            </div>
            <h3 className="text-[17px] font-bold text-slate-900 dark:text-white">
              Edit Reminder
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition cursor-pointer"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5 text-left">
          {/* Title */}
          <div>
            <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1">
              Title
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Morning Meds, Drink water"
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white text-sm focus:outline-hidden focus:border-emerald-500 dark:focus:border-blue-500"
            />
          </div>

          {/* Date & Time */}
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1">
                Date
              </label>
              <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white text-xs focus:outline-hidden focus:border-emerald-500"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1">
                Time (optional)
              </label>
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white text-xs focus:outline-hidden focus:border-emerald-500"
              />
            </div>
          </div>

          {/* Alert Toggles (if time is set) */}
          {time.trim() && (
            <div className="flex items-center space-x-2 pt-0.5">
              <button
                type="button"
                onClick={() => setAlert10Min((prev) => !prev)}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border transition cursor-pointer flex items-center space-x-1.5 ${
                  alert10Min
                    ? 'bg-emerald-50 border-emerald-300 text-emerald-800 dark:bg-blue-950/60 dark:border-blue-700 dark:text-blue-300'
                    : 'bg-slate-50 border-slate-200 text-slate-400 dark:bg-slate-800 dark:border-slate-700'
                }`}
              >
                <span>🔔 10m Prior</span>
              </button>
              <button
                type="button"
                onClick={() => setAlertExact((prev) => !prev)}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border transition cursor-pointer flex items-center space-x-1.5 ${
                  alertExact
                    ? 'bg-emerald-50 border-emerald-300 text-emerald-800 dark:bg-blue-950/60 dark:border-blue-700 dark:text-blue-300'
                    : 'bg-slate-50 border-slate-200 text-slate-400 dark:bg-slate-800 dark:border-slate-700'
                }`}
              >
                <span>⚡ Exact Time</span>
              </button>
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1">
              Notes (optional)
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add additional details or context..."
              className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white text-xs focus:outline-hidden focus:border-emerald-500 resize-none"
            />
          </div>

          <div className="flex space-x-2.5 pt-2">
            <motion.button
              type="button"
              whileTap={{ scale: 0.94 }}
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs hover:bg-slate-200 dark:hover:bg-slate-700 transition cursor-pointer"
            >
              Cancel
            </motion.button>
            <motion.button
              type="submit"
              whileTap={{ scale: 0.94 }}
              className="flex-1 py-2.5 rounded-xl bg-[#23C15D] dark:bg-blue-600 text-white font-bold text-xs hover:bg-emerald-600 dark:hover:bg-blue-700 shadow-md transition cursor-pointer"
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
