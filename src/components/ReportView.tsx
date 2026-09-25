import React, { useState, useMemo, useEffect } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Habit, HabitCategory, HabitCompletionEvent, IdentityEvidence, FrictionAudit, MomentumEvent } from '../types';
import {
  addDaysIso,
  endOfIsoDate,
  parseIsoDateParts,
  resolveEventIsoDate,
  startOfDay,
  toISODate,
} from '../utils/dates';
import {
  activeKeystoneHabits,
  computeKeystoneCorrelation,
  keystoneOverallCompletionRate,
  MAX_KEYSTONE_HABITS,
  type KeystoneCorrelation,
} from '../lib/keystone';
import { readSleepSnapshot, SLEEP_TARGET_HOURS, type SleepSnapshot } from '../lib/health';
import { buildReportCsv, downloadCsvFile } from '../lib/reportExport';
import { FriendsFeed } from './FriendsFeed';
import { ScreenHeader, SCREEN_INSET_CLASS } from './ScreenHeader';
import { tapPress } from '../lib/motionPresets';
import { calculateMomentumScore, eventScore, habitWeight, resolveMomentumEventDate } from '../utils/momentum';
import { isHabitScheduledOnIso } from '../utils/schedule';
import { activeCycleWindow } from '../services/reportService';
import { DaySelector } from './DaySelector';

interface ReportViewProps {
  habits: Habit[];
  evidenceList: IdentityEvidence[];
  identityVoteCount?: number;
  userId?: string | null;
  isGuest?: boolean;
  userEmail?: string;
  userName?: string;
  onOpenLedger: () => void;
  onOpenSettings?: () => void;
  frictionAudits: FrictionAudit[];
  onScroll?: (e: React.UIEvent<HTMLDivElement>) => void;
  isDark?: boolean;
  momentumScore?: number;
  momentumEvents?: MomentumEvent[];
  momentumHistory?: MomentumEvent[];
  completionEvents?: HabitCompletionEvent[];
  logs?: HabitCompletionEvent[];
  selectedDayIso?: string;
  onSelectDayIso?: (iso: string) => void;
  cycleDays?: number;
  cycleStartIso?: string;
  isActive?: boolean;
}

type TimeFilter = 'today' | 'week' | 'month' | 'momentum';
type GraphMode = 'rings' | 'line';

const HISTORY_CAP_DAYS = 90;
const VISUALIZER_EASE = [0.22, 1, 0.36, 1] as const;

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

function asArray<T>(value: T[] | null | undefined): T[] {
  return Array.isArray(value) ? value : [];
}

function isoRangeInclusive(startIso: string, endIso: string): string[] {
  if (!startIso || !endIso || startIso > endIso) return [];
  const dates: string[] = [];
  for (let cursor = startIso; cursor <= endIso; cursor = addDaysIso(cursor, 1)) {
    dates.push(cursor);
  }
  return dates;
}

function weekdayNarrowFromIso(iso: string): string {
  const parts = parseIsoDateParts(iso);
  if (!parts) return '';
  return new Date(parts.year, parts.month - 1, parts.day).toLocaleDateString('en-US', { weekday: 'narrow' });
}

function weekdayShortFromIso(iso: string): string {
  const parts = parseIsoDateParts(iso);
  if (!parts) return '';
  return new Date(parts.year, parts.month - 1, parts.day).toLocaleDateString('en-US', { weekday: 'short' });
}

function startOfIsoMs(iso: string): number {
  const parts = parseIsoDateParts(iso);
  if (!parts) return 0;
  return new Date(parts.year, parts.month - 1, parts.day).getTime();
}

function completionLogScore(type: HabitCompletionEvent['type']): number {
  return type === 'fallback_micro' ? 0.5 : 1;
}

function habitBestScoreOnIso(
  habitId: string,
  iso: string,
  momentumEvents: MomentumEvent[],
  completionEvents: HabitCompletionEvent[]
): number {
  let best = 0;
  for (const event of asArray(momentumEvents)) {
    if (event.habitId !== habitId) continue;
    if (resolveMomentumEventDate(event) !== iso) continue;
    best = Math.max(best, eventScore(event.eventType));
  }
  for (const event of asArray(completionEvents)) {
    if (event.habitId !== habitId) continue;
    if (resolveEventIsoDate(event) !== iso) continue;
    best = Math.max(best, completionLogScore(event.type));
  }
  return best;
}

type HabitDayKind = 'full' | 'fallback' | 'none';

function habitDayKindOnIso(
  habitId: string,
  iso: string,
  momentumEvents: MomentumEvent[],
  completionEvents: HabitCompletionEvent[]
): HabitDayKind {
  let sawFull = false;
  let sawFallback = false;
  for (const event of asArray(momentumEvents)) {
    if (event.habitId !== habitId) continue;
    if (resolveMomentumEventDate(event) !== iso) continue;
    if (event.eventType === 'full') sawFull = true;
    if (event.eventType === 'fallback') sawFallback = true;
  }
  for (const event of asArray(completionEvents)) {
    if (event.habitId !== habitId) continue;
    if (resolveEventIsoDate(event) !== iso) continue;
    if (event.type === 'full') sawFull = true;
    if (event.type === 'fallback_micro') sawFallback = true;
  }
  if (sawFull) return 'full';
  if (sawFallback) return 'fallback';
  return 'none';
}

