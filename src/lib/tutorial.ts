import { driver, type DriveStep, type Driver } from 'driver.js';
import 'driver.js/dist/driver.css';

export type TutorialScreen = 'home' | 'reminders' | 'report' | 'personal' | 'settings';

const SCREEN_STORAGE_PREFIX = 'ascend_tutorial_screen_';

let activeTour: Driver | null = null;
let completeOnDestroy = true;

export function hasScreenTutorialCompleted(screen: TutorialScreen): boolean {
  try {
    return localStorage.getItem(`${SCREEN_STORAGE_PREFIX}${screen}`) === 'true';
  } catch {
    return false;
  }
}

export function markScreenTutorialCompleted(screen: TutorialScreen): void {
  try {
    localStorage.setItem(`${SCREEN_STORAGE_PREFIX}${screen}`, 'true');
  } catch {}
}

function sharedDriver(steps: DriveStep[], onComplete: () => void): Driver {
  return driver({
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
    steps,
  });
}

const HOME_STEPS: DriveStep[] = [
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
        'Quotes and short feature tips rotate automatically every 5–6 hours. They are curated from your Personal interests, and fall back to Productivity / Atomic Habits in Guest mode or when no category match exists.',
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
        'Home for daily execution, Reminders for standalone alerts, Report for analysis, and Personal for interests, identity, and protection modes. Each tab has its own short walkthrough the first time you open it — close any of them with the X anytime.',
      side: 'top',
      align: 'center',
    },
  },
];

const SCREEN_STEPS: Record<Exclude<TutorialScreen, 'home'>, DriveStep[]> = {
  reminders: [
    {
      element: '[data-tour="reminders-standalone"]',
      popover: {
        title: 'Why reminders are separate',
        description:
          'Habits measure identity votes. Reminders are one-off checkpoints (a call, a deadline, a focus block) that should not rewrite your momentum if you miss them. That is why they live on their own tab.',
        side: 'bottom',
        align: 'start',
      },
    },
    {
      element: '[data-tour="reminders-dual-alerts"]',
      popover: {
        title: 'Dual native alerts',
        description:
          'Each timed reminder can fire twice: 10 minutes before (so you can wrap up) and at the exact time. Both are scheduled on the device so they survive force-quit — not a browser timer.',
        side: 'bottom',
        align: 'start',
      },
    },
  ],
  report: [
    {
      element: '[data-tour="report-rings"]',
      popover: {
        title: 'Daily dots vs these rings',
        description:
          'Home’s fan dots are a week-at-a-glance of whether you showed up. These rings split the same event log by Work, Self-Improvement, and Sleep. Switch Graph swaps rings for the line view — the Analysis bars stay put. Tabs filter Today, 7 days, 30 days, or the full momentum curve.',
        side: 'bottom',
        align: 'center',
      },
    },
    {
      element: '[data-tour="report-ledger"]',
      popover: {
        title: 'Identity Ledger is permanent',
        description:
          'Every full or fallback log casts a vote that never expires or resets. The ledger is your identity evidence, not a streak. Swiping a card back does not take a vote away.',
        side: 'bottom',
        align: 'start',
      },
    },
    {
      element: '[data-tour="report-momentum"]',
      popover: {
        title: 'Momentum is velocity, not a total',
        description:
          'Momentum (0–100) is a rolling EMA of recent logs. It can dip when you miss and recover when you return. It is deliberately different from the ledger count and from today’s dots so one bad week cannot erase who you have been becoming.',
        side: 'top',
        align: 'center',
      },
    },
  ],
  personal: [
    {
      element: '[data-tour="personal-protection"]',
      popover: {
        title: 'Exam Shield & Vacation are protection, not cheating',
        description:
          'Life has exams and travel. These modes set miss-decay (δ) to 0 for a capped window so a real disruption does not punish the score. They do not auto-complete habits or add fake votes — they only pause the penalty.',
        side: 'bottom',
        align: 'start',
      },
    },
    {
      element: '[data-tour="personal-friends"]',
      popover: {
        title: 'Friends stay mutual and private',
        description:
          'Share your 6-character friend code or enter theirs to connect immediately — no request to accept. Unfriend anytime. The feed is activity only — no rankings. An Affirmation Glow is a private nod between two people.',
        side: 'top',
        align: 'start',
      },
    },
  ],
  settings: [
    {
      element: '[data-tour="settings-notifications"]',
      popover: {
        title: 'Notification controls live here',
        description:
          'Morning, afternoon, and night psychology windows are granted with the app’s general notification permission — not a separate onboarding step. Toggle only the windows you want.',
        side: 'bottom',
        align: 'start',
      },
    },
    {
      element: '[data-tour="settings-theme"]',
      popover: {
        title: 'Theme & data',
        description:
          'This screen stays utilitarian on purpose: appearance, export/import, and account controls. Nothing here changes how momentum is calculated.',
        side: 'bottom',
        align: 'start',
      },
    },
  ],
};

export function startAscendSpotlightTutorial(onComplete: () => void): void {
  startScreenTutorial('home', onComplete);
}

export function startScreenTutorial(screen: TutorialScreen, onComplete: () => void): void {
  if (activeTour?.isActive()) {
    return;
  }
  completeOnDestroy = true;
  const steps = screen === 'home' ? HOME_STEPS : SCREEN_STEPS[screen];
  const instance = sharedDriver(steps, onComplete);
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
