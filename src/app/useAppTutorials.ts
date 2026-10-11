import { useEffect } from 'react';
import { persistUserProfile } from '../lib/profile';
import {
  destroyAscendSpotlightTutorial,
  hasScreenTutorialCompleted,
  markScreenTutorialCompleted,
  startAscendSpotlightTutorial,
  startScreenTutorial,
  type TutorialScreen,
} from '../lib/tutorial';
import { useOnboarding, useOnboardingActions } from '../providers/OnboardingProvider';
import { usePreferences } from '../providers/PreferencesProvider';
import { useSession } from '../providers/SessionProvider';
import { useUI, useUIActions } from '../providers/UIProvider';

const SPOTLIGHT_DELAY_MS = 700;
const SCREEN_TUTORIAL_DELAY_MS = 550;
const SCREENS_WITH_TUTORIALS: readonly TutorialScreen[] = ['reminders', 'report', 'personal', 'settings'];

/**
 * The first-run spotlight tour on Home (while the profile says it is not done),
 * then a short tour the first time each other tab opens.
 */
export function useAppTutorials(revealNav: () => void): void {
  const { session } = useSession();
  const { hasCompletedTutorial } = useOnboarding();
  const { completeTutorial, tutorialLock, setTutorialLocked } = useOnboardingActions();
  const { selectedInterests } = usePreferences();
  const { activeTab, modalStack } = useUI();
  const { setTab } = useUIActions();
  const isAddModalOpen = modalStack.some((modal) => modal.kind === 'addHabit');

  useEffect(() => {
    if (!session || hasCompletedTutorial !== false || tutorialLock.current) return;
    if (activeTab !== 'home') {
      setTab('home');
      return;
    }
    revealNav();
    const timer = window.setTimeout(() => {
      if (tutorialLock.current || isAddModalOpen) return;
      setTutorialLocked(true);
      startAscendSpotlightTutorial(() => {
        completeTutorial();
        markScreenTutorialCompleted('home');
        if (!session.isGuest) {
          void persistUserProfile(session, { has_completed_tutorial: true, interests: selectedInterests }).catch(() => {});
        }
      });
    }, SPOTLIGHT_DELAY_MS);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- tutorialLock is a ref; actions are stable
  }, [session, hasCompletedTutorial, activeTab, selectedInterests, revealNav, isAddModalOpen]);

  useEffect(() => {
    if (!session || hasCompletedTutorial !== true) return;
    const screen = activeTab as TutorialScreen;
    if (!SCREENS_WITH_TUTORIALS.includes(screen) || hasScreenTutorialCompleted(screen)) return;
    revealNav();
    const timer = window.setTimeout(() => {
      if (hasScreenTutorialCompleted(screen)) return;
      startScreenTutorial(screen, () => markScreenTutorialCompleted(screen));
    }, SCREEN_TUTORIAL_DELAY_MS);
    return () => {
      window.clearTimeout(timer);
      destroyAscendSpotlightTutorial();
    };
  }, [session, hasCompletedTutorial, activeTab, revealNav]);
}
