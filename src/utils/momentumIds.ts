/**
 * One-time remap of legacy momentum event ids (`evt_<habit>_<date>_<type>`),
 * which every upload path rejected because they are not UUIDs, to the stable
 * UUIDs createMomentumEvent now produces for the same habit, day and type.
 */
import type { MomentumEvent } from '../types';
import { parseToIsoDate } from './dates';
import { resolveMomentumEventDate } from './momentumDates';
import { stableMomentumEventId } from './stableId';

export function isLegacyMomentumId(id: unknown): boolean {
  return typeof id === 'string' && id.startsWith('evt_');
}

export function stableIdFor(event: Pick<MomentumEvent, 'habitId' | 'eventType' | 'loggedDate' | 'timestamp'>): string {
  const day = (event.loggedDate && parseToIsoDate(event.loggedDate)) || resolveMomentumEventDate(event);
  return stableMomentumEventId(event.habitId, day, event.eventType);
}

/**
 * Give legacy events their stable id and drop duplicates that now share one
 * (first occurrence wins, order kept). `eventOf`/`withEvent` let callers remap
 * wrapped events (e.g. offline queue items) without losing their other fields.
 * Returns the input array unchanged when there is nothing to do.
 */
export function remapLegacyMomentumIdsBy<T>(
  items: T[],
  eventOf: (item: T) => MomentumEvent,
  withEvent: (item: T, event: MomentumEvent) => T
): { items: T[]; remapped: number; dropped: number } {
  let remapped = 0;
  let dropped = 0;
  const seen = new Set<string>();
  const next: T[] = [];
  for (const item of items) {
    const event = eventOf(item);
    const legacy = isLegacyMomentumId(event.id);
    const id = legacy ? stableIdFor(event) : event.id;
    if (seen.has(id)) {
      dropped += 1;
      continue;
    }
    seen.add(id);
    if (legacy) remapped += 1;
    next.push(legacy ? withEvent(item, { ...event, id }) : item);
  }
  return remapped === 0 && dropped === 0 ? { items, remapped, dropped } : { items: next, remapped, dropped };
}

export function remapLegacyMomentumIds<T extends MomentumEvent>(
  events: T[]
): { events: T[]; remapped: number; dropped: number } {
  const { items, remapped, dropped } = remapLegacyMomentumIdsBy(events, (event) => event, (_, event) => event as T);
  return { events: items, remapped, dropped };
}
