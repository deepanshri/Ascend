import React, { useState, useMemo, useEffect } from 'react';
import { Habit, HabitCategory, HabitCompletionEvent, IdentityEvidence, FrictionAudit, MomentumEvent } from '../types';
import { addDaysIso, getTodayDayIndex, getWeekDates, getWeekdayShort, toISODate } from '../utils/dates';
import { countMomentumCompletedActions } from '../lib/supabase';
import {
  activeKeystoneHabits,
  computeKeystoneCorrelation,
  keystoneOverallCompletionRate,
  MAX_KEYSTONE_HABITS,
  type KeystoneCorrelation,
} from '../lib/keystone';
import { readSleepSnapshot, sleepRingRate, SLEEP_TARGET_HOURS, type SleepSnapshot } from '../lib/health';
import { loadFriendsFeed } from '../lib/friends';
import { buildReportCsv, downloadCsvFile } from '../lib/reportExport';
import { eventScore, habitWeight, resolveMomentumEventDate } from '../utils/momentum';

interface ReportViewProps {
  habits: Habit[];
  evidenceList: IdentityEvidence[];
  identityVoteCount?: number;
  userId?: string | null;
  onOpenLedger: () => void;
  frictionAudits: FrictionAudit[];
  onScroll?: (e: React.UIEvent<HTMLDivElement>) => void;
  isDark?: boolean;
  momentumScore?: number;
  momentumEvents?: MomentumEvent[];
  completionEvents?: HabitCompletionEvent[];
}

type TimeFilter = 'today' | 'week' | 'month' | 'momentum';
type GraphMode = 'line' | 'bar';

function formatKeystoneCorrelation(correlation: KeystoneCorrelation): string {
  const abs = Math.abs(correlation.liftPercent);
  if (correlation.liftPercent > 0) {
    return `On days you complete ${correlation.habitName}, your overall momentum is +${abs}% higher`;
  }
  if (correlation.liftPercent < 0) {
    return `On days you complete ${correlation.habitName}, your overall momentum is ${abs}% lower`;
  }
  return `On days you complete ${correlation.habitName}, overall momentum is unchanged`;
}

function categoryDayScore(habit: Habit, dayIndex: number): number {
  const scheduled =
    !habit.scheduledDays || habit.scheduledDays.length === 0 || habit.scheduledDays.includes(dayIndex);
  if (!scheduled) return -1;
  if (!habit.days?.[dayIndex]) return 0;
  return habit.microDays?.[dayIndex] ? 0.5 : 1;
}

function categoryRateFromDays(habits: Habit[], category: HabitCategory, dayIndexes: number[]): number {
  const list = habits.filter((habit) => habit.category === category);
  if (list.length === 0 || dayIndexes.length === 0) return 0;
  let score = 0;
  let total = 0;
  list.forEach((habit) => {
    dayIndexes.forEach((index) => {
      const value = categoryDayScore(habit, index);
      if (value < 0) return;
      total += 1;
      score += value;
    });
  });
  return total === 0 ? 0 : score / total;
}

function categoryRateFromEvents(
  habits: Habit[],
  events: MomentumEvent[],
  category: HabitCategory,
  startIso: string,
  endIso: string
): number {
  const list = habits.filter((habit) => habit.category === category);
  if (list.length === 0) return 0;
  const dates: string[] = [];
  for (let cursor = startIso; cursor <= endIso; cursor = addDaysIso(cursor, 1)) {
    dates.push(cursor);
  }
  if (dates.length === 0) return 0;
  let score = 0;
  dates.forEach((iso) => {
    let weightedSum = 0;
    let weightTotal = 0;
    list.forEach((habit) => {
      const weight = habitWeight(habit);
      weightTotal += weight;
      const best = events.reduce((max, event) => {
        if (event.habitId !== habit.id || resolveMomentumEventDate(event) !== iso) return max;
        return Math.max(max, eventScore(event.eventType));
      }, 0);
      weightedSum += weight * best;
    });
    score += weightTotal > 0 ? weightedSum / weightTotal : 0;
  });
  return score / dates.length;
}

function createLinePath(points: Array<{ x: number; y: number }>): string {
  if (points.length === 0) return '';
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[i];
    const p1 = points[i + 1];
    const midX = p0.x + (p1.x - p0.x) * 0.5;
    d += ` C ${midX} ${p0.y}, ${midX} ${p1.y}, ${p1.x} ${p1.y}`;
  }
  return d;
}

