import React, { createContext, startTransition, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { getLocalTutorialCompleted, setLocalTutorialCompleted } from '../lib/profile';
import { isOnboardingCompleted, setOnboardingCompleted } from '../lib/supabase';
import { destroyAscendSpotlightTutorial } from '../lib/tutorial';
import { useUserDataReset } from './SessionProvider';

export type OnboardingStep = 1 | 2 | 3;

interface OnboardingState {
  isOnboarded: boolean;
  onboardingStep: OnboardingStep;
  /** null until known (not completed locally and the profile has not answered yet). */
  hasCompletedTutorial: boolean | null;
  /** Account sync may run: onboarding is done or has reached its last step. */
  isSyncReady: boolean;
}

interface OnboardingActions {
  completeOnboarding: () => void;
  setOnboardingStep: (step: OnboardingStep) => void;
  /** A brand-new account: show onboarding and the tutorial. */
  startAsNewUser: () => void;
  /** A returning account: skip onboarding and the tutorial. */
  startAsReturningUser: () => void;
  /** Apply the tutorial flag resolved from the profile. */
  setTutorialCompleted: (completed: boolean | null) => void;
  /** The spotlight tutorial finished. */
  completeTutorial: () => void;
  /** Tutorial guard so it is started at most once per sign-in. */
  tutorialLock: { readonly current: boolean };
  setTutorialLocked: (locked: boolean) => void;
}

const OnboardingStateContext = createContext<OnboardingState | null>(null);
const OnboardingActionsContext = createContext<OnboardingActions | null>(null);

function readIsOnboarded(): boolean {
  if (typeof window !== 'undefined' && window.location.search.includes('onboarding=true')) return false;
  return isOnboardingCompleted();
}

function readTutorialCompleted(): boolean | null {
  try {
    return getLocalTutorialCompleted() ? true : null;
  } catch {
    return null;
  }
}

export function OnboardingProvider({ children }: { children: React.ReactNode }) {
  const [isOnboarded, setIsOnboarded] = useState(readIsOnboarded);
  const [onboardingStep, setStep] = useState<OnboardingStep>(1);
  const [hasCompletedTutorial, setHasCompletedTutorial] = useState(readTutorialCompleted);
  const tutorialLock = useRef(false);

  // RESET_ALL: back to what storage says, which is empty after a purge.
  useUserDataReset(() => {
    destroyAscendSpotlightTutorial();
    setIsOnboarded(readIsOnboarded());
    setStep(1);
    setHasCompletedTutorial(readTutorialCompleted());
    tutorialLock.current = false;
  });

  const completeOnboarding = useCallback(() => {
    setIsOnboarded(true);
    setOnboardingCompleted(true);
    if (typeof window !== 'undefined' && window.location.search.includes('onboarding=true')) {
      const url = new URL(window.location.href);
      url.searchParams.delete('onboarding');
      window.history.replaceState({}, '', url.toString());
    }
  }, []);

  const setOnboardingStep = useCallback((step: OnboardingStep) => {
    startTransition(() => setStep(step));
  }, []);

  const startAsNewUser = useCallback(() => {
    setIsOnboarded(false);
    setOnboardingCompleted(false);
    setHasCompletedTutorial(false);
    setLocalTutorialCompleted(false, { force: true });
    tutorialLock.current = false;
  }, []);

  const startAsReturningUser = useCallback(() => {
    setIsOnboarded(true);
    setOnboardingCompleted(true);
    setHasCompletedTutorial(true);
    setLocalTutorialCompleted(true);
    tutorialLock.current = true;
  }, []);

  const completeTutorial = useCallback(() => {
    setHasCompletedTutorial(true);
    setLocalTutorialCompleted(true);
  }, []);

  const setTutorialLocked = useCallback((locked: boolean) => {
    tutorialLock.current = locked;
  }, []);

  const state = useMemo<OnboardingState>(
    () => ({ isOnboarded, onboardingStep, hasCompletedTutorial, isSyncReady: isOnboarded || onboardingStep >= 3 }),
    [isOnboarded, onboardingStep, hasCompletedTutorial]
  );

  const actions = useMemo<OnboardingActions>(
    () => ({
      completeOnboarding,
      setOnboardingStep,
      startAsNewUser,
      startAsReturningUser,
      setTutorialCompleted: setHasCompletedTutorial,
      completeTutorial,
      tutorialLock,
      setTutorialLocked,
    }),
    [completeOnboarding, setOnboardingStep, startAsNewUser, startAsReturningUser, completeTutorial, setTutorialLocked]
  );

  return (
    <OnboardingActionsContext.Provider value={actions}>
      <OnboardingStateContext.Provider value={state}>{children}</OnboardingStateContext.Provider>
    </OnboardingActionsContext.Provider>
  );
}

export function useOnboarding(): OnboardingState {
  const value = useContext(OnboardingStateContext);
  if (!value) throw new Error('useOnboarding must be used inside OnboardingProvider');
  return value;
}

export function useOnboardingActions(): OnboardingActions {
  const value = useContext(OnboardingActionsContext);
  if (!value) throw new Error('useOnboardingActions must be used inside OnboardingProvider');
  return value;
}
