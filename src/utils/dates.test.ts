import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { addDaysIso, diffDaysIso, getLocalDateString, localMidnightOf, msUntilNextLocalDay, timeZoneKey } from './dates';

const ZONES = [
  'America/New_York', // DST at 02:00
  'Europe/London',
  'America/Santiago', // DST starts at midnight: 00:00 does not exist that day
  'Australia/Lord_Howe', // 30-minute DST shift
  'Asia/Kolkata', // half-hour offset, no DST
  'Pacific/Chatham', // +12:45 / +13:45
];

/** Hourly instants across the given UTC ranges (around each zone's DST changes). */
function hourly(fromUtc: string, hours: number): Date[] {
  const start = Date.parse(fromUtc);
  return Array.from({ length: hours }, (_, i) => new Date(start + i * 3_600_000));
}
const SAMPLES = [
  ...hourly('2026-03-07T00:00:00Z', 72), // US spring forward
  ...hourly('2026-03-28T00:00:00Z', 72), // EU spring forward
  ...hourly('2026-04-03T00:00:00Z', 72), // Southern hemisphere fall back
  ...hourly('2026-09-04T00:00:00Z', 72), // Chile spring forward (midnight skipped)
  ...hourly('2026-10-03T00:00:00Z', 72), // Lord Howe / Chatham spring forward
  ...hourly('2026-10-24T00:00:00Z', 72), // EU fall back
  ...hourly('2026-10-31T00:00:00Z', 72), // US fall back
];

describe.each(ZONES)('in %s', (zone) => {
  const originalTz = process.env.TZ;
  beforeAll(() => {
    process.env.TZ = zone;
  });
  afterAll(() => {
    process.env.TZ = originalTz;
  });

  it('getLocalDateString is always strict YYYY-MM-DD and matches the local fields', () => {
    for (const date of SAMPLES) {
      const iso = getLocalDateString(date);
      expect(iso).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(iso).toBe(
        `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
      );
    }
  });

  it('msUntilNextLocalDay lands on the next calendar day and never fires early', () => {
    for (const now of SAMPLES) {
      const ms = msUntilNextLocalDay(now);
      const today = getLocalDateString(now);
      expect(getLocalDateString(new Date(now.getTime() + ms))).toBe(addDaysIso(today, 1));
      expect(getLocalDateString(new Date(now.getTime() + ms - 2000))).toBe(today);
    }
  });

  it('addDaysIso and diffDaysIso agree across DST changes', () => {
    for (const now of SAMPLES) {
      const iso = getLocalDateString(now);
      for (const n of [-3, -1, 1, 2, 7, 40]) {
        expect(diffDaysIso(iso, addDaysIso(iso, n))).toBe(n);
      }
    }
  });

  it('localMidnightOf returns the start of that local day', () => {
    for (const now of SAMPLES) {
      const iso = getLocalDateString(now);
      const midnight = localMidnightOf(iso)!;
      expect(getLocalDateString(midnight)).toBe(iso);
      expect(getLocalDateString(new Date(midnight.getTime() - 1))).toBe(addDaysIso(iso, -1));
    }
  });
});

describe('localMidnightOf', () => {
  it('rejects malformed dates', () => {
    expect(localMidnightOf('not-a-date')).toBeNull();
  });
});

describe('getLocalDateString', () => {
  it('falls back to now for an invalid Date', () => {
    expect(getLocalDateString(new Date('nope'))).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('timeZoneKey', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('combines the IANA zone and the UTC offset', () => {
    vi.spyOn(Intl, 'DateTimeFormat').mockReturnValue({
      resolvedOptions: () => ({ timeZone: 'Asia/Kolkata' }),
    } as Intl.DateTimeFormat);
    const date = new Date();
    vi.spyOn(date, 'getTimezoneOffset').mockReturnValue(-330);
    expect(timeZoneKey(date)).toBe('Asia/Kolkata|-330');
  });

  it('changes when the zone changes', () => {
    const date = new Date();
    const zone = vi.spyOn(Intl, 'DateTimeFormat');
    zone.mockReturnValue({ resolvedOptions: () => ({ timeZone: 'Asia/Kolkata' }) } as Intl.DateTimeFormat);
    const before = timeZoneKey(date);
    zone.mockReturnValue({ resolvedOptions: () => ({ timeZone: 'Europe/London' }) } as Intl.DateTimeFormat);
    expect(timeZoneKey(date)).not.toBe(before);
  });

  it('still reports the offset when Intl is unavailable', () => {
    vi.spyOn(Intl, 'DateTimeFormat').mockImplementation(() => {
      throw new Error('no Intl');
    });
    const date = new Date();
    vi.spyOn(date, 'getTimezoneOffset').mockReturnValue(60);
    expect(timeZoneKey(date)).toBe('|60');
  });
});
