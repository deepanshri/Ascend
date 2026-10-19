import React, { useEffect, useRef, useState } from 'react';
import { App as CapacitorApp } from '@capacitor/app';
import { AuthLinkProblemScreen, AuthLinkWorkingScreen, SetNewPasswordScreen } from '../components/AuthCallbackScreens';
import { useBackButton } from '../hooks/useBackButton';
import { useCompleteSignIn } from '../hooks/useCompleteSignIn';
import {
  AUTH_CALLBACK_FAILURE_COPY,
  type AuthCallbackFailure,
  callbackFingerprint,
  classifySetSessionError,
  parseAuthCallback,
} from '../lib/authCallback';
import { readStorage, writeStorage } from '../lib/storage';
import { authService } from '../lib/supabase';
import { useSession } from '../providers/SessionProvider';

const HANDLED_CALLBACK_KEY = 'ascend_handled_auth_callback';

type GateState =
  | { kind: 'idle' }
  | { kind: 'working' }
  | { kind: 'setPassword'; email: string }
  | { kind: 'failed'; reason: AuthCallbackFailure }
  | { kind: 'otherAccount'; email: string };

/**
 * Handles links from auth emails (ascend://auth/callback): signs the user in
 * after they confirm their email, and asks for a new password after a reset
 * link. Covers the app with its own screen while it does.
 */
export function AuthCallbackGate({ children }: { children: React.ReactNode }) {
  const { session } = useSession();
  const completeSignIn = useCompleteSignIn();
  const [state, setState] = useState<GateState>({ kind: 'idle' });

  const latest = useRef({ session, completeSignIn });
  latest.current = { session, completeSignIn };
  const inFlight = useRef(new Set<string>());

  useEffect(() => {
    let cancelled = false;

    const handle = async (url: string | undefined) => {
      const callback = parseAuthCallback(url);
      if (!url || !callback) return;
      const fingerprint = callbackFingerprint(url);
      // Android can deliver the same link again (launch URL plus appUrlOpen, or a restored process).
      if (inFlight.current.has(fingerprint) || readStorage(HANDLED_CALLBACK_KEY) === fingerprint) return;
      inFlight.current.add(fingerprint);
      const markHandled = () => writeStorage(HANDLED_CALLBACK_KEY, fingerprint);

      try {
        if (callback.kind === 'error') {
          markHandled();
          if (!cancelled) setState({ kind: 'failed', reason: callback.reason });
          return;
        }

        const current = latest.current.session;
        if (current && current.id !== callback.userId) {
          // Signing in someone else would purge this user's local data. Not marked handled,
          // so the same link still works after signing out.
          if (!cancelled) setState({ kind: 'otherAccount', email: current.email });
          return;
        }

        if (!cancelled) setState({ kind: 'working' });
        let result: Awaited<ReturnType<typeof authService.signInFromCallback>>;
        try {
          result = await authService.signInFromCallback(callback.accessToken, callback.refreshToken);
        } catch (err) {
          const reason = classifySetSessionError(err instanceof Error ? err.message : String(err));
          // Offline: the link is still good, so opening it again should retry.
          if (reason !== 'offline') markHandled();
          if (!cancelled) setState({ kind: 'failed', reason });
          return;
        }
        markHandled();
        if (cancelled) return;
        // Already signed in as this user (e.g. a reset link opened while signed in): nothing to set up.
        if (!current) {
          latest.current.completeSignIn(result.session, callback.type === 'signup', result.interests);
        }
        setState(
          callback.type === 'recovery' ? { kind: 'setPassword', email: result.session.email } : { kind: 'idle' }
        );
      } finally {
        inFlight.current.delete(fingerprint);
      }
    };

    void CapacitorApp.getLaunchUrl()
      .then((launch) => handle(launch?.url))
      .catch(() => {});
    const appUrlSub = CapacitorApp.addListener('appUrlOpen', (data) => void handle(data?.url));

    return () => {
      cancelled = true;
      void Promise.resolve(appUrlSub)
        .then((sub) => sub.remove())
        .catch(() => {});
    };
  }, []);

  const dismiss = () => setState({ kind: 'idle' });

  if (state.kind === 'idle') return <>{children}</>;
  return <AuthCallbackScreen state={state} signedIn={Boolean(session)} onDismiss={dismiss} />;
}

function AuthCallbackScreen({
  state,
  signedIn,
  onDismiss,
}: {
  state: Exclude<GateState, { kind: 'idle' }>;
  signedIn: boolean;
  onDismiss: () => void;
}) {
  // Mounted only while a screen is up, so the app's own back handling is untouched otherwise.
  useBackButton(() => {
    if (state.kind !== 'working') onDismiss();
  });

  if (state.kind === 'working') return <AuthLinkWorkingScreen />;
  if (state.kind === 'setPassword') return <SetNewPasswordScreen email={state.email} onDone={onDismiss} />;
  if (state.kind === 'otherAccount') {
    return (
      <AuthLinkProblemScreen
        title="This link is for another account"
        body={`You're signed in as ${state.email}. To use this link, sign out in Settings, then open the link from the email again.`}
        actionLabel="Continue"
        onAction={onDismiss}
      />
    );
  }
  const copy = AUTH_CALLBACK_FAILURE_COPY[state.reason];
  return (
    <AuthLinkProblemScreen
      title={copy.title}
      body={copy.body}
      actionLabel={signedIn ? 'Continue' : 'Back to Sign In'}
      onAction={onDismiss}
    />
  );
}
