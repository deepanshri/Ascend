import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { UserSession } from '../types';
import { readStoredAvatarId } from '../data/avatars';
import { requestNotificationPermissions } from '../lib/notifications';
import { flushOfflineQueue, unsyncedItemCount } from '../lib/offlineSync';
import { runBeforeSignOutHooks } from '../lib/syncState';
import {
  authService,
  generateAvatarUrl,
  getStoredSession,
  isSupabaseConfigured,
  setOnboardingCompleted,
  setStoredSession,
  supabase,
} from '../lib/supabase';
import { claimLocalUserData, purgeLocalUserData } from '../lib/userData';

/** How long sign-out waits for queued offline writes to reach Supabase. */
const SIGN_OUT_FLUSH_TIMEOUT_MS = 4000;

/**
 * Signing out purges local user data. While writes are still unsynced that
 * purge would destroy them, so sign-out stops and reports how many are left;
 * only an explicit `discardUnsynced` goes ahead anyway.
 */
export type SignOutResult = { signedOut: true } | { signedOut: false; unsynced: number };

interface SessionState {
  session: UserSession | null;
  authLoading: boolean;
}

interface SessionActions {
  /** Make `session` the signed-in user (after the sign-in / sign-up form). */
  signIn: (session: UserSession) => void;
  /**
   * Push queued writes, then sign out, purge local user data and reset every
   * user-scoped provider. Stops without signing out while writes are still
   * unsynced, unless `discardUnsynced` is set.
   */
  signOut: (options?: { discardUnsynced?: boolean }) => Promise<SignOutResult>;
  /** Delete the account remotely, then purge and reset as on sign-out. Returns an error message on failure. */
  deleteAccount: () => Promise<string | null>;
  setSyncStatus: (status: UserSession['syncStatus']) => void;
  updateAvatar: (avatarUrl: string) => void;
  updateName: (name: string) => void;
}

type ResetHandler = () => void;

const SessionStateContext = createContext<SessionState | null>(null);
const SessionActionsContext = createContext<SessionActions | null>(null);
const ResetRegistryContext = createContext<{ add: (handler: ResetHandler) => () => void } | null>(null);

function sessionFromUser(user: {
  id: string;
  email?: string | null;
  created_at?: string;
  user_metadata?: Record<string, unknown>;
}): UserSession {
  return {
    id: user.id,
    email: user.email || '',
    name: String(user.user_metadata?.full_name || user.email?.split('@')[0] || 'Ascender'),
    avatarUrl: readStoredAvatarId(String(user.user_metadata?.avatar_url || generateAvatarUrl(user.email || 'User'))),
    isGuest: false,
    memberSince: new Date(user.created_at || Date.now()).toLocaleDateString('en-US', {
      month: 'short',
      year: 'numeric',
    }),
    syncStatus: 'syncing',
  };
}

/**
 * The stored session, if any. Runs before any provider below reads storage:
 * a session restored for a different user than the one who owns the local
 * data purges that data first.
 */
function restoreStoredSession(): UserSession | null {
  const stored = getStoredSession();
  // Guest sessions are retired — require real auth before Home.
  if (stored?.isGuest || stored?.id?.startsWith('guest_')) {
    setStoredSession(null);
    return null;
  }
  if (!stored) return null;
  if (claimLocalUserData(stored.id, { adoptUnowned: true })) {
    // The purge cleared the previous user's onboarding flag; this user already has a session.
    setOnboardingCompleted(true);
  }
  return { ...stored, syncStatus: stored.syncStatus === 'error' ? 'error' : 'syncing' };
}

