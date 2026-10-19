/**
 * One-time remap of legacy momentum event ids (`evt_<habit>_<date>_<type>`),
 * which every upload path rejected because they are not UUIDs, to the stable
 * UUIDs createMomentumEvent now produces for the same habit, day and type.
 */
import type { MomentumEvent } from '../types';
import { parseToIsoDate } from './dates';
import { resolveMomentumEventDate } from './momentumDates';
import { stableMomentumEventId, stableUuid } from './stableId';

export function isLegacyMomentumId(id: unknown): boolean {
  return typeof id === 'string' && id.startsWith('evt_');
}

function stableIdFor(event: Pick<MomentumEvent, 'habitId' | 'eventType' | 'loggedDate' | 'timestamp'>): string {
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

/** Ids carry up to this many repeats of one habit, day and type. */
const MAX_OCCURRENCE = 0xff;

/**
 * Id for the nth (n >= 1) event of one habit, day and type, e.g. the second
 * "full" after complete, undo, complete. The first keeps stableMomentumEventId,
 * so existing rows are unchanged. Version 8 (custom) marks these ids, and the
 * last two hex digits hold n, so momentumOccurrence can read it back without
 * rehashing. Random and stable ids are version 4, so they never look like one.
 */
export function occurrenceMomentumEventId(habitId: string, loggedDate: string, eventType: string, n: number): string {
  const occurrence = Math.min(Math.max(1, Math.floor(n)), MAX_OCCURRENCE);
  const base = stableUuid(`momentum:${habitId}:${loggedDate}:${eventType}#${occurrence}`);
  return `${base.slice(0, 14)}8${base.slice(15, 34)}${occurrence.toString(16).padStart(2, '0')}`;
}

/** 0 for the first event of a habit, day and type (or any other id); n for occurrence ids. */
export function momentumOccurrence(id: string): number {
  if (id.length !== 36 || id[14] !== '8') return 0;
  const n = parseInt(id.slice(34), 16);
  return Number.isFinite(n) ? n : 0;
}
