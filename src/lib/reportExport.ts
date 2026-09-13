import { Habit, HabitCompletionEvent, MomentumEvent } from '../types';
import { fetchHabitLogsForExport, type HabitLogExportRow } from './habitsApi';
import { fetchMomentumEventsFromTable } from './momentumEvents';
import { resolveMomentumEventDate } from '../utils/momentum';

function csvCell(value: unknown): string {
  const text = value == null ? '' : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function habitName(habits: Habit[], habitId: string): string {
  return habits.find((habit) => habit.id === habitId)?.name || '';
}

export async function buildReportCsv(options: {
  userId?: string | null;
  habits: Habit[];
  momentumEvents: MomentumEvent[];
  localLogs?: HabitCompletionEvent[];
}): Promise<string> {
  const { userId, habits, momentumEvents, localLogs = [] } = options;
  const isAuthed = Boolean(userId && !userId.startsWith('guest_'));

  const [remoteMomentum, remoteLogs] = await Promise.all([
    isAuthed ? fetchMomentumEventsFromTable(userId) : Promise.resolve([] as MomentumEvent[]),
    isAuthed ? fetchHabitLogsForExport(userId) : Promise.resolve([] as HabitLogExportRow[]),
  ]);

  const momentumById = new Map<string, MomentumEvent>();
  [...momentumEvents, ...remoteMomentum].forEach((event) => {
    if (event?.id) momentumById.set(event.id, event);
  });

  const headers = [
    'source',
    'id',
    'habit_id',
    'habit_name',
    'event_type',
    'weight',
    'logged_date',
    'timestamp',
    'friction_reason',
    'note',
  ];

  const rows: string[][] = [];

  Array.from(momentumById.values())
    .sort((a, b) => a.timestamp - b.timestamp)
    .forEach((event) => {
      rows.push([
        'momentum_events',
        event.id,
        event.habitId,
        habitName(habits, event.habitId),
        event.eventType,
        String(event.weight),
        resolveMomentumEventDate(event),
        new Date(event.timestamp).toISOString(),
        '',
        '',
      ]);
    });

  const logByKey = new Map<string, HabitLogExportRow>();
  remoteLogs.forEach((row) => {
    logByKey.set(`${row.habitId}|${row.loggedDate}|${row.id}`, row);
  });
  if (logByKey.size === 0) {
    localLogs.forEach((event) => {
      const id = event.id || `${event.habitId}-${event.date}`;
      logByKey.set(`${event.habitId}|${event.date}|${id}`, {
        id,
        habitId: event.habitId,
        loggedDate: event.date,
        eventType: event.type,
        frictionReason: event.frictionReason || '',
        note: event.note || '',
        timestamp: new Date(event.timestamp).toISOString(),
      });
    });
  }

  Array.from(logByKey.values()).forEach((row) => {
    rows.push([
      'habit_logs',
      row.id,
      row.habitId,
      habitName(habits, row.habitId),
      row.eventType,
      '',
      row.loggedDate,
      row.timestamp,
      row.frictionReason,
      row.note,
    ]);
  });

  return [headers.join(','), ...rows.map((row) => row.map(csvCell).join(','))].join('\n');
}

export function downloadCsvFile(filename: string, csvContent: string): void {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
