/**
 * Document-level scroll lock for in-flight card swipes.
 * Uses a CSS class only (no React setState) so the main thread never
 * re-renders habit cards mid-gesture — that pattern freezes Capacitor WebViews.
 */
const SWIPE_LOCK_CLASS = 'ascend-swiping';
let swipeLockCount = 0;

export function acquireSwipeScrollLock(): void {
  swipeLockCount += 1;
  if (swipeLockCount === 1) {
    document.documentElement.classList.add(SWIPE_LOCK_CLASS);
  }
}

export function releaseSwipeScrollLock(): void {
  swipeLockCount = Math.max(0, swipeLockCount - 1);
  if (swipeLockCount === 0) {
    document.documentElement.classList.remove(SWIPE_LOCK_CLASS);
  }
}

export function forceReleaseSwipeScrollLock(): void {
  swipeLockCount = 0;
  document.documentElement.classList.remove(SWIPE_LOCK_CLASS);
}
