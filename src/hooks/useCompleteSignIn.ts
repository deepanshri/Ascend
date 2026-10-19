import { useCallback } from 'react';
import type { UserSession } from '../types';
import { purgeSeedHabitsFromTable } from '../lib/habitsApi';
import { persistUserProfile } from '../lib/profile';
import { useLedgerActions } from '../providers/HabitLedgerProvider';
import { useOnboardingActions } from '../providers/OnboardingProvider';
import { usePreferencesActions } from '../providers/PreferencesProvider';
import { useSessionActions } from '../providers/SessionProvider';
import { useUIActions } from '../providers/UIProvider';

export type CompleteSignIn = (session: UserSession, isNewUser?: boolean, interests?: string[]) => void;

/** Everything that follows a successful sign-in or sign-up, from the form or an email link. */
export function useCompleteSignIn(): CompleteSignIn {
  const { signIn } = useSessionActions();
  const { setTab } = useUIActions();
  const { setSelectedInterests } = usePreferencesActions();
  const { startAuth } = useLedgerActions();
  const { startAsNewUser, startAsReturningUser } = useOnboardingActions();

  return useCallback(
    (session: UserSession, isNewUser?: boolean, interests?: string[]) => {
      signIn(session);
      setTab('home');
      if (interests && interests.length > 0) {
        setSelectedInterests(interests);
        if (!session.isGuest) {
          void persistUserProfile(session, { interests, has_completed_tutorial: false }).catch(() => {});
        }
      }
      if (!session.isGuest) void purgeSeedHabitsFromTable(session.id).catch(() => {});
      // A new account starts empty (a new guest keeps local work); demo habits never carry over.
      startAuth(Boolean(isNewUser) && !session.isGuest);
      if (isNewUser) startAsNewUser();
      else startAsReturningUser();
    },
    [signIn, setTab, setSelectedInterests, startAuth, startAsNewUser, startAsReturningUser]
  );
}
