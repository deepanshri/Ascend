import { describe, expect, it } from 'vitest';
import type { MomentumEvent } from '../types';
import { isLegacyMomentumId, remapLegacyMomentumIds, remapLegacyMomentumIdsBy } from './momentumIds';
import { stableMomentumEventId } from './stableId';

const ev = (id: string, fields: Partial<MomentumEvent> = {}) =>
  ({ id, habitId: 'h1', eventType: 'full', weight: 1, loggedDate: '2026-10-11', timestamp: 0, ...fields }) as MomentumEvent;

describe('remapLegacyMomentumIds', () => {
  it('maps legacy ids to the stable id createMomentumEvent now uses', () => {
    const { events, remapped, dropped } = remapLegacyMomentumIds([ev('evt_h1_2026-10-11_full')]);
    expect(events[0].id).toBe(stableMomentumEventId('h1', '2026-10-11', 'full'));
    expect([remapped, dropped]).toEqual([1, 0]);
  });

  it('keeps UUID ids and all other fields untouched', () => {
    const uuid = ev('feedface-0000-4000-8000-000000000001', { weight: 1.5 });
    const legacy = ev('evt_h1_2026-10-12_missed', { loggedDate: '2026-10-12', eventType: 'missed', weight: 0.7 });
    const { events } = remapLegacyMomentumIds([uuid, legacy]);
    expect(events[0]).toBe(uuid);
    expect(events[1]).toEqual({ ...legacy, id: stableMomentumEventId('h1', '2026-10-12', 'missed') });
  });

  it('collapses a legacy event and its already-remapped twin, keeping the first', () => {
    const stable = ev(stableMomentumEventId('h1', '2026-10-11', 'full'), { weight: 2 });
    const { events, dropped } = remapLegacyMomentumIds([stable, ev('evt_h1_2026-10-11_full')]);
    expect(events).toEqual([stable]);
    expect(dropped).toBe(1);
  });

  it('falls back to the timestamp day when loggedDate is missing', () => {
    const ts = new Date(2026, 9, 11, 12).getTime();
    const { events } = remapLegacyMomentumIds([ev('evt_x', { loggedDate: undefined, timestamp: ts })]);
    expect(events[0].id).toBe(stableMomentumEventId('h1', '2026-10-11', 'full'));
  });

  it('returns the same array when there is nothing to remap, and is idempotent', () => {
    const list = [ev(stableMomentumEventId('h1', '2026-10-11', 'full'))];
    expect(remapLegacyMomentumIds(list).events).toBe(list);
    const once = remapLegacyMomentumIds([ev('evt_a'), ev('evt_b', { habitId: 'h2' })]).events;
    expect(remapLegacyMomentumIds(once).events).toBe(once);
  });

  it('recognises legacy ids only', () => {
    expect(isLegacyMomentumId('evt_h_2026-01-01_full')).toBe(true);
    expect(isLegacyMomentumId('feedface-0000-4000-8000-000000000001')).toBe(false);
    expect(isLegacyMomentumId(undefined)).toBe(false);
  });
});

describe('remapLegacyMomentumIdsBy', () => {
  it('remaps wrapped events and keeps the wrapper fields', () => {
    const event = { id: 'evt_h1_2026-10-11_full', habitId: 'h1', eventType: 'full', weight: 1, loggedDate: '2026-10-11', timestamp: 0 } as unknown as MomentumEvent;
    const { items, remapped } = remapLegacyMomentumIdsBy(
      [{ userId: 'u1', event }],
      (item) => item.event,
      (item, next) => ({ ...item, event: next })
    );
    expect(remapped).toBe(1);
    expect(items[0].userId).toBe('u1');
    expect(items[0].event.id).toBe(stableMomentumEventId('h1', '2026-10-11', 'full'));
  });
});
