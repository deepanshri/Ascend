import { HabitCompletionEvent, IdentityEvidence, MomentumEvent } from '../types';
import { formatEvidenceDate, resolveEventIsoDate } from '../utils/dates';
import { countIdentityVotes, resolveMomentumEventDate } from '../utils/momentum';

export function ledgerDayKey(habitId: string, isoDate: string): string {
  return `${habitId}::${isoDate}`;
}

export function isSameLedgerDay(
  event: Pick<HabitCompletionEvent, 'habitId' | 'date' | 'dayIndex' | 'timestamp'>,
  habitId: string,
  isoDate: string,
  origin: Date = new Date()
): boolean {
  return event.habitId === habitId && resolveEventIsoDate(event, origin) === isoDate;
}

/** True when this habit already has a completion row for the local calendar day. */
export function hasTodayLedgerEntry(
  events: HabitCompletionEvent[],
  habitId: string,
  isoDate: string,
  origin: Date = new Date()
): boolean {
  return events.some((event) => isSameLedgerDay(event, habitId, isoDate, origin));
}

export function uniqueTodayLedgerHabitIds(
  events: HabitCompletionEvent[],
  isoDate: string,
  origin: Date = new Date()
): string[] {
  const ids = new Set<string>();
  events.forEach((event) => {
    if (resolveEventIsoDate(event, origin) === isoDate) ids.add(event.habitId);
  });
  return [...ids];
}

/**
 * Daily unique completion days — used by the widget / card projection.
 * Identity Ledger totals do not use this; they count append-only momentum_events.
 */
export function uniqueLedgerVoteCount(events: HabitCompletionEvent[], origin: Date = new Date()): number {
  const keys = new Set<string>();
  events.forEach((event) => {
    const iso = resolveEventIsoDate(event, origin);
    if (!iso) return;
    keys.add(ledgerDayKey(event.habitId, iso));
  });
  return keys.size;
}

/**
 * Identity Ledger tally: COUNT of full/fallback rows in the immutable
 * momentum_events log, plus manual ledger entries. Unchecking a daily card
 * does not decrement this number.
 */
export function displayedIdentityVoteCount(
  momentumEvents: MomentumEvent[],
  evidenceList: IdentityEvidence[]
): number {
  const manuals = evidenceList.filter((item) => item.habitId === 'manual').length;
  return countIdentityVotes(momentumEvents) + manuals;
}

export function hasMomentumVoteOnIso(
  events: MomentumEvent[],
  habitId: string,
  isoDate: string
): boolean {
  return events.some((event) => {
    if (event.habitId !== habitId) return false;
    if (event.eventType !== 'full' && event.eventType !== 'fallback') return false;
    return resolveMomentumEventDate(event) === isoDate;
  });
}

export function isTodayEvidence(
  entry: IdentityEvidence,
  habitId: string,
  isoDate: string,
  origin: Date = new Date()
): boolean {
  if (entry.habitId !== habitId) return false;
  if (entry.loggedDate) return entry.loggedDate === isoDate;
  const stamp = formatEvidenceDate(origin);
  return entry.date.startsWith(stamp);
}

/** Replace any existing same-habit/same-day row so toggles cannot duplicate the list. */
export function upsertTodayEvidence(
  list: IdentityEvidence[],
  entry: IdentityEvidence,
  isoDate: string,
  origin: Date = new Date()
): IdentityEvidence[] {
  return [entry, ...list.filter((item) => !isTodayEvidence(item, entry.habitId, isoDate, origin))];
}

export function removeTodayEvidence(
  list: IdentityEvidence[],
  habitId: string,
  isoDate: string,
  origin: Date = new Date()
): IdentityEvidence[] {
  return list.filter((item) => !isTodayEvidence(item, habitId, isoDate, origin));
}

export function replaceTodayCompletion(
  events: HabitCompletionEvent[],
  next: HabitCompletionEvent,
  origin: Date = new Date()
): HabitCompletionEvent[] {
  const isoDate = resolveEventIsoDate(next, origin);
  return [...events.filter((event) => !isSameLedgerDay(event, next.habitId, isoDate, origin)), next];
}
