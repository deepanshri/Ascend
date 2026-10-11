import { describe, expect, it } from 'vitest';
import { decideClaim } from './dataOwner';

describe('decideClaim', () => {
  it('keeps data owned by the same user', () => {
    expect(decideClaim('user-a', 'user-a', true, false)).toBe('keep');
  });

  it('purges data owned by a different user, whatever else is true', () => {
    expect(decideClaim('user-a', 'user-b', true, false)).toBe('purge');
    expect(decideClaim('user-a', 'user-b', true, true)).toBe('purge');
    expect(decideClaim('user-a', 'user-b', false, true)).toBe('purge');
  });

  it('adopts an empty device', () => {
    expect(decideClaim(null, 'user-b', false, false)).toBe('adopt');
  });

  it('purges unowned leftover data on a fresh sign-in', () => {
    expect(decideClaim(null, 'user-b', true, false)).toBe('purge');
  });

  it('adopts unowned data when the caller knows it is this user (restored session)', () => {
    expect(decideClaim(null, 'user-a', true, true)).toBe('adopt');
  });
});