async function deleteIndexedDbDatabases(): Promise<void> {
  try {
    const databases = await indexedDB.databases();
    for (const db of databases) {
      if (db.name) indexedDB.deleteDatabase(db.name);
    }
  } catch {
    // indexedDB.databases() is not available everywhere.
  }
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<UserSession | null>(restoreStoredSession);
  const [authLoading, setAuthLoading] = useState(() => !getStoredSession() && isSupabaseConfigured);
  const sessionRef = useRef(session);
  sessionRef.current = session;
  /** The post-login OS permission dialog fires at most once per app session. */
  const requestedPermissionsRef = useRef(false);
  const resetHandlersRef = useRef(new Set<ResetHandler>());

  const resetRegistry = useMemo(
    () => ({
      add(handler: ResetHandler) {
        resetHandlersRef.current.add(handler);
        return () => {
          resetHandlersRef.current.delete(handler);
        };
      },
    }),
    []
  );

  /** RESET_ALL for every user-scoped provider. Call in the same tick as the session change. */
  const resetUserState = useCallback(() => {
    for (const handler of resetHandlersRef.current) {
      try {
        handler();
      } catch (err) {
        console.error('Resetting user state failed:', err);
      }
    }
  }, []);

  const establish = useCallback(
    (next: UserSession) => {
      // A different user's local data is purged and reset before this user can sync.
      if (claimLocalUserData(next.id)) resetUserState();
      setSession(next);
      setStoredSession(next);
      if (!requestedPermissionsRef.current) {
        requestedPermissionsRef.current = true;
        void requestNotificationPermissions();
      }
    },
    [resetUserState]
  );

  const clearSession = useCallback(() => {
    purgeLocalUserData();
    resetUserState();
    setSession(null);
    setStoredSession(null);
  }, [resetUserState]);

  // Restore the Supabase session and follow auth changes.
  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return;

    void authService
      .restoreExistingSession()
      .then((result) => {
        if (result && result !== 'pending') establish(result);
        else if (!result) {
          setSession(null);
          setStoredSession(null);
        }
        setAuthLoading(false);
      })
      .catch((err) => {
        console.warn('Auth restore offline:', err);
        setAuthLoading(false);
      });

    const { data: authListener } = supabase.auth.onAuthStateChange((event, supabaseSession) => {
      if (supabaseSession?.user) {
        establish(sessionFromUser(supabaseSession.user));
        return;
      }
      if (event === 'SIGNED_OUT') {
        // Data stays until someone signs in: the same user keeps it, anyone else triggers a purge.
        setSession(null);
        setStoredSession(null);
        setAuthLoading(false);
      }
    });

    return () => {
      authListener?.subscription?.unsubscribe();
    };
  }, [establish]);

  const signOut = useCallback(
    async ({ discardUnsynced = false }: { discardUnsynced?: boolean } = {}): Promise<SignOutResult> => {
      // Guests never sync: their data is local by design and goes with them.
      if (sessionRef.current && !sessionRef.current.isGuest) {
        // Give held-back and queued writes a chance to reach Supabase while still authenticated.
        await Promise.race([
          (async () => {
            await runBeforeSignOutHooks();
            await flushOfflineQueue();
          })().catch(() => {}),
          new Promise((resolve) => setTimeout(resolve, SIGN_OUT_FLUSH_TIMEOUT_MS)),
        ]);
        const unsynced = unsyncedItemCount();
        if (unsynced > 0 && !discardUnsynced) return { signedOut: false, unsynced };
      }
      await authService.signOut();
      clearSession();
      return { signedOut: true };
    },
    [clearSession]
  );

  const deleteAccount = useCallback(async () => {
    const current = sessionRef.current;
    if (!current) return 'Not signed in';
    try {
      const err = await authService.deleteAccount(current.id);
      if (err) return err;
    } catch (err) {
      return err instanceof Error ? err.message : 'Account deletion failed';
    }
    clearSession();
    void deleteIndexedDbDatabases();
    return null;
  }, [clearSession]);

  const updateSession = useCallback((patch: Partial<UserSession>) => {
    setSession((prev) => {
      if (!prev) return prev;
      const next = { ...prev, ...patch };
      setStoredSession(next);
      return next;
    });
  }, []);

  const actions = useMemo<SessionActions>(
    () => ({
      signIn: establish,
      signOut,
      deleteAccount,
      setSyncStatus: (syncStatus) => updateSession({ syncStatus }),
      updateAvatar: (avatarUrl) => updateSession({ avatarUrl }),
      updateName: (name) => updateSession({ name }),
    }),
    [establish, signOut, deleteAccount, updateSession]
  );

  const state = useMemo(() => ({ session, authLoading }), [session, authLoading]);

  return (
    <ResetRegistryContext.Provider value={resetRegistry}>
      <SessionActionsContext.Provider value={actions}>
        <SessionStateContext.Provider value={state}>{children}</SessionStateContext.Provider>
      </SessionActionsContext.Provider>
    </ResetRegistryContext.Provider>
  );
}

export function useSession(): SessionState {
  const value = useContext(SessionStateContext);
  if (!value) throw new Error('useSession must be used inside SessionProvider');
  return value;
}

export function useSessionActions(): SessionActions {
  const value = useContext(SessionActionsContext);
  if (!value) throw new Error('useSessionActions must be used inside SessionProvider');
  return value;
}

/**
 * Register a user-scoped provider's RESET_ALL. It runs when the signed-in
 * user signs out, deletes the account, or is replaced by a different user.
 */
export function useUserDataReset(reset: ResetHandler): void {
  const registry = useContext(ResetRegistryContext);
  const resetRef = useRef(reset);
  resetRef.current = reset;
  useEffect(() => {
    if (!registry) return;
    return registry.add(() => resetRef.current());
  }, [registry]);
}
