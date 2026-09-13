import React from 'react';
import { motion } from 'motion/react';
import { MotionModal } from './MotionModal';
import { tapPress } from '../lib/motionPresets';
import { Habit } from '../types';
import { deleteHabitCascade } from '../lib/habitsApi';

interface DeleteHabitConfirmModalProps {
  habit: Habit | null;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  userId?: string | null;
  isGuest?: boolean;
}

export const DeleteHabitConfirmModal: React.FC<DeleteHabitConfirmModalProps> = ({
  habit,
  isOpen,
  onClose,
  onConfirm,
  userId = null,
  isGuest = true,
}) => {
  return (
    <MotionModal
      isOpen={Boolean(isOpen && habit)}
      onClose={onClose}
      overlayId="delete-habit-confirm-overlay"
      cardId="delete-habit-confirm-card"
      cardClassName="p-6 max-w-[340px]"
      closeOnBackdrop={false}
    >
            <div className="text-center">
              <div className="w-12 h-12 mx-auto rounded-full bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 flex items-center justify-center mb-3">
                <svg className="w-6 h-6 stroke-[2]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                </svg>
              </div>

              <h3 className="text-[17px] font-bold text-slate-900 dark:text-white leading-snug">
                Delete the habit ?
              </h3>

              <p className="mt-1 text-[13.5px] font-semibold text-slate-800 dark:text-slate-200">
                {habit?.name}
              </p>

              <div className="mt-3 p-3 rounded-2xl bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 text-left">
                <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-400 mb-1">
                  Purpose
                </span>
                <p className="text-[12.5px] text-slate-600 dark:text-slate-300 italic leading-relaxed">
                  "{habit?.purposeAnchor || habit?.identityStatement || 'No specific purpose provided.'}"
                </p>
              </div>
            </div>

            <div className="mt-5 flex space-x-3">
              <motion.button
                type="button"
                id="delete-habit-cancel-btn"
                whileTap={tapPress}
                onClick={onClose}
                className="flex-1 py-2.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-[13px] rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer"
              >
                No
              </motion.button>
              <motion.button
                type="button"
                id="delete-habit-confirm-btn"
                whileTap={tapPress}
                onClick={() => {
                  if (!habit) return;
                  if (!isGuest) {
                    void deleteHabitCascade(userId, habit.id).catch(() => {});
                  }
                  onConfirm();
                }}
                className="flex-1 py-2.5 bg-rose-600 text-white font-bold text-[13px] rounded-xl hover:bg-rose-700 shadow-md shadow-rose-600/20 cursor-pointer"
              >
                Yes
              </motion.button>
            </div>
    </MotionModal>
  );
};