export const ReportView: React.FC<ReportViewProps> = ({
  habits,
  evidenceList,
  identityVoteCount,
  userId,
  onOpenLedger,
  frictionAudits,
  onScroll,
  isDark = false,
  momentumScore = 0,
  momentumEvents = [],
  completionEvents = [],
}) => {
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('today');
  const [graphMode, setGraphMode] = useState<GraphMode>('line');
  const [downloadSuccess, setDownloadSuccess] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [remoteVoteCount, setRemoteVoteCount] = useState<number | null>(null);
  const [voteFloor, setVoteFloor] = useState(0);
  const [keystoneExpanded, setKeystoneExpanded] = useState(false);
  const [sleep, setSleep] = useState<SleepSnapshot>({
    hasSleepData: false,
    linked: false,
    permissionDenied: false,
    todayHours: null,
    weekHours: null,
    dailyHours: [],
  });

  const todayIndex = getTodayDayIndex();
  const todayIso = toISODate();
  const hasSleepData = sleep.hasSleepData;
  const replicaVotes = identityVoteCount ?? evidenceList.length;

  const keystones = useMemo(() => activeKeystoneHabits(habits), [habits]);
  const keystoneCompletionRate = useMemo(() => keystoneOverallCompletionRate(habits), [habits]);
  const keystoneStats = useMemo(
    () =>
      keystones.map((habit) => ({
        habit,
        correlation: computeKeystoneCorrelation(habit, habits, momentumEvents),
      })),
    [keystones, habits, momentumEvents]
  );

  const friends = useMemo(() => loadFriendsFeed(), []);

  useEffect(() => {
    setVoteFloor((prev) => Math.max(prev, replicaVotes, remoteVoteCount ?? 0));
  }, [replicaVotes, remoteVoteCount]);

  useEffect(() => {
    if (!userId || userId.startsWith('guest_')) return;
    let cancelled = false;
    void countMomentumCompletedActions(userId).then((count) => {
      if (!cancelled && count != null) setRemoteVoteCount(count);
    });
    return () => {
      cancelled = true;
    };
  }, [userId, replicaVotes]);

  useEffect(() => {
    let cancelled = false;
    void readSleepSnapshot(todayIso).then((snapshot) => {
      if (!cancelled) setSleep(snapshot);
    });
    return () => {
      cancelled = true;
    };
  }, [todayIso]);

  const ledgerVoteCount = Math.max(voteFloor, replicaVotes, remoteVoteCount ?? 0);

  const categoryStats = useMemo(() => {
    const monthStart = addDaysIso(todayIso, -29);
    const work =
      timeFilter === 'month' || timeFilter === 'momentum'
        ? categoryRateFromEvents(habits, momentumEvents, 'work', monthStart, todayIso)
        : categoryRateFromDays(habits, 'work', timeFilter === 'today' ? [todayIndex] : [0, 1, 2, 3, 4, 5, 6]);
    const self =
      timeFilter === 'month' || timeFilter === 'momentum'
        ? categoryRateFromEvents(habits, momentumEvents, 'self_improvement', monthStart, todayIso)
        : categoryRateFromDays(
            habits,
            'self_improvement',
            timeFilter === 'today' ? [todayIndex] : [0, 1, 2, 3, 4, 5, 6]
          );
    const sleepRate = sleepRingRate(sleep, timeFilter === 'today' ? 'today' : 'week');
    return { work, self, sleep: sleepRate };
  }, [habits, momentumEvents, timeFilter, todayIndex, todayIso, sleep]);

  const lineGraphData = useMemo(() => {
    const xs = [24, 54, 84, 114, 144, 176, 208];
    const weekIso = getWeekDates().map((date) => toISODate(date));
    const toPoint = (pct: number, x: number, yMin: number, yMax: number) => ({
      x,
      y: Math.round((yMax - Math.min(1, Math.max(0, pct)) * (yMax - yMin)) * 10) / 10,
    });

    const workPoints = xs.map((x, dayIdx) =>
      toPoint(categoryRateFromDays(habits, 'work', [dayIdx]), x, 48, 122)
    );
    const selfPoints = xs.map((x, dayIdx) =>
      toPoint(categoryRateFromDays(habits, 'self_improvement', [dayIdx]), x, 72, 140)
    );
    const sleepByIso = new Map<string, number>(sleep.dailyHours.map((row) => [row.isoDate, row.hours]));
    const sleepPoints = xs.map((x, dayIdx) => {
      const hours = sleepByIso.get(weekIso[dayIdx] ?? '') ?? 0;
      return toPoint(hours / SLEEP_TARGET_HOURS, x, 22, 98);
    });

    return {
      workPoints,
      selfPoints,
      sleepPoints,
      workPath: createLinePath(workPoints),
      selfPath: createLinePath(selfPoints),
      sleepPath: createLinePath(sleepPoints),
    };
  }, [habits, sleep.dailyHours]);

  const frictionWindowMs =
    timeFilter === 'today' ? 1 : timeFilter === 'month' ? 30 : 7;
  const frictionCutoff = Date.now() - frictionWindowMs * 24 * 60 * 60 * 1000;
  const frictionCutoffIso = addDaysIso(todayIso, -(frictionWindowMs - 1));

  const windowAudits = useMemo(
    () =>
      frictionAudits.filter((audit) => {
        if (audit.loggedDate) return audit.loggedDate >= frictionCutoffIso;
        return audit.timestamp >= frictionCutoff;
      }),
    [frictionAudits, frictionCutoff, frictionCutoffIso]
  );

  const frictionPatterns = useMemo(() => {
    const counts = new Map<string, number>();
    windowAudits.forEach((audit) => {
      const reason = (audit.reason || audit.note || '').trim();
      if (!reason) return;
      counts.set(reason, (counts.get(reason) || 0) + 1);
    });
    return Array.from(counts.entries())
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count);
  }, [windowAudits]);
  const flaggedFrictionEvents = useMemo(
    () =>
      windowAudits
        .filter((audit) => (audit.reason || audit.note || '').trim().length > 0)
        .slice(0, 8),
    [windowAudits]
  );

  const handleDownloadCSV = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const csv = await buildReportCsv({
        userId,
        habits,
        momentumEvents,
        localLogs: completionEvents,
      });
      downloadCsvFile(`ascend-report-${timeFilter}-${todayIso}.csv`, csv);
      setDownloadSuccess(true);
      window.setTimeout(() => setDownloadSuccess(false), 2400);
    } finally {
      setExporting(false);
    }
  };

  const cx = 160;
  const cy = 110;
  const strokeW = 7.5;
  const getArc = (radius: number, percent: number) => {
    const circumference = 2 * Math.PI * radius;
    const clamped = Math.min(1, Math.max(0, percent));
    return `${circumference * clamped} ${circumference * (1 - clamped)}`;
  };

  const ringLayout = hasSleepData
    ? [
        { key: 'sleep', label: 'Sleep', r: 56, rate: categoryStats.sleep, color: isDark ? '#1d4ed8' : '#166534' },
        { key: 'work', label: 'Work / Academic', r: 43, rate: categoryStats.work, color: isDark ? '#3b82f6' : '#23C15D' },
        { key: 'self', label: 'Self-Improvement', r: 30, rate: categoryStats.self, color: isDark ? '#93c5fd' : '#4ADE80' },
      ]
    : [
        { key: 'work', label: 'Work / Academic', r: 52, rate: categoryStats.work, color: isDark ? '#3b82f6' : '#23C15D' },
        { key: 'self', label: 'Self-Improvement', r: 34, rate: categoryStats.self, color: isDark ? '#93c5fd' : '#4ADE80' },
      ];

  const barSeries = hasSleepData
    ? [
        { label: 'Work', rate: categoryStats.work },
        { label: 'SI', rate: categoryStats.self },
        { label: 'Sleep', rate: categoryStats.sleep },
      ]
    : [
        { label: 'Work', rate: categoryStats.work },
        { label: 'SI', rate: categoryStats.self },
      ];

  const sleepHoursLabel =
    timeFilter === 'today'
      ? sleep.todayHours == null
        ? '—'
        : `${sleep.todayHours}h`
      : sleep.weekHours == null
      ? '—'
      : `${sleep.weekHours}h`;

  return (
    <div
      id="report-screen"
      onScroll={onScroll}
      className="absolute inset-0 px-4.5 pt-[calc(env(safe-area-inset-top)+4.25rem)] pb-28 space-y-4 overflow-y-auto overscroll-y-contain no-scrollbar select-none max-w-md mx-auto"
    >
      <section className="flex items-start justify-between pt-1">
        <div>
          <h1 className="text-[32px] font-black text-slate-900 dark:text-white tracking-tight leading-none">Report</h1>
          <p className="text-[13px] text-slate-500 dark:text-slate-400 font-normal mt-1">Your progress, in perspective.</p>
        </div>
        <button
          id="download-report-csv-btn"
          type="button"
          onClick={() => void handleDownloadCSV()}
          disabled={exporting}
          className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl p-2 px-3 flex items-center space-x-2.5 shadow-xs hover:border-slate-300 dark:hover:border-slate-700 active:scale-95 transition cursor-pointer disabled:opacity-60"
          title="Download Report (CSV)"
        >
          <div className="w-5 h-5 flex items-center justify-center text-slate-800 dark:text-slate-200 shrink-0">
            {downloadSuccess ? (
              <svg className="w-5 h-5 text-emerald-600 dark:text-blue-400" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg className="w-5 h-5 text-slate-800 dark:text-slate-200" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
            )}
          </div>
          <div className="text-left leading-[1.1]">
            <div className="text-[11.5px] font-bold text-slate-900 dark:text-white">
              {exporting ? 'Exporting' : downloadSuccess ? 'Exported' : 'Download'}
            </div>
            <div className="text-[11.5px] font-bold text-slate-900 dark:text-white">Report</div>
            <div className="text-[9.5px] text-slate-400 dark:text-slate-500 font-medium">(CSV)</div>
          </div>
        </button>
      </section>

      <section className="relative w-full flex flex-col items-center justify-center">
        <div className="relative w-full max-w-[340px] h-[210px] flex items-center justify-center">
          <svg className="w-full h-full overflow-visible" viewBox="0 0 320 220">
            <circle cx={cx} cy={cy} r={80} fill="none" stroke={isDark ? '#334155' : '#F1F5F9'} strokeWidth="1" strokeDasharray="3 3" />
            {ringLayout.map((ring) => (
              <g key={ring.key}>
                <circle cx={cx} cy={cy} r={ring.r} fill="none" stroke={isDark ? '#334155' : '#F1F5F9'} strokeWidth={strokeW} />
                <circle
                  cx={cx}
                  cy={cy}
                  r={ring.r}
                  fill="none"
                  stroke={ring.color}
                  strokeWidth={strokeW}
                  strokeDasharray={getArc(ring.r, ring.rate)}
                  strokeLinecap="round"
                  transform={`rotate(-90 ${cx} ${cy})`}
                />
              </g>
            ))}
            {hasSleepData ? (
              <>
                <polyline points={`${cx + 38},${cy - 42} ${cx + 52},${cy - 52} ${cx + 70},${cy - 52}`} fill="none" stroke={isDark ? '#64748b' : '#CBD5E1'} strokeWidth="1.2" />
                <circle cx={cx + 76} cy={cy - 52} r={3} fill={isDark ? '#1d4ed8' : '#166534'} />
                <text x={cx + 84} y={cy - 48} fill={isDark ? '#f8fafc' : '#1e293b'} className="text-[12px] font-semibold">
                  Sleep
                </text>
                <polyline points={`${cx - 43},${cy - 4} ${cx - 75},${cy - 4}`} fill="none" stroke={isDark ? '#64748b' : '#CBD5E1'} strokeWidth="1.2" />
                <circle cx={cx - 81} cy={cy - 4} r={3} fill={isDark ? '#2563eb' : '#0B5938'} />
                <text x={cx - 90} y={cy - 12} fill={isDark ? '#f8fafc' : '#1e293b'} className="text-[11.5px] font-semibold" textAnchor="end">
                  Work /
                </text>
                <text x={cx - 90} y={cy + 3} fill={isDark ? '#f8fafc' : '#1e293b'} className="text-[11.5px] font-semibold" textAnchor="end">
                  Academic
                </text>
                <polyline points={`${cx + 30},${cy + 8} ${cx + 72},${cy + 8}`} fill="none" stroke={isDark ? '#64748b' : '#CBD5E1'} strokeWidth="1.2" />
                <circle cx={cx + 78} cy={cy + 8} r={3} fill={isDark ? '#3b82f6' : '#23C15D'} />
                <text x={cx + 86} y={cy + 12} fill={isDark ? '#f8fafc' : '#1e293b'} className="text-[12px] font-semibold">
                  Self-Improvement
                </text>
              </>
            ) : (
              <>
                <polyline points={`${cx - 52},${cy - 6} ${cx - 84},${cy - 6}`} fill="none" stroke={isDark ? '#64748b' : '#CBD5E1'} strokeWidth="1.2" />
                <circle cx={cx - 90} cy={cy - 6} r={3} fill={isDark ? '#2563eb' : '#0B5938'} />
                <text x={cx - 98} y={cy - 14} fill={isDark ? '#f8fafc' : '#1e293b'} className="text-[11.5px] font-semibold" textAnchor="end">
                  Work /
                </text>
                <text x={cx - 98} y={cy + 1} fill={isDark ? '#f8fafc' : '#1e293b'} className="text-[11.5px] font-semibold" textAnchor="end">
                  Academic
                </text>
                <polyline points={`${cx + 34},${cy + 6} ${cx + 78},${cy + 6}`} fill="none" stroke={isDark ? '#64748b' : '#CBD5E1'} strokeWidth="1.2" />
                <circle cx={cx + 84} cy={cy + 6} r={3} fill={isDark ? '#3b82f6' : '#23C15D'} />
                <text x={cx + 92} y={cy + 10} fill={isDark ? '#f8fafc' : '#1e293b'} className="text-[12px] font-semibold">
                  Self-Improvement
                </text>
              </>
            )}
          </svg>
        </div>
        {hasSleepData && (
          <p className="text-[11.5px] text-slate-500 dark:text-slate-400 -mt-2">
            Sleep logged {sleepHoursLabel} · target {SLEEP_TARGET_HOURS}h
          </p>
        )}
      </section>

      <section>
        {graphMode === 'line' ? (
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-3 border border-slate-200/90 dark:border-slate-800 shadow-xs space-y-2">
            <div className="flex items-center justify-between text-xs px-1">
              <span className="font-bold text-slate-800 dark:text-white">Line graph</span>
              <span className="text-emerald-700 dark:text-blue-400 font-bold tabular-nums">
                {Math.round(
                  ((hasSleepData ? categoryStats.work + categoryStats.self + categoryStats.sleep : categoryStats.work + categoryStats.self) /
                    (hasSleepData ? 3 : 2)) *
                    100
                )}
                %
              </span>
            </div>
            <svg className="w-full h-[155px] overflow-visible" viewBox="0 0 375 162">
              <line x1="16" y1="36" x2="216" y2="36" stroke={isDark ? '#334155' : '#F1F5F9'} strokeWidth="1" strokeDasharray="3 3" />
              <line x1="16" y1="78" x2="216" y2="78" stroke={isDark ? '#334155' : '#F1F5F9'} strokeWidth="1" strokeDasharray="3 3" />
              <line x1="16" y1="120" x2="216" y2="120" stroke={isDark ? '#334155' : '#F1F5F9'} strokeWidth="1" strokeDasharray="3 3" />
              {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, idx) => (
                <text key={`${day}-${idx}`} x={[24, 54, 84, 114, 144, 176, 208][idx]} y={155} textAnchor="middle" fill={isDark ? '#64748b' : '#94A3B8'} className="text-[9.5px] font-bold">
                  {day}
                </text>
              ))}
              {hasSleepData && (
                <path d={lineGraphData.sleepPath} fill="none" stroke={isDark ? '#1d4ed8' : '#166534'} strokeWidth="2.5" strokeLinecap="round" />
              )}
              <path d={lineGraphData.workPath} fill="none" stroke={isDark ? '#3b82f6' : '#23C15D'} strokeWidth="2.5" strokeLinecap="round" />
              <path d={lineGraphData.selfPath} fill="none" stroke={isDark ? '#93c5fd' : '#4ADE80'} strokeWidth="2.5" strokeLinecap="round" />
            </svg>
          </div>
        ) : (
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-3 border border-slate-200/90 dark:border-slate-800 shadow-xs space-y-3">
            <span className="px-1 text-xs font-bold text-slate-800 dark:text-white">Bar breakdown</span>
            <div className={`grid gap-3 ${hasSleepData ? 'grid-cols-3' : 'grid-cols-2'}`}>
              {barSeries.map((col) => {
                const height = Math.round(col.rate * 110);
                return (
                  <div key={col.label} className="flex flex-col items-center">
                    <span className="text-[11.5px] font-extrabold text-slate-800 dark:text-white tabular-nums mb-1">
                      {Math.round(col.rate * 100)}%
                    </span>
                    <div className="h-[120px] w-full flex items-end justify-center">
                      <div
                        style={{ height: `${Math.max(4, height)}px` }}
                        className="w-8 rounded-t-lg bg-[#23C15D] dark:bg-blue-500"
                      />
                    </div>
                    <span className="mt-2 text-[11.5px] font-semibold text-slate-700 dark:text-slate-300">{col.label}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        <div className="flex justify-end pt-1">
          <button
            id="switch-graph-btn"
            type="button"
            onClick={() => setGraphMode((prev) => (prev === 'line' ? 'bar' : 'line'))}
            className="px-3.5 py-1.5 bg-white dark:bg-slate-900 rounded-xl border border-slate-200/90 dark:border-slate-800 shadow-xs flex items-center space-x-2 text-[12px] font-semibold text-slate-800 dark:text-slate-200 hover:border-slate-300 dark:hover:border-slate-700 transition cursor-pointer active:scale-95"
          >
            <svg className="w-4 h-4 text-slate-800 dark:text-slate-200" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
            </svg>
            <span>{graphMode === 'line' ? 'Bar breakdown' : 'Line graph'}</span>
          </button>
        </div>
      </section>

      <section>
        <button
          type="button"
          id="identity-evidence-ledger-card"
          onClick={onOpenLedger}
          className="w-full bg-white dark:bg-slate-900 rounded-2xl p-3.5 px-4 border border-slate-100 dark:border-slate-800 shadow-xs flex items-center justify-between cursor-pointer hover:border-slate-200 dark:hover:border-slate-700 transition"
        >
          <span className="text-[14.5px] font-bold text-slate-800 dark:text-white tracking-tight">Identity Evidence ledger</span>
          <span className="text-[14.5px] font-bold text-slate-800 dark:text-white tabular-nums">{ledgerVoteCount} votes</span>
        </button>
      </section>

      <section>
        <button
          type="button"
          id="keystone-habits-row"
          aria-expanded={keystoneExpanded}
          onClick={() => setKeystoneExpanded((prev) => !prev)}
          className={`w-full rounded-2xl p-3.5 px-4 border shadow-xs text-left transition ${
            keystones.length > 0
              ? 'bg-white dark:bg-slate-900 border-emerald-200/90 dark:border-blue-500/40 shadow-[0_0_18px_rgba(16,185,129,0.18)] dark:shadow-[0_0_18px_rgba(59,130,246,0.22)] ring-1 ring-emerald-400/25 dark:ring-blue-400/30'
              : 'bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-800'
          }`}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[14.5px] font-bold text-slate-800 dark:text-white tracking-tight">Keystone</span>
                {keystones.length > 0 && (
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 dark:bg-blue-400 shadow-[0_0_8px_rgba(52,211,153,0.9)] dark:shadow-[0_0_8px_rgba(96,165,250,0.9)]" />
                )}
              </div>
              <p className="text-[11.5px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                {keystones.length === 0
                  ? 'None flagged'
                  : `${keystones.length} of ${MAX_KEYSTONE_HABITS} · ${keystones.map((habit) => habit.name).join(', ')}`}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-[14.5px] font-bold text-slate-800 dark:text-white tabular-nums">
                {keystoneCompletionRate == null ? '—' : `${keystoneCompletionRate}%`}
              </span>
              <svg className={`w-4 h-4 text-slate-400 transition-transform ${keystoneExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </div>
        </button>
        {keystoneExpanded && (
          <div className="mt-2 rounded-2xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-3.5 px-4 space-y-2.5">
            {keystones.length === 0 ? (
              <p className="text-[12.5px] text-slate-500 dark:text-slate-400 leading-relaxed">
                Flag up to {MAX_KEYSTONE_HABITS} active habits as Keystone to track correlation.
              </p>
            ) : (
              keystoneStats.map(({ habit, correlation }) => (
                <p key={habit.id} className="text-[12.5px] text-slate-700 dark:text-slate-200 leading-relaxed">
                  {correlation ? formatKeystoneCorrelation(correlation) : 'Building correlation data...'}
                </p>
              ))
            )}
          </div>
        )}
      </section>

      <section className="bg-[#EFF3F6] dark:bg-slate-800/80 p-1 rounded-2xl flex items-center">
        {(['today', 'week', 'month', 'momentum'] as TimeFilter[]).map((tab) => {
          const isActive = timeFilter === tab;
          const label = tab === 'today' ? 'Today' : tab === 'week' ? 'Week' : tab === 'month' ? 'Month' : '⚡ Momentum';
          return (
            <button
              key={tab}
              id={`filter-tab-${tab}`}
              type="button"
              onClick={() => setTimeFilter(tab)}
              className={`flex-1 py-1.5 text-[12px] sm:text-[13px] font-bold rounded-xl transition-all cursor-pointer text-center ${
                isActive
                  ? 'bg-white dark:bg-blue-600 text-emerald-800 dark:text-white shadow-xs'
                  : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white'
              }`}
            >
              {label}
            </button>
          );
        })}
      </section>

      <section className="bg-white dark:bg-slate-900 rounded-2xl p-4.5 border border-slate-100 dark:border-slate-800 shadow-xs space-y-4">
        <div className="flex items-center space-x-2.5">
          <div className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-blue-950/60 flex items-center justify-center text-emerald-800 dark:text-blue-400 shrink-0">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
          </div>
          <div>
            <h2 className="text-[16px] font-extrabold text-slate-900 dark:text-white tracking-tight leading-tight">Analysis</h2>
            <p className="text-[11.5px] text-slate-400 dark:text-slate-400 font-normal">Friction reasons from habit logs</p>
          </div>
        </div>

        {timeFilter === 'momentum' && (
          <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
            <span className="text-[12.5px] font-bold text-slate-700 dark:text-slate-200">Momentum score</span>
            <span className="text-[18px] font-black text-slate-900 dark:text-white tabular-nums">{momentumScore}</span>
          </div>
        )}

        {timeFilter === 'momentum' && (
          <div className="grid grid-cols-7 gap-1.5 text-center">
            {Array.from({ length: 7 }, (_, i) => {
              const completedCount = habits.filter((habit) => habit.days?.[i]).length;
              const rate = habits.length > 0 ? completedCount / habits.length : 0;
              return (
                <div key={i} className="flex flex-col items-center">
                  <span className="text-[10.5px] font-bold text-slate-500 dark:text-slate-400 mb-1">{getWeekdayShort(i)}</span>
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center text-[11px] font-extrabold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200">
                    {habits.length === 0 ? '—' : `${Math.round(rate * 100)}%`}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {frictionPatterns.length === 0 && flaggedFrictionEvents.length === 0 ? (
          <p className="text-[12.5px] text-slate-500 dark:text-slate-400 leading-relaxed">No friction reasons logged for this window.</p>
        ) : (
          <div className="space-y-2">
            {frictionPatterns.map((pattern) => (
              <div
                key={pattern.reason}
                className="px-2.5 py-1.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-900/50 text-[12px] text-amber-900 dark:text-amber-200 font-semibold"
              >
                {pattern.reason} was cited {pattern.count}x
              </div>
            ))}
            {flaggedFrictionEvents.map((event) => (
              <p key={event.id} className="text-[11.5px] text-slate-500 dark:text-slate-400">
                <span className="font-semibold text-slate-700 dark:text-slate-200">{event.habitName}</span>
                {' · '}
                {event.reason || event.note}
                {event.loggedDate ? ` · ${event.loggedDate}` : event.date ? ` · ${event.date}` : ''}
              </p>
            ))}
          </div>
        )}
      </section>

      <section className="bg-white dark:bg-slate-900 rounded-2xl p-4.5 border border-slate-100 dark:border-slate-800 shadow-xs space-y-3">
        <h2 className="text-[16px] font-extrabold text-slate-900 dark:text-white tracking-tight">Friends Feed</h2>
        {friends.length === 0 ? (
          <p className="text-[12.5px] text-slate-500 dark:text-slate-400 leading-relaxed">
            No friends yet. Add accountability buddies from Personal.
          </p>
        ) : (
          <div className="space-y-1.5">
            {friends.map((friend) => (
              <div
                key={friend.id}
                className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700 flex items-center justify-between"
              >
                <div className="flex items-center space-x-2">
                  <div className="w-7 h-7 rounded-full bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300 text-xs font-bold flex items-center justify-center">
                    {friend.name.charAt(0).toUpperCase()}
                  </div>
                  <span className="font-semibold text-[13px] text-slate-800 dark:text-slate-200">{friend.name}</span>
                </div>
                <span className="text-[12px] font-bold text-slate-600 dark:text-slate-300 tabular-nums">{friend.momentum}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};
