import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { MotionModal } from './MotionModal';
import { tapPress } from '../lib/motionPresets';
import { FRICTION_REASON_CHIPS } from '../lib/frictionAudit';

interface FrictionAuditModalProps {
  isOpen: boolean;
  habitName: string;
  loggedDate?: string;
  onSubmit: (reason: string) => void;
  onSkip: () => void;
  onRolloverMicro?: () => void;
}

export const FrictionAuditModal: React.FC<FrictionAuditModalProps> = ({
  isOpen,
  habitName,
  loggedDate,
  onSubmit,
  onSkip,
  onRolloverMicro,
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
    <MotionModal
      isOpen={isOpen}
      onClose={onSkip}
      overlayId="friction-audit-overlay"
      cardId="friction-audit-card"
      cardClassName="p-5 max-w-[340px]"
      closeOnBackdrop={false}
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

            {onRolloverMicro && (
              <div className="mt-3.5">
                <button
                  type="button"
                  id="friction-rollover-micro-btn"
                  onClick={onRolloverMicro}
                  className="w-full py-2.5 px-3 bg-amber-500/15 dark:bg-amber-500/20 border border-amber-500/40 hover:bg-amber-500/25 text-amber-800 dark:text-amber-200 font-bold text-[12.5px] rounded-xl flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 dark:bg-amber-400 shrink-0" />
                  <span>Convert to 50% Micro-Habit Rollover</span>
                </button>
              </div>
            )}

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
                <motion.button
                  type="button"
                  whileTap={tapPress}
                  onClick={onSkip}
                  className="flex-1 py-2.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold text-[13px] rounded-2xl hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer"
                >
                  Skip
                </motion.button>
                <motion.button
                  type="submit"
                  whileTap={!customNote.trim() ? undefined : tapPress}
                  disabled={!customNote.trim()}
                  className="flex-1 py-2.5 bg-[#22C55E] dark:bg-[#3B82F6] text-white font-bold text-[13px] rounded-2xl hover:bg-emerald-600 dark:hover:bg-blue-500 cursor-pointer disabled:opacity-50"
                >
                  Save
                </motion.button>
              </div>
            </form>
    </MotionModal>
  );
};
