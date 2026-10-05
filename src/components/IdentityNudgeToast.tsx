import React, { useEffect } from 'react';
import { AnimatePresence, motion } from 'motion/react';

export interface IdentityNudgeToastProps {
  statement: string | null;
  onClose?: () => void;
  durationMs?: number;
}

export const IdentityNudgeToast: React.FC<IdentityNudgeToastProps> = ({
  statement,
  onClose,
  durationMs = 2200,
}) => {
  useEffect(() => {
    if (!statement) return;
    const timer = window.setTimeout(() => {
      onClose?.();
    }, durationMs);
    return () => window.clearTimeout(timer);
  }, [statement, durationMs, onClose]);

  return (
    <AnimatePresence>
      {statement && (
        <motion.div
          id="identity-nudge-toast"
          role="status"
          aria-live="polite"
          onClick={onClose}
          initial={{ opacity: 0, y: -10, x: '-50%', scale: 0.94 }}
          animate={{ opacity: 1, y: 0, x: '-50%', scale: 1 }}
          exit={{ opacity: 0, y: -8, x: '-50%', scale: 0.95 }}
          transition={{ type: 'spring', stiffness: 450, damping: 28 }}
          className="fixed left-1/2 z-50 flex items-center gap-2 px-4 py-1.5 rounded-full text-xs shadow-xl backdrop-blur-md select-none cursor-pointer border border-white/10 bg-slate-900/85 dark:bg-slate-900/95 text-white max-w-[90vw]"
          style={{
            top: 'max(4rem, calc(env(safe-area-inset-top, 0px) + 3.75rem))',
          }}
        >
          {/* Emerald Vote Badge Icon */}
          <span className="flex items-center justify-center w-4 h-4 rounded-full bg-emerald-500/25 text-emerald-400 text-[10px] font-black shrink-0">
            ✓
          </span>

          <span className="font-semibold text-emerald-400 shrink-0">
            +1 Vote Cast
          </span>

          <span className="text-white/40">·</span>

          <span className="italic truncate max-w-[200px] sm:max-w-[300px] text-slate-200">
            &ldquo;{statement}&rdquo;
          </span>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
