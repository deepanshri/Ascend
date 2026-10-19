import { describe, expect, it } from 'vitest';
import { callbackFingerprint, classifySetSessionError, parseAuthCallback, userIdFromAccessToken } from './authCallback';

const b64url = (value: object) =>
  btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const jwt = (sub: string) => `${b64url({ alg: 'HS256' })}.${b64url({ sub, exp: 1 })}.sig`;
const USER = '6f1c2a4e-1b2c-4d3e-8f9a-0b1c2d3e4f5a';

describe('parseAuthCallback', () => {
  it('reads tokens and type from a recovery or sign-up link', () => {
    const token = jwt(USER);
    expect(
      parseAuthCallback(`ascend://auth/callback#access_token=${token}&expires_in=3600&refresh_token=r1&token_type=bearer&type=recovery`)
    ).toEqual({ kind: 'session', accessToken: token, refreshToken: 'r1', type: 'recovery', userId: USER });
    expect(parseAuthCallback(`ascend://auth/callback#access_token=${token}&refresh_token=r1&type=signup`)).toMatchObject({
      kind: 'session',
      type: 'signup',
    });
    expect(parseAuthCallback(`ascend://auth/callback#access_token=${token}&refresh_token=r1&type=magiclink`)).toMatchObject({
      type: 'other',
    });
  });

  it('reports an expired or already-used link', () => {
    expect(
      parseAuthCallback(
        'ascend://auth/callback#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired'
      )
    ).toEqual({ kind: 'error', reason: 'expired' });
    expect(parseAuthCallback('ascend://auth/callback?error=access_denied&error_code=otp_expired')).toEqual({
      kind: 'error',
      reason: 'expired',
    });
  });

  it('reports a callback with missing or unreadable tokens as malformed', () => {
    expect(parseAuthCallback('ascend://auth/callback')).toEqual({ kind: 'error', reason: 'malformed' });
    expect(parseAuthCallback('ascend://auth/callback#access_token=abc&refresh_token=r1')).toEqual({
      kind: 'error',
      reason: 'malformed',
    });
    expect(parseAuthCallback(`ascend://auth/callback#access_token=${jwt(USER)}`)).toEqual({
      kind: 'error',
      reason: 'malformed',
    });
  });

  it('ignores links that are not auth callbacks', () => {
    expect(parseAuthCallback('ascend://widget/report')).toBeNull();
    expect(parseAuthCallback('ascend://auth/callbackx#access_token=a')).toBeNull();
    expect(parseAuthCallback('https://example.com/auth/callback#access_token=a')).toBeNull();
    expect(parseAuthCallback(undefined)).toBeNull();
  });
});

describe('userIdFromAccessToken', () => {
  it('reads sub and rejects garbage', () => {
    expect(userIdFromAccessToken(jwt(USER))).toBe(USER);
    expect(userIdFromAccessToken('not-a-jwt')).toBeNull();
    expect(userIdFromAccessToken('a.!!!.c')).toBeNull();
  });
});

describe('classifySetSessionError', () => {
  it('separates connection problems from spent tokens', () => {
    expect(classifySetSessionError('Failed to fetch')).toBe('offline');
    expect(classifySetSessionError('Invalid Refresh Token: Already Used')).toBe('expired');
  });
});

describe('callbackFingerprint', () => {
  it('is stable per URL and differs between URLs', () => {
    expect(callbackFingerprint('ascend://auth/callback#a')).toBe(callbackFingerprint('ascend://auth/callback#a'));
    expect(callbackFingerprint('ascend://auth/callback#a')).not.toBe(callbackFingerprint('ascend://auth/callback#b'));
  });
});
