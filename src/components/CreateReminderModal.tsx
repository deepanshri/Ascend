import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { MotionModal } from './MotionModal';
import { tapPress } from '../lib/motionPresets';
import { StandaloneReminder, UserSession } from '../types';
import { reminderNotificationIds, weekdayFromIsoDate } from '../lib/notifications';
import { upsertPublicReminder } from '../lib/supabase';

const FIELD_CLASS =
  'w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white text-[12.5px] transition-colors focus:bg-white dark:focus:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-[#22C55E]/25 dark:focus:ring-[#3B82F6]/25 focus:border-[#22C55E] dark:focus:border-[#3B82F6]';

interface CreateReminderModalProps {
  isOpen: boolean;
  onClose: () => void;
  userSession?: UserSession | null;
  onAddReminder: (
    reminder: Omit<StandaloneReminder, 'id' | 'completed' | 'createdAt' | 'updatedAt'> & {
      id?: string;
      notificationId1?: number;
      notificationId2?: number;
    }
  ) => void;
}

export const CreateReminderModal: React.FC<CreateReminderModalProps> = ({
  isOpen,
  onClose,
  userSession,
  onAddReminder,
}) => {
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [time, setTime] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setTitle('');
    setDate(new Date().toISOString().slice(0, 10));
    setTime('');
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    const now = Date.now();
    const trimmedTime = time.trim();
    const id = 'rem-' + now + '-' + Math.random().toString(36).substring(2, 6);
    const ids = reminderNotificationIds(id);
    const item: StandaloneReminder = {
      id,
      title: title.trim(),
      date,
      time: trimmedTime || undefined,
      alert10Min: Boolean(trimmedTime),
      alertExact: Boolean(trimmedTime),
      completed: false,
      createdAt: now,
      updatedAt: now,
      habitId: null,
      daysOfWeek: [weekdayFromIsoDate(date)],
      isEnabled: true,
      notificationId1: ids.notificationId1,
      notificationId2: ids.notificationId2,
    };

    await upsertPublicReminder(userSession, item);

    onAddReminder({
      id: item.id,
      title: item.title,
      date: item.date,
      time: item.time,
      alert10Min: item.alert10Min,
      alertExact: item.alertExact,
      habitId: item.habitId,
      daysOfWeek: item.daysOfWeek,
      isEnabled: item.isEnabled,
      notificationId1: item.notificationId1,
      notificationId2: item.notificationId2,
    });

    onClose();
  };

  return (
    <MotionModal
      isOpen={isOpen}
      onClose={onClose}
      overlayId="add-reminder-modal-overlay"
      cardId="add-reminder-modal-card"
      cardClassName="p-6"
    >
            <div className="flex justify-between items-center pb-3 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h2 className="text-[17px] font-bold text-slate-900 dark:text-white leading-tight">Create Task</h2>
                <p className="text-[11.5px] text-slate-500 dark:text-slate-400">
                  Add a time → Reminder (R). Leave time empty → To-Do (TD)
                </p>
              </div>
              <motion.button
                type="button"
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.88 }}
                onClick={onClose}
                aria-label="Close"
                className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white transition cursor-pointer"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </motion.button>
            </div>

            <form onSubmit={handleSubmit} className="mt-4 space-y-3.5 text-[13px]">
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1 text-[12px]">Title</label>
                <input
                  id="reminder-title-input"
                  type="text"
                  required
                  enterKeyHint="done"
                  autoComplete="off"
                  placeholder="e.g. Afternoon focus block"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className={FIELD_CLASS}
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1 text-[12px]">
                    <span className="flex items-center justify-between">
                      Date
                      <button
                        type="button"
                        onClick={() => setDate(new Date().toISOString().slice(0, 10))}
                        className="text-[10px] text-[#22C55E] dark:text-[#3B82F6] font-semibold cursor-pointer hover:underline"
                      >
                        Today
                      </button>
                    </span>
                  </label>
                  <input
                    id="reminder-date-input"
                    type="date"
                    required
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className={FIELD_CLASS}
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1 text-[12px]">
                    <span className="flex items-center justify-between">
                      Time
                      {time ? (
                        <button
                          type="button"
                          onClick={() => setTime('')}
                          className="text-[10px] text-rose-600 dark:text-rose-400 font-semibold cursor-pointer hover:underline"
                        >
                          Clear
                        </button>
                      ) : (
                        <span className="text-[10px] font-normal text-slate-400">optional</span>
                      )}
                    </span>
                  </label>
                  <input
                    id="reminder-time-input"
                    type="time"
                    value={time}
                    onChange={(e) => setTime(e.target.value)}
                    className={FIELD_CLASS}
                  />
                </div>
              </div>

              <div className="pt-2 flex space-x-2.5">
                <motion.button
                  type="button"
                  whileTap={tapPress}
                  onClick={onClose}
                  className="flex-1 py-2.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold rounded-2xl hover:bg-slate-200 dark:hover:bg-slate-700 transition cursor-pointer"
                >
                  Cancel
                </motion.button>
                <motion.button
                  id="save-new-reminder-btn"
                  type="submit"
                  whileTap={tapPress}
                  className="flex-1 py-2.5 font-semibold rounded-2xl shadow-md transition bg-[#22C55E] hover:bg-emerald-600 dark:bg-[#3B82F6] dark:hover:bg-blue-500 text-white cursor-pointer"
                >
                  {time.trim() ? 'Create Reminder' : 'Create To-Do'}
                </motion.button>
              </div>
            </form>
    </MotionModal>
  );
};
