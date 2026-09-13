import React from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useKeyboardInset } from '../hooks/useKeyboardInset';
import { overlayFade, sheetMotion } from '../lib/motionPresets';

interface MotionModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  overlayId?: string;
  cardId?: string;
  overlayClassName?: string;
  cardClassName?: string;
  closeOnBackdrop?: boolean;
}

export const MotionModal: React.FC<MotionModalProps> = ({
  isOpen,
  onClose,
  children,
  overlayId,
  cardId,
  overlayClassName = 'bg-slate-900/45 dark:bg-slate-950/60 backdrop-blur-[8px]',
  cardClassName = 'p-5',
  closeOnBackdrop = true,
}) => {
  const keyboardInset = useKeyboardInset(isOpen);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          id={overlayId}
          initial={overlayFade.initial}
          animate={overlayFade.animate}
          exit={overlayFade.exit}
          transition={overlayFade.transition}
          onClick={(event) => {
            if (closeOnBackdrop && event.target === event.currentTarget) onClose();
          }}
          className={`fixed inset-0 z-50 flex items-center justify-center px-4 transform-gpu ${overlayClassName}`}
          style={{
            paddingTop: 'max(1rem, env(safe-area-inset-top))',
            paddingBottom: `max(1rem, calc(1rem + ${keyboardInset}px))`,
          }}
        >
          <motion.div
            id={cardId}
            initial={sheetMotion.initial}
            animate={sheetMotion.animate}
            exit={sheetMotion.exit}
            transition={sheetMotion.transition}
            onClick={(event) => event.stopPropagation()}
            className={`relative w-full max-w-[390px] bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-100 dark:border-slate-800 flex flex-col overflow-y-auto overscroll-y-contain transform-gpu will-change-transform ${cardClassName}`}
            style={{
              maxHeight: `min(740px, calc(100dvh - ${keyboardInset + 32}px))`,
            }}
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
