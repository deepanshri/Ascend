import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef } from 'react';
import type { UserSession } from '../types';
import { persistHabitsToTable, persistMomentumHistory, syncAuthenticatedAccount } from '../lib/accountSync';
import { fetchFrictionReasonsFromTable } from '../lib/habitsApi';
import { loadStoredCompletionEventsOrNull } from '../lib/ledgerStorageLoaders';
import { fetchUserProfile, getLocalTutorialCompleted, resolveTutorialCompleted } from '../lib/profile';
import { destroyAscendSpotlightTutorial } from '../lib/tutorial';
import { persistStoredAvatarId, resolveAvatarId } from '../data/avatars';
import { useCalendar } from './CalendarProvider';
import { useLedger, useLedgerActions } from './HabitLedgerProvider';
import { useOnboarding, useOnboardingActions } from './OnboardingProvider';
import { usePreferences, usePreferencesActions } from './PreferencesProvider';
import { useSession, useSessionActions, useUserDataReset } from './SessionProvider';

interface AccountSyncActions {
  /** Sync the signed-in account now; throws with a readable message on failure. */
  syncNow: () => Promise<void>;
}

const AccountSyncContext = createContext<AccountSyncActions | null>(null);

/**
 * Keeps the signed-in account and the local ledger in step: hydrates the
 * profile and ledger after sign-in (once onboarding allows), re-syncs when a
 * new day starts, pushes habit and daily momentum changes, and merges stored
 * friction reasons. Renders no UI.
 */
