import { describe, expect, it } from 'vitest';
import { type ChronicleEntry, mergeRemoteChronicleEntries } from './chronicle';

const entry = (isoDate: string, updatedAt: string, phase1 = 'x'): ChronicleEntry => ({
  isoDate,
  phase1,
  phase2: '',
  phase3: '',
  updatedAt,
});

describe('mergeRemoteChronicleEntries', () => {
  it('adds days missing on this phone', () => {
    const incoming = mergeRemoteChronicleEntries({}, [entry('2026-10-17', '2026-10-17T20:00:00Z')], new Set());
    expect(incoming.map((e) => e.isoDate)).toEqual(['2026-10-17']);
  });

  it('takes the server version only when it is newer, comparing instants not strings', () => {
    const local = { '2026-10-17': entry('2026-10-17', '2026-10-17T20:00:00.000Z', 'local') };
    // The same instant in the Postgres format is not newer, so local stays.
    expect(mergeRemoteChronicleEntries(local, [entry('2026-10-17', '2026-10-17T20:00:00+00:00')], new Set())).toEqual([]);
    expect(
      mergeRemoteChronicleEntries(local, [entry('2026-10-17', '2026-10-17T21:00:00+00:00', 'remote')], new Set())
    ).toHaveLength(1);
    expect(mergeRemoteChronicleEntries(local, [entry('2026-10-17', '2026-10-17T19:00:00Z')], new Set())).toEqual([]);
  });

  it('never overwrites a day with an edit still waiting to upload', () => {
    const local = { '2026-10-17': entry('2026-10-17', '2026-10-17T20:00:00Z', 'pending edit') };
    const incoming = mergeRemoteChronicleEntries(
      local,
      [entry('2026-10-17', '2026-10-18T09:00:00Z', 'remote')],
      new Set(['2026-10-17'])
    );
    expect(incoming).toEqual([]);
  });
});
