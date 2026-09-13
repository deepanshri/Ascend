import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { FRICTION_REASON_CHIPS } from '../lib/frictionAudit';

interface FrictionAuditModalProps {
  isOpen: boolean;
  habitName: string;
  loggedDate?: string;
  onSubmit: (reason: string) => void;
  onSkip: () => void;
}

export const FrictionAuditModal: React.FC<FrictionAuditModalProps> = ({
  isOpen,
  habitName,
  loggedDate,
  onSubmit,
  onSkip,
}) => {
  const [customNote, setCustomNote] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setCustomNote('');
  }, [isOpen, habitName, loggedDate]);

  const submitReason = (reason: string) => {
    const trimmed = reason.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          id="friction-audit-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/45 dark:bg-slate-950/60 backdrop-blur-[8px]"
        >
          <motion.div
            id="friction-audit-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="friction-audit-title"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="relative w-full max-w-[340px] bg-white dark:bg-slate-900 rounded-3xl p-5 shadow-2xl border border-slate-100 dark:border-slate-800 flex flex-col"
          >
            <h3
              id="friction-audit-title"
              className="text-[17px] font-bold text-slate-900 dark:text-white leading-snug"
            >
              What got in the way today?
            </h3>
            <p className="mt-1 text-[12.5px] text-slate-500 dark:text-slate-400">
              {habitName}
              {loggedDate ? ` · ${loggedDate}` : ''}
            </p>

            <div className="mt-4 flex flex-wrap gap-1.5">
              {FRICTION_REASON_CHIPS.map((chip) => {
                return (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => submitReason(chip)}
                    className="px-2.5 py-1.5 rounded-xl text-[11.5px] font-bold border transition cursor-pointer bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-[#22C55E] dark:hover:border-[#3B82F6]"
                  >
                    {chip}
                  </button>
                );
              })}
            </div>

            <form
              className="mt-4 space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                submitReason(customNote);
              }}
            >
              <input
                type="text"
                value={customNote}
                onChange={(e) => setCustomNote(e.target.value)}
                placeholder="Or a quick note…"
                className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-[13px] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#22C55E]/25 dark:focus:ring-[#3B82F6]/25 focus:border-[#22C55E] dark:focus:border-[#3B82F6]"
              />
              <div className="flex space-x-2">
                <button
                  type="button"
                  onClick={onSkip}
                  className="flex-1 py-2.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold text-[13px] rounded-2xl hover:bg-slate-200 dark:hover:bg-slate-700 active:scale-95 transition cursor-pointer"
                >
                  Skip
                </button>
                <button
                  type="submit"
                  disabled={!customNote.trim()}
                  className="flex-1 py-2.5 bg-[#22C55E] dark:bg-[#3B82F6] text-white font-bold text-[13px] rounded-2xl hover:bg-emerald-600 dark:hover:bg-blue-500 active:scale-95 transition cursor-pointer disabled:opacity-50"
                >
                  Save
                </button>
              </div>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
