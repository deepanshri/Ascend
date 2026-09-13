import React from 'react';
import { motion } from 'motion/react';
import { MotionModal } from './MotionModal';
import { tapPress } from '../lib/motionPresets';
import { StandaloneReminder } from '../types';

interface DeleteReminderConfirmModalProps {
  reminder: StandaloneReminder | null;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export const DeleteReminderConfirmModal: React.FC<DeleteReminderConfirmModalProps> = ({
  reminder,
  isOpen,
  onClose,
  onConfirm,
}) => {
  return (
    <MotionModal
      isOpen={Boolean(isOpen && reminder)}
      onClose={onClose}
      overlayId="delete-reminder-confirm-overlay"
      cardId="delete-reminder-confirm-card"
      overlayClassName="bg-slate-900/40 backdrop-blur-xs"
      cardClassName="p-6 max-w-[340px]"
    >
            <div className="text-center">
              <motion.div
                initial={{ scale: 0.8 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', damping: 12, stiffness: 300 }}
                className="w-12 h-12 mx-auto rounded-full bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 flex items-center justify-center mb-3"
              >
                <svg className="w-6 h-6 stroke-[2]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
                  />
                </svg>
              </motion.div>

              <h3 className="text-[17px] font-bold text-slate-900 dark:text-white leading-snug">
                Delete reminder?
              </h3>

              <p className="mt-1.5 text-[14px] font-semibold text-slate-800 dark:text-slate-200">
                {reminder?.title}
              </p>

              <p className="mt-1 text-[12px] text-slate-500 dark:text-slate-400">
                {reminder?.date} {reminder?.time ? `at ${reminder.time}` : ''}
              </p>
            </div>

            <div className="mt-5 flex space-x-3">
              <motion.button
                type="button"
                id="delete-reminder-cancel-btn"
                whileTap={tapPress}
                onClick={onClose}
                className="flex-1 py-2.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-[13px] rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 transition cursor-pointer"
              >
                No
              </motion.button>
              <motion.button
                type="button"
                id="delete-reminder-confirm-btn"
                whileTap={tapPress}
                onClick={() => {
                  onConfirm();
                  onClose();
                }}
                className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-bold text-[13px] rounded-xl shadow-lg shadow-rose-600/30 transition cursor-pointer"
              >
                Yes, Delete
              </motion.button>
            </div>
    </MotionModal>
  );
};