export function AccountSyncController({ children }: { children: React.ReactNode }) {
  const { session } = useSession();
  const { setSyncStatus, updateAvatar } = useSessionActions();
  const { isOnboarded, onboardingStep, hasCompletedTutorial } = useOnboarding();
  const { setTutorialCompleted, setTutorialLocked } = useOnboardingActions();
  const { selectedInterests } = usePreferences();
  const { setSelectedInterests } = usePreferencesActions();
  const { habits, todayMomentumScore, refetchRequest } = useLedger();
  const ledger = useLedgerActions();
  const { todayDayIndex } = useCalendar();

  const sessionRef = useRef<UserSession | null>(session);
  sessionRef.current = session;
  const interestsRef = useRef(selectedInterests);
  interestsRef.current = selectedInterests;
  const tutorialRef = useRef(hasCompletedTutorial);
  tutorialRef.current = hasCompletedTutorial;
  const scoreRef = useRef(todayMomentumScore);
  scoreRef.current = todayMomentumScore;
  /** The user whose remote ledger has been merged in; pushes wait for it. */
  const hydratedUserIdRef = useRef<string | null>(null);
  /** Syncs running now; a day-change re-sync is redundant while one is in flight. */
  const syncsInFlightRef = useRef(0);
  /** Sync waits for onboarding to finish or reach its last step. */
  const syncAllowed = isOnboarded || onboardingStep >= 3;

  useUserDataReset(() => {
    hydratedUserIdRef.current = null;
  });

  const runAuthenticatedSync = useCallback(
    async (target: UserSession) => {
      if (target.isGuest) return { ok: false, error: 'Guest sessions stay local' };
      const snapshot = ledger.getSnapshot();
      syncsInFlightRef.current += 1;
      const result = await syncAuthenticatedAccount({
        session: target,
        habits: snapshot.habits,
        completionEvents: snapshot.completionEvents,
        momentumEvents: snapshot.momentumEvents,
        interests: interestsRef.current,
        hasCompletedTutorial: getLocalTutorialCompleted() || tutorialRef.current === true,
        momentumScore: scoreRef.current,
        getLatestHabits: () => ledger.getSnapshot().habits,
      }).finally(() => {
        syncsInFlightRef.current -= 1;
      });
      // The user signed out or switched while this ran: never apply their data to the next state.
      if (sessionRef.current?.id !== target.id) return result;
      ledger.applySync(result);
      if (result.ok) hydratedUserIdRef.current = target.id;
      setSyncStatus(result.ok ? 'synced' : 'error');
      return result;
    },
    [ledger, setSyncStatus]
  );

  // Profile: interests, avatar and tutorial flag from Supabase `profiles`.
  useEffect(() => {
    if (!session) {
      destroyAscendSpotlightTutorial();
      setTutorialCompleted(getLocalTutorialCompleted() ? true : null);
      setTutorialLocked(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      const profile = await fetchUserProfile(session, interestsRef.current);
      if (cancelled) return;
      if (profile.interests.length > 0) setSelectedInterests(profile.interests);
      if (profile.avatar_url) {
        const avatarUrl = resolveAvatarId(profile.avatar_url);
        persistStoredAvatarId(avatarUrl);
        updateAvatar(avatarUrl);
      }
      setTutorialCompleted(resolveTutorialCompleted(profile.has_completed_tutorial));
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.id, session?.isGuest]);

  // Sign-in hydrate: profiles, habits, habit_logs and momentum history.
  useEffect(() => {
    if (!session || session.isGuest) {
      hydratedUserIdRef.current = null;
      return;
    }
    if (!syncAllowed) return;
    let cancelled = false;
    setSyncStatus('syncing');
    runAuthenticatedSync(session)
      .then((result) => {
        if (!cancelled) setSyncStatus(result.ok ? 'synced' : 'error');
      })
      .catch(() => {
        if (!cancelled) setSyncStatus('error');
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.id, session?.isGuest, syncAllowed]);

  // A new day: re-fetch the ledger (signed in) or re-read the local log (guest).
  const handledRefetchRef = useRef(refetchRequest);
  useEffect(() => {
    if (refetchRequest === handledRefetchRef.current) return;
    handledRefetchRef.current = refetchRequest;
    const target = sessionRef.current;
    if (target && !target.isGuest) {
      // A sync already running (e.g. the sign-in hydrate at launch) merges into the latest ledger.
      if (syncsInFlightRef.current > 0) return;
      setSyncStatus('syncing');
      runAuthenticatedSync(target).catch((err) => {
        console.warn('Day-change sync failed:', err);
        setSyncStatus('error');
      });
    } else {
      const stored = loadStoredCompletionEventsOrNull();
      if (stored) ledger.loadCompletionEvents(stored);
    }
  }, [refetchRequest, runAuthenticatedSync, ledger, setSyncStatus]);

  // Push habit edits once the remote ledger has been merged in.
  useEffect(() => {
    if (!session || session.isGuest || hydratedUserIdRef.current !== session.id) return;
    persistHabitsToTable(session.id, habits)
      .then((ok) => {
        if (!ok) setSyncStatus('error');
      })
      .catch(() => setSyncStatus('error'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [habits, session?.id, session?.isGuest]);

  useEffect(() => {
    if (!session || session.isGuest || hydratedUserIdRef.current !== session.id) return;
    void persistMomentumHistory(session.id, todayMomentumScore, todayDayIndex).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todayMomentumScore, todayDayIndex, session?.id, session?.isGuest]);

  // Friction reasons stored on habit_logs.
  useEffect(() => {
    if (!session || session.isGuest || !syncAllowed) return;
    let cancelled = false;
    fetchFrictionReasonsFromTable(session.id)
      .then((rows) => {
        if (!cancelled && rows.length > 0) ledger.mergeFrictionReasons(rows);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.id, session?.isGuest, syncAllowed]);

  const syncNow = useCallback(async () => {
    const target = sessionRef.current;
    if (!target || target.isGuest) throw new Error('Please sign in to sync');
    const result = await runAuthenticatedSync(target);
    if (!result.ok) throw new Error(result.error || 'Sync failed');
  }, [runAuthenticatedSync]);

  const value = useMemo<AccountSyncActions>(() => ({ syncNow }), [syncNow]);
  return <AccountSyncContext.Provider value={value}>{children}</AccountSyncContext.Provider>;
}

export function useAccountSync(): AccountSyncActions {
  const value = useContext(AccountSyncContext);
  if (!value) throw new Error('useAccountSync must be used inside AccountSyncController');
  return value;
}
