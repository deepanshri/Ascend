/**
 * Links in Supabase auth emails (confirm sign-up, reset password) redirect to
 * AUTH_CALLBACK_URL. Supabase appends the result to the fragment:
 *   success: #access_token=…&refresh_token=…&type=signup|recovery|…
 *   failure: #error=access_denied&error_code=otp_expired&error_description=…
 * Pure: parses and classifies; the caller sets the session.
 */

export const AUTH_CALLBACK_URL = 'ascend://auth/callback';

/** 'recovery' means the user came from a reset-password email. */
export type AuthCallbackType = 'signup' | 'recovery' | 'other';

export type AuthCallbackFailure = 'expired' | 'malformed' | 'offline';

export type AuthCallback =
  | { kind: 'session'; accessToken: string; refreshToken: string; type: AuthCallbackType; userId: string }
  | { kind: 'error'; reason: AuthCallbackFailure };

const CALLBACK_PREFIX = /^ascend:\/\/auth\/callback(?:[/?#]|$)/i;

function callbackType(raw: string | null): AuthCallbackType {
  if (raw === 'recovery') return 'recovery';
  if (raw === 'signup' || raw === 'email') return 'signup';
  return 'other';
}

/** The JWT's `sub`, unverified. Used only to compare against the signed-in user. */
export function userIdFromAccessToken(token: string): string | null {
  const payload = token.split('.')[1];
  if (!payload) return null;
  try {
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const json = JSON.parse(atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4))) as { sub?: unknown };
    return typeof json.sub === 'string' && json.sub ? json.sub : null;
  } catch {
    return null;
  }
}

/** null when `url` isn't an auth callback at all (e.g. a widget link). */
export function parseAuthCallback(url?: string | null): AuthCallback | null {
  if (!url || !CALLBACK_PREFIX.test(url.trim())) return null;
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return { kind: 'error', reason: 'malformed' };
  }
  // Supabase puts results in the fragment; errors can also arrive in the query string.
  const fragment = new URLSearchParams(parsed.hash.replace(/^#/, ''));
  const read = (key: string) => fragment.get(key) || parsed.searchParams.get(key);

  if (read('error') || read('error_code')) {
    const code = `${read('error_code') ?? ''} ${read('error_description') ?? ''}`.toLowerCase();
    // otp_expired covers both an expired link and one that was already used.
    const looksExpired = code.includes('expired') || code.includes('invalid') || read('error') === 'access_denied';
    return { kind: 'error', reason: looksExpired ? 'expired' : 'malformed' };
  }

  const accessToken = read('access_token');
  const refreshToken = read('refresh_token');
  const userId = accessToken ? userIdFromAccessToken(accessToken) : null;
  if (!accessToken || !refreshToken || !userId) return { kind: 'error', reason: 'malformed' };
  return { kind: 'session', accessToken, refreshToken, type: callbackType(read('type')), userId };
}

/** Classify a failed `setSession` with tokens from the link. */
export function classifySetSessionError(message: string): AuthCallbackFailure {
  const text = message.toLowerCase();
  if (text.includes('fetch') || text.includes('network') || text.includes('timeout') || text.includes('offline')) {
    return 'offline';
  }
  return 'expired';
}

export const AUTH_CALLBACK_FAILURE_COPY: Record<AuthCallbackFailure, { title: string; body: string }> = {
  expired: {
    title: 'This link has expired',
    body: 'It may be too old or already used. To reset your password, go to Sign In → Forgot password and request a new link. If you were confirming your email, try signing in. It may already be confirmed.',
  },
  malformed: {
    title: "This link didn't work",
    body: 'It looks incomplete. Open the link from the email again, or request a new one from Sign In → Forgot password.',
  },
  offline: {
    title: "Couldn't reach Ascend",
    body: 'Check your connection, then open the link from the email again.',
  },
};

/**
 * A short fingerprint of a handled callback URL, so a link Android delivers
 * again (process restore, re-launch) isn't spent twice and reported as expired.
 */
export function callbackFingerprint(url: string): string {
  let hash = 0;
  for (let i = 0; i < url.length; i += 1) hash = (Math.imul(31, hash) + url.charCodeAt(i)) | 0;
  return `${url.length}:${(hash >>> 0).toString(36)}`;
}
