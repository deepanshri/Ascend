import React from 'react';
import { motion } from 'motion/react';
import { Shield, GraduationCap } from 'lucide-react';
import { MotionModal } from './MotionModal';
import { tapPress } from '../lib/motionPresets';
import type { ProtectionModeStatus } from '../lib/protection';

export interface ExamShieldModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirmActivate: () => void;
  status?: ProtectionModeStatus;
}

export const ExamShieldModal: React.FC<ExamShieldModalProps> = ({
  isOpen,
  onClose,
  onConfirmActivate,
  status,
}) => {
  const daysUsed = status?.daysUsed ?? 0;
  const daysCap = status?.daysCap ?? 14;
  const daysRemaining = Math.max(0, daysCap - daysUsed);

  return (
    <MotionModal
      isOpen={isOpen}
      onClose={onClose}
      overlayId="exam-shield-modal-overlay"
      cardId="exam-shield-modal-card"
      cardClassName="p-6 max-w-sm space-y-4"
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-12 h-12 rounded-2xl bg-[#E8F8EE] dark:bg-blue-950/80 border border-[#23C15D]/40 dark:border-blue-800 flex items-center justify-center text-[#165B33] dark:text-blue-300">
            <GraduationCap className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-[17px] font-black text-slate-900 dark:text-white leading-tight">
              Activate Exam Shield
            </h2>
            <div className="flex items-center space-x-1.5 mt-0.5 text-[11px] text-emerald-700 dark:text-blue-400 font-semibold">
              <Shield className="w-3.5 h-3.5" />
              <span>Momentum Protection</span>
            </div>
          </div>
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

      <div className="space-y-3 text-[13px] leading-relaxed text-slate-600 dark:text-slate-300">
        <p className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200/90 dark:border-slate-700/80 font-medium text-slate-700 dark:text-slate-200">
          Exam Shield freezes your momentum decay during exams so you don&apos;t lose your streak while studying. Once activated, it consumes your shield balance.
        </p>

        <div className="p-3 rounded-2xl bg-[#E8F8EE]/60 dark:bg-blue-950/40 border border-emerald-200/80 dark:border-blue-900/60 text-[11.5px] space-y-1.5 text-slate-700 dark:text-slate-300">
          <div className="flex justify-between items-center font-semibold">
            <span className="text-slate-600 dark:text-slate-400">Semester allowance:</span>
            <span className="text-[#165B33] dark:text-blue-300 font-bold">
              {daysRemaining} day{daysRemaining === 1 ? '' : 's'} remaining
            </span>
          </div>
          <div className="flex justify-between items-center text-slate-500 dark:text-slate-400 text-[11px]">
            <span>Used this semester:</span>
            <span>{daysUsed} / {daysCap} days</span>
          </div>
          <div className="text-[10.5px] text-slate-500 dark:text-slate-400 pt-0.5 border-t border-emerald-200/40 dark:border-blue-900/40">
            A 30-day cooldown applies once deactivated before reactivating.
          </div>
        </div>
      </div>

      <div className="flex space-x-2.5 pt-1">
        <motion.button
          id="exam-shield-cancel-btn"
          type="button"
          whileTap={tapPress}
          onClick={onClose}
          className="flex-1 py-2.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold rounded-2xl hover:bg-slate-200 dark:hover:bg-slate-700 transition cursor-pointer text-[13px]"
        >
          Cancel
        </motion.button>
        <motion.button
          id="exam-shield-confirm-btn"
          type="button"
          whileTap={tapPress}
          onClick={() => {
            onConfirmActivate();
            onClose();
          }}
          className="flex-1 py-2.5 bg-[#23C15D] dark:bg-blue-600 text-white font-bold rounded-2xl shadow-sm hover:bg-emerald-600 dark:hover:bg-blue-500 transition cursor-pointer text-[13px]"
        >
          Activate Shield
        </motion.button>
      </div>
    </MotionModal>
  );
};