interface HabitCycleStat {
  habit: Habit;
  targetDays: number;
  completedDays: number;
  fullDays: number;
  fallbackDays: number;
  percent: number;
}

function computeHabitCycleStats(
  habits: Habit[],
  startIso: string,
  endIso: string,
  momentumEvents: MomentumEvent[],
  completionEvents: HabitCompletionEvent[]
): HabitCycleStat[] {
  const dates = isoRangeInclusive(startIso, endIso);
  return asArray(habits)
    .filter((habit) => !habit.archived)
    .map((habit) => {
      let targetDays = 0;
      let completedDays = 0;
      let fullDays = 0;
      let fallbackDays = 0;
      dates.forEach((iso) => {
        if (!isHabitScheduledOnIso(habit, iso)) return;
        targetDays += 1;
        const kind = habitDayKindOnIso(habit.id, iso, momentumEvents, completionEvents);
        if (kind === 'full') {
          completedDays += 1;
          fullDays += 1;
        } else if (kind === 'fallback') {
          completedDays += 1;
          fallbackDays += 1;
        }
      });
      const percent = targetDays === 0 ? 0 : Math.round((completedDays / targetDays) * 100);
      return {
        habit,
        targetDays,
        completedDays,
        fullDays,
        fallbackDays,
        percent,
      };
    })
    .sort((a, b) => b.percent - a.percent || a.habit.name.localeCompare(b.habit.name));
}

function categoryRateFromLogs(
  habits: Habit[],
  category: HabitCategory,
  startIso: string,
  endIso: string,
  momentumEvents: MomentumEvent[],
  completionEvents: HabitCompletionEvent[]
): number {
  const list = asArray(habits).filter((habit) => habit.category === category && !habit.archived);
  if (list.length === 0) return 0;
  const dates = isoRangeInclusive(startIso, endIso);
  if (dates.length === 0) return 0;
  let score = 0;
  let scheduledDays = 0;
  dates.forEach((iso) => {
    let weightedSum = 0;
    let weightTotal = 0;
    list.forEach((habit) => {
      if (!isHabitScheduledOnIso(habit, iso)) return;
      const weight = habitWeight(habit);
      if (!Number.isFinite(weight) || weight <= 0) return;
      weightTotal += weight;
      const dayScore = habitBestScoreOnIso(habit.id, iso, momentumEvents, completionEvents);
      weightedSum += weight * (Number.isFinite(dayScore) ? dayScore : 0);
    });
    if (weightTotal <= 0) return;
    scheduledDays += 1;
    score += weightedSum / weightTotal;
  });
  if (scheduledDays === 0) return 0;
  const rate = score / scheduledDays;
  if (!Number.isFinite(rate)) return 0;
  return Math.min(1, Math.max(0, rate));
}

function earliestLogIso(
  momentumEvents: MomentumEvent[],
  completionEvents: HabitCompletionEvent[],
  todayIso: string
): string {
  let earliest = todayIso;
  for (const event of asArray(momentumEvents)) {
    const iso = resolveMomentumEventDate(event);
    if (iso && iso < earliest) earliest = iso;
  }
  for (const event of asArray(completionEvents)) {
    const iso = resolveEventIsoDate(event);
    if (iso && iso < earliest) earliest = iso;
  }
  const cap = addDaysIso(todayIso, -(HISTORY_CAP_DAYS - 1));
  return earliest < cap ? cap : earliest;
}

function filterLogsThroughMs(
  iso: string,
  endMs: number,
  momentumEvents: MomentumEvent[],
  completionEvents: HabitCompletionEvent[]
): { momentum: MomentumEvent[]; completions: HabitCompletionEvent[] } {
  return {
    momentum: asArray(momentumEvents).filter((event) => {
      if (resolveMomentumEventDate(event) !== iso) return false;
      return event.timestamp < endMs;
    }),
    completions: asArray(completionEvents).filter((event) => {
      if (resolveEventIsoDate(event) !== iso) return false;
      return event.timestamp < endMs;
    }),
  };
}

