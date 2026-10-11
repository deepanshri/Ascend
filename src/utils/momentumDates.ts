import type { MomentumEvent } from '../types';
import { parseToIsoDate, toISODate } from './dates';

/** The calendar day a momentum event counts for: its logged date, else its timestamp's local day. */
export function resolveMomentumEventDate(event: Pick<MomentumEvent, 'loggedDate' | 'timestamp'>): string {
  if (event.loggedDate && parseToIsoDate(event.loggedDate)) {
    return parseToIsoDate(event.loggedDate) as string;
  }
  return toISODate(new Date(event.timestamp));
}
