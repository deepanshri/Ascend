import { HabitCompletionEvent, IdentityEvidence, MomentumEvent } from '../types';
import { formatEvidenceDate, resolveEventIsoDate } from '../utils/dates';
import { countIdentityVotes, filterReversedMomentumEvents, resolveMomentumEventDate } from '../utils/momentum';

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

/**
 * Identity Ledger tally: one vote per habit per calendar day among remaining
 * habits, plus manual ledger entries. Deleted habits are excluded. Unchecking
 * a card does not mint extra rows into this count.
 */
export function displayedIdentityVoteCount(
  momentumEvents: MomentumEvent[],
  evidenceList: IdentityEvidence[],
  activeHabitIds?: Iterable<string>
): number {
  const manuals = evidenceList.filter((item) => item.habitId === 'manual').length;
  return countIdentityVotes(momentumEvents, activeHabitIds) + manuals;
}

export function hasMomentumVoteOnIso(
  events: MomentumEvent[],
  habitId: string,
  isoDate: string
): boolean {
  const active = filterReversedMomentumEvents(events);
  return active.some((event) => {
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
