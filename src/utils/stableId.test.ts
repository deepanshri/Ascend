import { describe, expect, it } from 'vitest';
import { stableMomentumEventId, stableUuid } from './stableId';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('stableUuid', () => {
  it('reproduces existing habit-log ids exactly (recorded before the refactor)', () => {
    expect(stableUuid('habit-1:2026-10-11')).toBe('207db405-f9e3-461c-aac0-92e35a4d0ac4');
    expect(stableUuid('0a1b2c3d-0000-4000-8000-000000000001:2026-01-01')).toBe('12855def-0d96-45fb-af6a-e6ed77677968');
    expect(stableUuid('x:1999-12-31')).toBe('4d1ddbd7-1fc8-4df0-a9e5-027da0800606');
  });

  it('is deterministic and valid for the uuid columns', () => {
    expect(stableUuid('seed')).toBe(stableUuid('seed'));
    for (const seed of ['', 'a', 'momentum:x:2026-01-01:full', 'ü∂ƒ']) expect(stableUuid(seed)).toMatch(UUID_RE);
  });
});

describe('stableMomentumEventId', () => {
  it('differs by habit, day and type, and never equals the habit-log id', () => {
    const base = stableMomentumEventId('h', '2026-10-11', 'full');
    expect(stableMomentumEventId('h', '2026-10-11', 'full')).toBe(base);
    expect(new Set([
      base,
      stableMomentumEventId('h2', '2026-10-11', 'full'),
      stableMomentumEventId('h', '2026-10-12', 'full'),
      stableMomentumEventId('h', '2026-10-11', 'missed'),
      stableUuid('h:2026-10-11'),
    ]).size).toBe(5);
    expect(base).toMatch(UUID_RE);
  });
});
