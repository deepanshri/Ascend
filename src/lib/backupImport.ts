/**
 * Pure parsing of a JSON backup file (see SettingsView export). Every list
 * goes through the same entry rules as stored data; anything unreadable is
 * returned per section for the dead-letter store instead of aborting the
 * import.
 */
import type { Habit, HabitCompletionEvent, IdentityEvidence, MomentumEvent } from '../types';
import {
  parseCompletionEventList,
  parseEvidenceList,
  parseHabitList,
  parseMomentumEventList,
  type ParseResult,
  type RejectedEntry,
} from './ledgerStorage';

/** Dead-letter source for each backup section, e.g. `backup_import:habits`. */
export const backupSource = (section: string) => `backup_import:${section}`;

export interface RejectedSection {
  source: string;
  entries: RejectedEntry[];
}

export interface BackupContents {
  habits: Habit[];
  /** `undefined` when the section is absent or unreadable: keep the current data. */
  evidence?: IdentityEvidence[];
  completionEvents?: HabitCompletionEvent[];
  momentumEvents?: MomentumEvent[];
}

export type BackupParseResult =
  | { status: 'ok'; contents: BackupContents; rejected: RejectedSection[] }
  | { status: 'not_a_backup' | 'no_readable_habits'; rejected: RejectedSection[] };

export function rejectedCount(rejected: RejectedSection[]): number {
  return rejected.reduce((total, section) => total + section.entries.length, 0);
}

export function parseBackup(file: unknown): BackupParseResult {
  if (!file || typeof file !== 'object' || !Array.isArray((file as { habits?: unknown }).habits)) {
    return { status: 'not_a_backup', rejected: [] };
  }
  const backup = file as Record<string, unknown>;
  const rejected: RejectedSection[] = [];

  const take = <T>(section: string, result: ParseResult<T>): T[] | undefined => {
    if (result.rejected.length > 0) rejected.push({ source: backupSource(section), entries: result.rejected });
    return result.items ?? undefined;
  };
  const optional = <T>(section: string, parse: (value: unknown) => ParseResult<T>): T[] | undefined =>
    backup[section] === undefined ? undefined : take(section, parse(backup[section]));

  const habitsSection = backup.habits as unknown[];
  const habits = take('habits', parseHabitList(habitsSection)) ?? [];
  const contents: BackupContents = {
    habits,
    evidence: optional('evidenceLedger', parseEvidenceList),
    completionEvents: optional('completionEvents', parseCompletionEventList),
    momentumEvents: optional('momentumEvents', parseMomentumEventList),
  };

  // Never replace the user's habits with nothing because every entry was unreadable.
  if (habits.length === 0 && habitsSection.length > 0 && rejected.some((r) => r.source === backupSource('habits'))) {
    return { status: 'no_readable_habits', rejected };
  }
  return { status: 'ok', contents, rejected };
}
