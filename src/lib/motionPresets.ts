export const MOTION_EASE_OUT = 'easeOut' as const;
export const MOTION_DURATION = 0.2;

export const overlayFade = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: { duration: MOTION_DURATION, ease: MOTION_EASE_OUT },
};

export const sheetMotion = {
  initial: { opacity: 0, scale: 0.95, y: 15 },
  animate: { opacity: 1, scale: 1, y: 0 },
  exit: { opacity: 0, scale: 0.95, y: 10 },
  transition: { duration: MOTION_DURATION, ease: MOTION_EASE_OUT },
};

export const toastMotion = {
  initial: { opacity: 0, y: -16, scale: 0.96 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: -10, scale: 0.96 },
  transition: { duration: MOTION_DURATION, ease: MOTION_EASE_OUT },
};

export const tapPress = { scale: 0.97 };