function sleepRateForRange(
  snapshot: SleepSnapshot,
  startIso: string,
  endIso: string,
  todayIso: string
): number {
  if (!snapshot.hasSleepData) return 0;
  if (startIso === endIso) {
    const hours =
      startIso === todayIso && snapshot.todayHours != null
        ? snapshot.todayHours
        : asArray(snapshot?.dailyHours).find((row) => row.isoDate === startIso)?.hours;
    if (hours != null && Number.isFinite(hours)) {
      return Math.min(1, Math.max(0, hours / SLEEP_TARGET_HOURS));
    }
    return 0;
  }
  const days = asArray(snapshot?.dailyHours).filter((row) => row.isoDate >= startIso && row.isoDate <= endIso);
  if (days.length > 0) {
    const average = days.reduce((sum, row) => sum + row.hours, 0) / days.length;
    return Math.min(1, Math.max(0, average / SLEEP_TARGET_HOURS));
  }
  if (snapshot.weekHours != null && startIso >= addDaysIso(todayIso, -6)) {
    return Math.min(1, Math.max(0, snapshot.weekHours / (SLEEP_TARGET_HOURS * 7)));
  }
  return 0;
}

function sleepHoursLabelForRange(
  snapshot: SleepSnapshot,
  startIso: string,
  endIso: string,
  todayIso: string
): string {
  if (startIso === endIso) {
    const hours =
      startIso === todayIso && snapshot.todayHours != null
        ? snapshot.todayHours
        : asArray(snapshot?.dailyHours).find((row) => row.isoDate === startIso)?.hours;
    if (hours != null && Number.isFinite(hours)) return `${hours}h`;
    return snapshot.hasSleepData ? '0h' : '—';
  }
  const days = asArray(snapshot?.dailyHours).filter((row) => row.isoDate >= startIso && row.isoDate <= endIso);
  if (days.length > 0) {
    const total = days.reduce((sum, row) => sum + row.hours, 0);
    return `${Math.round(total * 10) / 10}h`;
  }
  if (snapshot.weekHours != null && startIso >= addDaysIso(todayIso, -6)) {
    return `${snapshot.weekHours}h`;
  }
  return snapshot.hasSleepData ? '0h' : '—';
}

function todayTimelineBuckets(now: Date): Array<{ label: string; endHour: number }> {
  const hour = now.getHours();
  const buckets = [
    { label: '12a', endHour: 0 },
    { label: '6a', endHour: 6 },
    { label: '12p', endHour: 12 },
    { label: '6p', endHour: 18 },
  ].filter((bucket) => bucket.endHour <= hour);
  buckets.push({ label: 'Now', endHour: Math.min(24, hour + 1) });
  return buckets.length >= 2 ? buckets : [{ label: '12a', endHour: 0 }, { label: 'Now', endHour: 24 }];
}

function createLinePath(points: Array<{ x: number; y: number }>): string {
  const valid = asArray(points).filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
  if (valid.length === 0) return '';
  let d = `M ${valid[0].x} ${valid[0].y}`;
  for (let i = 0; i < valid.length - 1; i += 1) {
    const p0 = valid[i];
    const p1 = valid[i + 1];
    const midX = p0.x + (p1.x - p0.x) * 0.5;
    d += ` C ${midX} ${p0.y}, ${midX} ${p1.y}, ${p1.x} ${p1.y}`;
  }
  return d;
}

function graphXs(count: number, left = 24, right = 348): number[] {
  if (count <= 1) return [(left + right) / 2];
  return Array.from({ length: count }, (_, i) => left + (i / (count - 1)) * (right - left));
}

const EMPTY_LINE_GRAPH = {
  title: 'Line graph',
  labels: [] as string[],
  xs: [] as number[],
  workPoints: [] as Array<{ x: number; y: number }>,
  selfPoints: [] as Array<{ x: number; y: number }>,
  sleepPoints: [] as Array<{ x: number; y: number }>,
  momentumPoints: [] as Array<{ x: number; y: number }>,
  showMomentum: false,
  workPath: '',
  selfPath: '',
  sleepPath: '',
  momentumPath: '',
};

