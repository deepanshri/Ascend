import React from 'react';
import { motion } from 'motion/react';

export interface VisionReminderModalProps {
  isOpen?: boolean;
  visionText: string;
  onDismiss: () => void;
}

export const VisionReminderModal: React.FC<VisionReminderModalProps> = ({
  isOpen = true,
  visionText,
  onDismiss,
}) => {
  if (!isOpen) return null;

  return (
    <motion.div
      id="vision-reminder-overlay"
      data-ascend-modal="true"
      role="dialog"
      aria-modal="true"
      aria-label="Reconnect with your vision"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center p-6 bg-slate-950/92 backdrop-blur-2xl text-white select-none"
    >
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 16, scale: 0.96 }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        className="flex flex-col items-center max-w-xl text-center"
      >
        <span className="text-xs uppercase tracking-widest text-amber-400 font-semibold mb-4">
          RECONNECT WITH YOUR VISION
        </span>

        <p className="text-xl md:text-2xl font-serif text-slate-100 text-center leading-relaxed max-w-lg my-6 italic">
          &ldquo;{visionText}&rdquo;
        </p>

        <button
          type="button"
          onClick={onDismiss}
          className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold px-7 py-3.5 rounded-2xl shadow-xl transition-all text-sm cursor-pointer active:scale-95"
        >
          It&apos;s not too late · You can do it →
        </button>
      </motion.div>
    </motion.div>
  );
};
