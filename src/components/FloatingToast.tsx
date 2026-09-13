import React from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { toastMotion } from '../lib/motionPresets';

interface FloatingToastProps {
  message: string | null;
  tone?: 'ok' | 'error';
  id?: string;
}

export const FloatingToast: React.FC<FloatingToastProps> = ({
  message,
  tone = 'ok',
  id = 'ascend-floating-toast',
}) => {
  const isError = tone === 'error';
  return (
    <AnimatePresence>
      {message && (
        <motion.div
          id={id}
          role="status"
          initial={toastMotion.initial}
          animate={toastMotion.animate}
          exit={toastMotion.exit}
          transition={toastMotion.transition}
          className={`fixed top-[max(1.25rem,env(safe-area-inset-top))] left-1/2 -translate-x-1/2 z-[60] text-[12px] font-bold px-4 py-2 rounded-2xl shadow-2xl flex items-center space-x-2 pointer-events-none transform-gpu ${
            isError
              ? 'bg-white dark:bg-slate-900 text-rose-700 dark:text-rose-300 border-2 border-rose-400 dark:border-rose-500'
              : 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white border-2 border-[#23C15D] dark:border-blue-500'
          }`}
        >
          <div
            className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 ${
              isError
                ? 'bg-rose-50 dark:bg-rose-950 text-rose-600 dark:text-rose-300'
                : 'bg-emerald-50 dark:bg-blue-950 text-[#23C15D] dark:text-blue-400'
            }`}
          >
            <svg className="w-2.5 h-2.5 stroke-[3.5]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {isError ? (
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              )}
            </svg>
          </div>
          <span>{message}</span>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
