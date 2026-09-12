import { driver, type Driver } from 'driver.js';
import 'driver.js/dist/driver.css';

let activeTour: Driver | null = null;
let completeOnDestroy = true;

export function startAscendSpotlightTutorial(onComplete: () => void): void {
  if (activeTour?.isActive()) {
    return;
  }

  completeOnDestroy = true;
  const instance = driver({
    animate: true,
    smoothScroll: true,
    allowClose: true,
    stagePadding: 10,
    stageRadius: 18,
    overlayColor: '#0f172a',
    overlayOpacity: 0.48,
    popoverClass: 'ascend-driver-popover',
    popoverOffset: 14,
    showProgress: true,
    progressText: '{{current}} of {{total}}',
    nextBtnText: 'Next',
    prevBtnText: 'Back',
    doneBtnText: 'Got it',
    disableActiveInteraction: true,
    skipMissingElement: true,
    waitForElement: 2800,
    onDestroyed: () => {
      const shouldComplete = completeOnDestroy;
      activeTour = null;
      if (shouldComplete) {
        onComplete();
      }
    },
    steps: [
      {
        element: '[data-tour="momentum-card"]',
        popover: {
          title: 'Momentum Score (0–100)',
          description:
            'This is your anti-fragile velocity. Full completions add 1.0, fallback micro-habits add 0.5, and missed days decay gently instead of resetting to zero. Exam Shield freezes decay when you need it.',
          side: 'bottom',
          align: 'center',
        },
      },
      {
        element: '[data-tour="daily-wisdom"]',
        popover: {
          title: 'Daily Atomic Wisdom',
          description:
            'Quotes are curated from your Personal interests. We match categories in the quotes library, and fall back to Productivity / Atomic Habits in Guest mode or when no category match exists. Tap the card to cycle.',
          side: 'bottom',
          align: 'center',
        },
      },
      {
        element: '[data-tour="habit-card"]',
        popover: {
          title: 'Habit card gestures',
          description:
            'Swipe right to complete at 100%. Swipe left to switch to the 50% fallback micro-habit. Double-tap to flip the card and read your Purpose Anchor.',
          side: 'top',
          align: 'center',
        },
      },
      {
        element: '[data-tour="bottom-nav"]',
        popover: {
          title: 'Bottom navigation',
          description:
            'Home for daily execution, Reminders for standalone alerts, Report for analysis, and Personal for interests, identity, and protection modes.',
          side: 'top',
          align: 'center',
        },
      },
    ],
  });

  activeTour = instance;
  instance.drive();
}

export function destroyAscendSpotlightTutorial() {
  if (activeTour) {
    completeOnDestroy = false;
    activeTour.destroy();
    activeTour = null;
    completeOnDestroy = true;
  }
}