const ReportViewInner: React.FC<ReportViewProps> = ({
  habits: habitsProp,
  evidenceList: evidenceProp,
  identityVoteCount,
  userId,
  isGuest = false,
  userEmail = '',
  userName = '',
  onOpenLedger,
  onOpenSettings,
  frictionAudits: frictionProp,
  onScroll,
  isDark = false,
  momentumScore = 0,
  momentumEvents: momentumProp,
  momentumHistory: momentumHistoryProp,
  completionEvents: completionProp,
  logs: logsProp,
  selectedDayIso: selectedDayIsoProp,
  onSelectDayIso,
  cycleDays = 7,
  cycleStartIso,
  isActive = true,
}) => {
  const habits = asArray(habitsProp);
  const activeHabitIds = useMemo(() => new Set(habits.map((habit) => habit.id)), [habits]);
  const evidenceList = asArray(evidenceProp).filter((item) => activeHabitIds.has(item.habitId));
  const frictionAudits = asArray(frictionProp).filter((item) => activeHabitIds.has(item.habitId));
  const momentumEvents = asArray(momentumProp ?? momentumHistoryProp).filter((event) => activeHabitIds.has(event.habitId));
  const completionEvents = asArray(completionProp ?? logsProp).filter((event) => activeHabitIds.has(event.habitId));
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('today');
  const [graphMode, setGraphMode] = useState<GraphMode>('rings');
  const [downloadSuccess, setDownloadSuccess] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [keystoneExpanded, setKeystoneExpanded] = useState(false);

  const [sleep, setSleep] = useState<SleepSnapshot>({
    hasSleepData: false,
    linked: false,
    permissionDenied: false,
    todayHours: null,
    weekHours: null,
    dailyHours: [],
  });

  const todayIso = toISODate();
  const selectedDayIso = selectedDayIsoProp || todayIso;
  const hasSleepData = sleep.hasSleepData;
  const replicaVotes = identityVoteCount ?? evidenceList.length;
  const windowRange = useMemo(() => {
    if (timeFilter === 'today') {
      const iso = selectedDayIso;
      return {
        startIso: iso,
        endIso: iso,
        title: iso === todayIso ? 'Today' : iso,
      };
    }
    if (timeFilter === 'week') return { startIso: addDaysIso(todayIso, -6), endIso: todayIso, title: 'Past 7 days' };
    if (timeFilter === 'month') return { startIso: addDaysIso(todayIso, -29), endIso: todayIso, title: 'Past 30 days' };
    return {
      startIso: earliestLogIso(momentumEvents, completionEvents, todayIso),
      endIso: todayIso,
      title: 'Momentum',
    };
  }, [timeFilter, todayIso, selectedDayIso, momentumEvents, completionEvents]);

  const cycleWindow = useMemo(() => {
    const fallbackStart = addDaysIso(todayIso, -(Math.max(1, Math.round(cycleDays)) - 1));
    const range = activeCycleWindow(cycleDays, cycleStartIso || fallbackStart, todayIso);
    return {
      ...range,
      title: `${Math.max(1, Math.round(cycleDays))}-day cycle`,
    };
  }, [cycleDays, cycleStartIso, todayIso]);

  /** Habit Performance follows the active date filter; Cycle Volume stays on the bowl cycle. */
  const performanceWindow = useMemo(() => {
    if (timeFilter === 'momentum') return cycleWindow;
    return windowRange;
  }, [timeFilter, windowRange, cycleWindow]);

  const habitPerformance = useMemo(
    () =>
      computeHabitCycleStats(
        habits,
        performanceWindow.startIso,
        performanceWindow.endIso,
        momentumEvents,
        completionEvents
      ),
    [habits, performanceWindow, momentumEvents, completionEvents]
  );

  const cycleVolume = useMemo(() => {
    const stats = computeHabitCycleStats(
      habits,
      cycleWindow.startIso,
      cycleWindow.endIso,
      momentumEvents,
      completionEvents
    );
    const target = stats.reduce((sum, row) => sum + row.targetDays, 0);
    const completed = stats.reduce((sum, row) => sum + row.completedDays, 0);
    const full = stats.reduce((sum, row) => sum + row.fullDays, 0);
    const fallback = stats.reduce((sum, row) => sum + row.fallbackDays, 0);
    const percent = target === 0 ? 0 : Math.round((completed / target) * 100);
    return { target, completed, full, fallback, percent, habitCount: stats.length };
  }, [habits, cycleWindow, momentumEvents, completionEvents]);

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

  useEffect(() => {
    let cancelled = false;
    void readSleepSnapshot(todayIso)
      .then((snapshot) => {
        if (cancelled) return;
        setSleep({
          ...snapshot,
          dailyHours: asArray(snapshot?.dailyHours),
        });
      })
      .catch(() => {
        if (!cancelled) {
          setSleep({
            hasSleepData: false,
            linked: false,
            permissionDenied: false,
            todayHours: null,
            weekHours: null,
            dailyHours: [],
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [todayIso]);

  const ledgerVoteCount = replicaVotes;

  const categoryStats = useMemo(() => {
    try {
      const { startIso, endIso } = windowRange;
      return {
        work: categoryRateFromLogs(habits, 'work', startIso, endIso, momentumEvents, completionEvents),
        self: categoryRateFromLogs(
          habits,
          'self_improvement',
          startIso,
          endIso,
          momentumEvents,
          completionEvents
        ),
        sleep: sleepRateForRange(sleep, startIso, endIso, todayIso),
      };
    } catch {
      return { work: 0, self: 0, sleep: 0 };
    }
  }, [habits, momentumEvents, completionEvents, windowRange, sleep, todayIso]);

  const lineGraphData = useMemo(() => {
    try {
    const toPoint = (pct: number, x: number, yMin: number, yMax: number) => ({
      x,
      y: Math.round((yMax - Math.min(1, Math.max(0, pct)) * (yMax - yMin)) * 10) / 10,
    });
    const sleepByIso = new Map<string, number>(asArray(sleep.dailyHours).map((row) => [row.isoDate, row.hours]));
    const { startIso, endIso, title } = windowRange;

    let labels: string[] = [];
    let workRates: number[] = [];
    let selfRates: number[] = [];
    let sleepRates: number[] = [];
    let momentumRates: number[] = [];

    if (timeFilter === 'today') {
      const now = new Date();
      const dayStart = startOfDay(now).getTime();
      const buckets = todayTimelineBuckets(now);
      labels = buckets.map((bucket) => bucket.label);
      workRates = buckets.map((bucket) => {
        const sliced = filterLogsThroughMs(todayIso, dayStart + bucket.endHour * 3_600_000, momentumEvents, completionEvents);
        return categoryRateFromLogs(habits, 'work', todayIso, todayIso, sliced.momentum, sliced.completions);
      });
      selfRates = buckets.map((bucket) => {
        const sliced = filterLogsThroughMs(todayIso, dayStart + bucket.endHour * 3_600_000, momentumEvents, completionEvents);
        return categoryRateFromLogs(habits, 'self_improvement', todayIso, todayIso, sliced.momentum, sliced.completions);
      });
      sleepRates = buckets.map(() =>
        sleep.todayHours == null ? 0 : sleep.todayHours / SLEEP_TARGET_HOURS
      );
    } else if (timeFilter === 'momentum') {
      const seriesIsos = isoRangeInclusive(startIso, endIso);
      labels = seriesIsos.map((iso, idx) =>
        idx === 0 || idx === seriesIsos.length - 1 || idx % Math.max(1, Math.ceil(seriesIsos.length / 6)) === 0
          ? iso.slice(5)
          : ''
      );
      momentumRates = seriesIsos.map(
        (iso) => calculateMomentumScore(momentumEvents, { asOf: endOfIsoDate(iso), habits }) / 100
      );
      workRates = seriesIsos.map((iso) =>
        categoryRateFromLogs(habits, 'work', iso, iso, momentumEvents, completionEvents)
      );
      selfRates = seriesIsos.map((iso) =>
        categoryRateFromLogs(habits, 'self_improvement', iso, iso, momentumEvents, completionEvents)
      );
      sleepRates = seriesIsos.map((iso) => (sleepByIso.get(iso) ?? 0) / SLEEP_TARGET_HOURS);
    } else {
      const seriesIsos = isoRangeInclusive(startIso, endIso);
      labels =
        timeFilter === 'week'
          ? seriesIsos.map((iso) => weekdayNarrowFromIso(iso))
          : seriesIsos.map((iso, idx) =>
              idx % 6 === 0 || idx === seriesIsos.length - 1 ? iso.slice(5) : ''
            );
      workRates = seriesIsos.map((iso) =>
        categoryRateFromLogs(habits, 'work', iso, iso, momentumEvents, completionEvents)
      );
      selfRates = seriesIsos.map((iso) =>
        categoryRateFromLogs(habits, 'self_improvement', iso, iso, momentumEvents, completionEvents)
      );
      sleepRates = seriesIsos.map((iso) => (sleepByIso.get(iso) ?? 0) / SLEEP_TARGET_HOURS);
    }

    const xs = graphXs(Math.max(labels.length, 1));
    const workPoints = xs.map((x, idx) => toPoint(workRates[idx] ?? 0, x, 48, 122));
    const selfPoints = xs.map((x, idx) => toPoint(selfRates[idx] ?? 0, x, 72, 140));
    const sleepPoints = xs.map((x, idx) => toPoint(sleepRates[idx] ?? 0, x, 22, 98));
    const momentumPoints = xs.map((x, idx) => toPoint(momentumRates[idx] ?? 0, x, 36, 132));

    return {
      title,
      labels,
      xs,
      workPoints,
      selfPoints,
      sleepPoints,
      momentumPoints,
      showMomentum: timeFilter === 'momentum',
      workPath: createLinePath(workPoints),
      selfPath: createLinePath(selfPoints),
      sleepPath: createLinePath(sleepPoints),
      momentumPath: createLinePath(momentumPoints),
    };
    } catch {
      return EMPTY_LINE_GRAPH;
    }
  }, [
    habits,
    sleep.dailyHours,
    sleep.todayHours,
    timeFilter,
    todayIso,
    momentumEvents,
    completionEvents,
    windowRange,
  ]);

  const rollingWeekIsos = useMemo(() => isoRangeInclusive(addDaysIso(todayIso, -6), todayIso), [todayIso]);
  const frictionCutoff = startOfIsoMs(windowRange.startIso);
  const frictionCutoffIso = windowRange.startIso;

  const windowAudits = useMemo(
    () =>
      asArray(frictionAudits).filter((audit) => {
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
        evidenceList,
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
  /** Clamp 0–1 rate → SVG circle stroke props (dashoffset form; avoids NaN / empty arcs). */
  const ringStroke = (radius: number, rate: number) => {
    const circumference = 2 * Math.PI * radius;
    const t = Number.isFinite(rate) ? Math.min(1, Math.max(0, rate)) : 0;
    return {
      circumference,
      // offset = C - (percent/100)*C  with percent = t*100  ⇒  C * (1 - t)
      dashOffset: circumference * (1 - t),
    };
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

  const sleepHoursLabel = sleepHoursLabelForRange(sleep, windowRange.startIso, windowRange.endIso, todayIso);
  const mixPercent = Math.round(
    ((hasSleepData ? categoryStats.work + categoryStats.self + categoryStats.sleep : categoryStats.work + categoryStats.self) /
      (hasSleepData ? 3 : 2)) *
      100
  );

  return (
    <div
      id="report-screen"
      onScroll={onScroll}
      className={`absolute inset-0 px-4.5 ${SCREEN_INSET_CLASS} pb-28 space-y-4 overflow-y-auto overscroll-y-contain no-scrollbar select-none max-w-md mx-auto`}
    >
      <ScreenHeader
        title="Report"
        subtitle="Your progress, in perspective."
        titleClassName="text-[32px] font-black text-slate-900 dark:text-white tracking-tight leading-none"
        onOpenSettings={onOpenSettings}
        actions={
          <motion.button
            id="download-report-csv-btn"
            type="button"
            whileTap={exporting ? undefined : tapPress}
            onClick={() => void handleDownloadCSV()}
            disabled={exporting}
            className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl p-2 px-3 flex items-center space-x-2.5 shadow-xs hover:border-slate-300 dark:hover:border-slate-700 cursor-pointer disabled:opacity-60"
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
          </motion.button>
        }
      />

      <DaySelector
        selectedIso={selectedDayIso}
        onSelectIso={(iso) => {
          onSelectDayIso?.(iso);
          setTimeFilter('today');
        }}
        isDark={isDark}
      />

      <section data-tour="report-rings" className="relative w-full flex flex-col items-center justify-center">
        <div className="relative w-full min-h-[230px] flex items-center justify-center">
          <AnimatePresence mode="wait" initial={false}>
            {graphMode === 'rings' ? (
              <motion.div
                key={`rings-${timeFilter}`}
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ duration: 0.22, ease: VISUALIZER_EASE }}
                className="relative w-full max-w-[340px] h-[210px] flex items-center justify-center transform-gpu"
              >
                <svg className="w-full h-full overflow-visible" viewBox="0 0 320 220">
                  <circle cx={cx} cy={cy} r={80} fill="none" stroke={isDark ? '#334155' : '#F1F5F9'} strokeWidth="1" strokeDasharray="3 3" />
                  {ringLayout.map((ring) => {
                    const { circumference, dashOffset } = ringStroke(ring.r, ring.rate);
                    return (
                    <g key={ring.key}>
                      <circle cx={cx} cy={cy} r={ring.r} fill="none" stroke={isDark ? '#334155' : '#F1F5F9'} strokeWidth={strokeW} />
                      <circle
                        cx={cx}
                        cy={cy}
                        r={ring.r}
                        fill="none"
                        stroke={ring.color}
                        strokeWidth={strokeW}
                        strokeDasharray={circumference}
                        strokeDashoffset={dashOffset}
                        strokeLinecap="round"
                        transform={`rotate(-90 ${cx} ${cy})`}
                      />
                    </g>
                    );
                  })}
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
              </motion.div>
            ) : (
              <motion.div
                key={`line-${timeFilter}`}
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ duration: 0.22, ease: VISUALIZER_EASE }}
                className="w-full bg-white dark:bg-slate-900 rounded-2xl p-3 border border-slate-200/90 dark:border-slate-800 shadow-xs space-y-2 transform-gpu"
              >
                <div className="flex items-center justify-between text-xs px-1">
                  <span className="font-bold text-slate-800 dark:text-white">{lineGraphData.title}</span>
                  <span className="text-emerald-700 dark:text-blue-400 font-bold tabular-nums">
                    {timeFilter === 'momentum' ? momentumScore : mixPercent}
                    {timeFilter === 'momentum' ? '' : '%'}
                  </span>
                </div>
                <svg className="w-full h-[155px] overflow-visible" viewBox="0 0 375 162">
                  <line x1="16" y1="36" x2="360" y2="36" stroke={isDark ? '#334155' : '#F1F5F9'} strokeWidth="1" strokeDasharray="3 3" />
                  <line x1="16" y1="78" x2="360" y2="78" stroke={isDark ? '#334155' : '#F1F5F9'} strokeWidth="1" strokeDasharray="3 3" />
                  <line x1="16" y1="120" x2="360" y2="120" stroke={isDark ? '#334155' : '#F1F5F9'} strokeWidth="1" strokeDasharray="3 3" />
                  {(lineGraphData.labels || []).map((label, idx) => (
                    <text
                      key={`${label}-${idx}`}
                      x={lineGraphData.xs[idx]}
                      y={155}
                      textAnchor="middle"
                      fill={isDark ? '#64748b' : '#94A3B8'}
                      className="text-[9.5px] font-bold"
                    >
                      {label}
                    </text>
                  ))}
                  {hasSleepData && !lineGraphData.showMomentum && (
                    <path d={lineGraphData.sleepPath} fill="none" stroke={isDark ? '#1d4ed8' : '#166534'} strokeWidth="2.5" strokeLinecap="round" />
                  )}
                  {lineGraphData.showMomentum ? (
                    <path d={lineGraphData.momentumPath} fill="none" stroke={isDark ? '#60a5fa' : '#15803d'} strokeWidth="2.8" strokeLinecap="round" />
                  ) : (
                    <>
                      <path d={lineGraphData.workPath} fill="none" stroke={isDark ? '#3b82f6' : '#23C15D'} strokeWidth="2.5" strokeLinecap="round" />
                      <path d={lineGraphData.selfPath} fill="none" stroke={isDark ? '#93c5fd' : '#4ADE80'} strokeWidth="2.5" strokeLinecap="round" />
                    </>
                  )}
                  {(lineGraphData.showMomentum
                    ? lineGraphData.momentumPoints || []
                    : lineGraphData.workPoints || []
                  ).map((point, idx) => (
                    <circle
                      key={`dot-${idx}`}
                      cx={point.x}
                      cy={point.y}
                      r={lineGraphData.labels.length <= 8 ? 2.4 : 1.6}
                      fill={isDark ? '#60a5fa' : '#15803d'}
                    />
                  ))}
                </svg>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        {hasSleepData && graphMode === 'rings' && (
          <p className="text-[11.5px] text-slate-500 dark:text-slate-400 -mt-2">
            Sleep logged {sleepHoursLabel} · target {SLEEP_TARGET_HOURS}h
          </p>
        )}
        <div className="flex justify-end w-full pt-1">
          <motion.button
            id="switch-graph-btn"
            type="button"
            whileTap={tapPress}
            onClick={() => setGraphMode((prev) => (prev === 'rings' ? 'line' : 'rings'))}
            className="px-3.5 py-1.5 bg-white dark:bg-slate-900 rounded-xl border border-slate-200/90 dark:border-slate-800 shadow-xs flex items-center space-x-2 text-[12px] font-semibold text-slate-800 dark:text-slate-200 hover:border-slate-300 dark:hover:border-slate-700 cursor-pointer"
          >
            <svg className="w-4 h-4 text-slate-800 dark:text-slate-200" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
            </svg>
            <span>Switch Graph</span>
          </motion.button>
        </div>
      </section>

      <section>
        <motion.button
          type="button"
          whileTap={tapPress}
          id="identity-evidence-ledger-card"
          data-tour="report-ledger"
          onClick={onOpenLedger}
          className="w-full bg-white dark:bg-slate-900 rounded-2xl p-3.5 px-4 border border-slate-100 dark:border-slate-800 shadow-xs flex items-center justify-between cursor-pointer hover:border-slate-200 dark:hover:border-slate-700"
        >
          <span className="text-[14.5px] font-bold text-slate-800 dark:text-white tracking-tight">Identity Evidence ledger</span>
          <span className="text-[14.5px] font-bold text-slate-800 dark:text-white tabular-nums">{ledgerVoteCount} votes</span>
        </motion.button>
      </section>

      <section>
        <button
          type="button"
          id="keystone-habits-row"
          aria-expanded={keystoneExpanded}
          onClick={() => setKeystoneExpanded((prev) => !prev)}
          className={`w-full rounded-2xl p-3.5 px-4 border shadow-xs text-left transition ${
            keystones.length > 0
              ? 'bg-white dark:bg-slate-900 border-emerald-200/90 dark:border-blue-500/40 shadow-emerald-500/20 dark:shadow-blue-500/25 shadow-lg ring-1 ring-emerald-400/25 dark:ring-blue-400/30'
              : 'bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-800'
          }`}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[14.5px] font-bold text-slate-800 dark:text-white tracking-tight">Keystone</span>
                {keystones.length > 0 && (
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 dark:bg-blue-400 shadow-md shadow-emerald-500/70 dark:shadow-blue-500/70" />
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

      <section data-tour="report-momentum" className="bg-[#EFF3F6] dark:bg-slate-800/80 p-1 rounded-2xl flex items-center">
        {(['today', 'week', 'month', 'momentum'] as TimeFilter[]).map((tab) => {
          const isActive = timeFilter === tab;
          const label = tab === 'today' ? 'Today' : tab === 'week' ? 'Week' : tab === 'month' ? 'Month' : '⚡ Momentum';
          return (
            <motion.button
              key={tab}
              id={`filter-tab-${tab}`}
              type="button"
              whileTap={tapPress}
              onClick={() => setTimeFilter(tab)}
              className={`relative flex-1 py-1.5 text-[12px] sm:text-[13px] font-bold rounded-xl cursor-pointer text-center ${
                isActive
                  ? 'text-emerald-800 dark:text-white'
                  : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white'
              }`}
            >
              {isActive && (
                <motion.div
                  layoutId="report-filter-pill"
                  className="absolute inset-0 bg-white dark:bg-blue-600 rounded-xl shadow-xs"
                  transition={{ duration: 0.2, ease: 'easeOut' }}
                />
              )}
              <span className="relative z-10">{label}</span>
            </motion.button>
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
            <p className="text-[11.5px] text-slate-400 dark:text-slate-400 font-normal">You vs. Your Own Past</p>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between px-0.5">
            <span className="text-xs font-bold text-slate-800 dark:text-white">{windowRange.title} mix</span>
            <span className="text-xs font-bold text-emerald-700 dark:text-blue-400 tabular-nums">
              {timeFilter === 'momentum' ? momentumScore : `${mixPercent}%`}
            </span>
          </div>
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
                      className="w-8 rounded-t-lg bg-[#23C15D] dark:bg-blue-500 transition-[height] duration-300 ease-out"
                    />
                  </div>
                  <span className="mt-2 text-[11.5px] font-semibold text-slate-700 dark:text-slate-300">{col.label}</span>
                </div>
              );
            })}
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
            {rollingWeekIsos.map((iso) => {
              const work = categoryRateFromLogs(habits, 'work', iso, iso, momentumEvents, completionEvents);
              const self = categoryRateFromLogs(
                habits,
                'self_improvement',
                iso,
                iso,
                momentumEvents,
                completionEvents
              );
              const sleepRate = sleepRateForRange(sleep, iso, iso, todayIso);
              const parts = hasSleepData ? [work, self, sleepRate] : [work, self];
              const rate = parts.reduce((sum, value) => sum + value, 0) / parts.length;
              return (
                <div key={iso} className="flex flex-col items-center">
                  <span className="text-[10.5px] font-bold text-slate-500 dark:text-slate-400 mb-1">
                    {weekdayShortFromIso(iso).slice(0, 2)}
                  </span>
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center text-[11px] font-extrabold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200">
                    {`${Math.round(rate * 100)}%`}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <p className="text-[11.5px] text-slate-400 dark:text-slate-500 font-medium">Friction reasons from habit logs</p>
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

      <section
        data-tour="report-cycle-volume"
        className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-100 dark:border-slate-800 shadow-xs space-y-3"
      >
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-[15px] font-extrabold text-slate-900 dark:text-white tracking-tight">
              Cycle Volume
            </h2>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              {cycleWindow.title} · {cycleWindow.startIso} → {cycleWindow.endIso}
            </p>
          </div>
          <span className="text-[15px] font-extrabold tabular-nums text-emerald-700 dark:text-blue-400">
            {cycleVolume.percent}%
          </span>
        </div>
        <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
          <div
            className="h-full rounded-full bg-emerald-500 dark:bg-blue-500 transition-[width] duration-300"
            style={{ width: `${Math.min(100, Math.max(0, cycleVolume.percent))}%` }}
          />
        </div>
        <div className="flex flex-wrap gap-1.5 text-[11px] font-semibold tabular-nums">
          <span className="px-2 py-0.5 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200">
            {cycleVolume.completed}/{cycleVolume.target} days
          </span>
          <span className="px-2 py-0.5 rounded-lg bg-accent text-accent-fg dark:bg-blue-600 dark:text-white">
            {cycleVolume.full} full
          </span>
                      <span className="px-2 py-0.5 rounded-lg bg-orange-700 text-white dark:bg-orange-600">
            {cycleVolume.fallback} fallback
          </span>
          <span className="px-2 py-0.5 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
            {cycleVolume.habitCount} habits
          </span>
        </div>
      </section>

      <section
        data-tour="report-habit-performance"
        className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-100 dark:border-slate-800 shadow-xs space-y-3"
      >
        <div>
          <h2 className="text-[15px] font-extrabold text-slate-900 dark:text-white tracking-tight">
            Habit Performance
          </h2>
        </div>
        {habitPerformance.length === 0 ? (
          <p className="text-[12.5px] text-slate-500 dark:text-slate-400 leading-relaxed">
            No active habits yet.
          </p>
        ) : (
          <ul className="space-y-2">
            {habitPerformance.map((row) => (
              <li
                key={row.habit.id}
                className="rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/50 px-3 py-2.5 space-y-1.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 text-[13px] font-bold text-slate-900 dark:text-white truncate">
                    {row.habit.name}
                  </p>
                  <span className="shrink-0 text-[11px] font-bold tabular-nums text-slate-700 dark:text-slate-200">
                    {row.completedDays}/{row.targetDays} · {row.percent}%
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-slate-200/80 dark:bg-slate-700 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-emerald-500 dark:bg-blue-500 transition-[width] duration-300"
                    style={{ width: `${Math.min(100, Math.max(0, row.percent))}%` }}
                  />
                </div>
                <p className="text-[10.5px] font-medium tabular-nums text-slate-500 dark:text-slate-400">
                  {row.fullDays} full · {row.fallbackDays} fallback
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <FriendsFeed
        userId={userId}
        isGuest={isGuest}
        userEmail={userEmail}
        userName={userName}
        variant="full"
        mode="roster"
        cycleDays={cycleDays}
      />
    </div>
  );
};

export const ReportView = React.memo(ReportViewInner);
