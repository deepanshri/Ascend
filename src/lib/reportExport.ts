import { Habit, HabitCompletionEvent, IdentityEvidence, MomentumEvent } from '../types';
import { fetchHabitLogsForExport, type HabitLogExportRow } from './habitsApi';
import { fetchMomentumEventsFromTable } from './momentumEvents';
import { countIdentityVotes, resolveMomentumEventDate } from '../utils/momentum';

function csvCell(value: unknown): string {
  let text = value == null ? '' : String(value);
  // Neutralize CSV formula injection (OWASP):
  // If the cell begins with =, +, -, @, tab, or carriage return, prefix with a single quote (')
  if (/^[\s]*[=+\-@\t\r]/.test(text)) {
    text = `'${text}`;
  }
  return `"${text.replace(/"/g, '""')}"`;
}

function habitName(habits: Habit[], habitId: string): string {
  return habits.find((habit) => habit.id === habitId)?.name || '';
}

function sectionHeader(title: string): string {
  return `# === ${title} ===`;
}

/** Identity vote totals: one row per habit (+ manuals) from append-only momentum_events. */
function ledgerTotalsRows(
  habits: Habit[],
  momentumEvents: MomentumEvent[],
  evidenceList: IdentityEvidence[]
): string[][] {
  const activeIds = new Set(habits.filter((h) => !h.archived).map((h) => h.id));
  const byHabitDay = new Set<string>();

  for (const event of momentumEvents) {
    if (event.eventType !== 'full' && event.eventType !== 'fallback') continue;
    if (!activeIds.has(event.habitId)) continue;
    const day = resolveMomentumEventDate(event);
    if (!day) continue;
    byHabitDay.add(`${event.habitId}::${day}`);
  }

  const votesByHabit = new Map<string, number>();
  for (const key of byHabitDay) {
    const habitId = key.split('::')[0];
    votesByHabit.set(habitId, (votesByHabit.get(habitId) || 0) + 1);
  }

  const rows: string[][] = [];
  for (const habit of habits.filter((h) => !h.archived)) {
    rows.push(['identity_ledger', habit.id, habit.name, String(votesByHabit.get(habit.id) || 0)]);
  }

  const manuals = evidenceList.filter((item) => item.habitId === 'manual').length;
  if (manuals > 0) {
    rows.push(['identity_ledger', 'manual', 'Manual evidence', String(manuals)]);
  }

  rows.push([
    'identity_ledger_total',
    '',
    'All identities',
    String(countIdentityVotes(momentumEvents, activeIds) + manuals),
  ]);

  return rows;
}

export async function buildReportCsv(options: {
  userId?: string | null;
  habits: Habit[];
  momentumEvents: MomentumEvent[];
  localLogs?: HabitCompletionEvent[];
  evidenceList?: IdentityEvidence[];
}): Promise<string> {
  const {
    userId,
    habits,
    momentumEvents,
    localLogs = [],
    evidenceList = [],
  } = options;
  const isAuthed = Boolean(userId && !userId.startsWith('guest_'));

  const [remoteMomentum, remoteLogs] = await Promise.all([
    isAuthed ? fetchMomentumEventsFromTable(userId).catch(() => []) : Promise.resolve([] as MomentumEvent[]),
    isAuthed ? fetchHabitLogsForExport(userId).catch(() => []) : Promise.resolve([] as HabitLogExportRow[]),
  ]);

  const momentumById = new Map<string, MomentumEvent>();
  [...momentumEvents, ...remoteMomentum].forEach((event) => {
    if (event?.id) momentumById.set(event.id, event);
  });
  const mergedMomentum = Array.from(momentumById.values()).sort((a, b) => a.timestamp - b.timestamp);

  const lines: string[] = [];

  // ——— Section 1: raw completion / momentum events ———
  lines.push(sectionHeader('SECTION 1: Raw completion events'));
  lines.push(
    [
      'source',
      'id',
      'habit_id',
      'habit_name',
      'completion_type',
      'weight',
      'logged_date',
      'timestamp',
      'momentum_contribution',
    ].join(',')
  );

  mergedMomentum.forEach((event) => {
    lines.push(
      [
        'momentum_events',
        event.id,
        event.habitId,
        habitName(habits, event.habitId),
        event.eventType,
        String(event.weight),
        resolveMomentumEventDate(event),
        new Date(event.timestamp).toISOString(),
        String(event.weight),
      ]
        .map(csvCell)
        .join(',')
    );
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
    const weight = row.eventType === 'fallback_micro' || row.eventType === 'fallback' ? '0.5' : '1';
    lines.push(
      [
        'habit_logs',
        row.id,
        row.habitId,
        habitName(habits, row.habitId),
        row.eventType,
        weight,
        row.loggedDate,
        row.timestamp,
        '', // momentum contribution lives on momentum_events; habit_logs is daily projection
      ]
        .map(csvCell)
        .join(',')
    );
  });

  // ——— Section 2: Identity Ledger totals ———
  lines.push('');
  lines.push(sectionHeader('SECTION 2: Identity Ledger totals'));
  lines.push(['source', 'identity_id', 'identity_name', 'all_time_votes'].join(','));
  ledgerTotalsRows(habits, mergedMomentum, evidenceList).forEach((row) => {
    lines.push(row.map(csvCell).join(','));
  });

  return lines.join('\n');
}

export async function downloadCsvFile(filename: string, csvContent: string): Promise<void> {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });

  // 1. Mobile / Capacitor Web Share API (Primary strategy for mobile apps)
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      const file = new File([blob], filename, { type: 'text/csv;charset=utf-8;' });
      if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: filename,
        });
        return;
      }
    } catch (shareErr: unknown) {
      if (shareErr instanceof Error && shareErr.name === 'AbortError') {
        return; // User manually dismissed native share sheet
      }
      // Fall through to file link handling below
    }
  }

  // 2. Android WebView Detection & Data URI / Blob Download Handling
  const isAndroidWebView =
    typeof navigator !== 'undefined' &&
    /Android/i.test(navigator.userAgent) &&
    (/wv/i.test(navigator.userAgent) || !window.URL?.createObjectURL);

  if (!isAndroidWebView && typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
    try {
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      window.setTimeout(() => {
        try {
          if (link.parentNode) link.parentNode.removeChild(link);
          URL.revokeObjectURL(url);
        } catch {
          /* ignore */
        }
      }, 3000);
      return;
    } catch {
      // Fall through to Base64 / Data URI
    }
  }

  // 3. Android WebView / Restrictive environment Data URI Fallback
  try {
    const encoded = encodeURIComponent(csvContent);
    const dataUrl = `data:text/csv;charset=utf-8,${encoded}`;
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = filename;
    link.target = '_blank';
    link.rel = 'noopener';
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    window.setTimeout(() => {
      try {
        if (link.parentNode) link.parentNode.removeChild(link);
      } catch {
        /* ignore */
      }
    }, 3000);
  } catch {
    // Ultimate fallback for restricted WebViews: direct location navigation
    const encoded = encodeURIComponent(csvContent);
    window.location.href = `data:text/csv;charset=utf-8,${encoded}`;
  }
}
