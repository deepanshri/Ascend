import React, { useState, useMemo } from 'react';
import { Habit, IdentityEvidence, FrictionAudit } from '../types';
import { getTodayDayIndex, getWeekdayShort } from '../utils/dates';

interface ReportViewProps {
  habits: Habit[];
  evidenceList: IdentityEvidence[];
  onOpenLedger: () => void;
  examShieldActive: boolean;
  onToggleExamShield: () => void;
  frictionAudits: FrictionAudit[];
  onAddFrictionNote: (habitName: string, note: string) => void;
  onScroll?: (e: React.UIEvent<HTMLDivElement>) => void;
  isDark?: boolean;
  momentumScore?: number;
}

type TimeFilter = 'today' | 'week' | 'month' | 'momentum';
type GraphMode = 'concentric' | 'trajectory';

export const ReportView: React.FC<ReportViewProps> = ({
  habits,
  evidenceList,
  onOpenLedger,
  examShieldActive,
  onToggleExamShield,
  frictionAudits,
  onAddFrictionNote,
  onScroll,
  isDark = false,
  momentumScore = 63,
}) => {
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('today');
  const [graphMode, setGraphMode] = useState<GraphMode>('concentric');
  const [downloadSuccess, setDownloadSuccess] = useState(false);
  const [showAnalysisMenu, setShowAnalysisMenu] = useState(false);
  const [showFrictionModal, setShowFrictionModal] = useState(false);
  const [newNoteHabit, setNewNoteHabit] = useState('');
  const [newNoteText, setNewNoteText] = useState('');

  // Category completion rates based on current habits & events
  const categoryStats = useMemo(() => {
    const workHabits = habits.filter((h) => h.category === 'work');
    const selfHabits = habits.filter((h) => h.category === 'self_improvement');
    const sleepHabits = selfHabits;

    const getRate = (list: Habit[]) => {
      if (list.length === 0) return 0.75;
      const totalChecks = list.reduce((sum, h) => {
        const full = h.days.filter(Boolean).length;
        const micro = (h.microDays || []).filter(Boolean).length * 0.5;
        return sum + full + micro;
      }, 0);
      const maxChecks = list.length * 7;
      return Math.min(0.95, Math.max(0.35, totalChecks / maxChecks));
    };

    return {
      work: getRate(workHabits),
      sleep: getRate(sleepHabits),
      self: getRate(selfHabits),
    };
  }, [habits]);

  const todayIndex = getTodayDayIndex();

  // Habits accomplished vs total habits
  const accomplishedHabitsCount = useMemo(() => {
    return habits.filter((h) => Boolean(h.days?.[todayIndex])).length;
  }, [habits, todayIndex]);
  const totalHabitsCount = habits.length;

  // Trajectory Multi-Line Graph Data (matches the 3 concentric rings)
  const lineGraphData = useMemo(() => {
    const workHabits = habits.filter((h) => h.category === 'work');
    const selfHabits = habits.filter((h) => h.category === 'self_improvement');
    const sleepHabits = selfHabits;

    // X coordinates across 7 days
    const xs = [24, 54, 84, 114, 144, 176, 208];

    // Default trend trajectories
    const defaultSleep = [64, 70, 74, 80, 78, 85, 88];
    const defaultWork = [48, 55, 66, 75, 72, 80, 84];
    const defaultSelf = [40, 46, 54, 62, 65, 70, 75];

    const computePoints = (
      habitList: Habit[],
      defaults: number[],
      yMin: number,
      yMax: number
    ) => {
      return xs.map((x, dayIdx) => {
        let pct = defaults[dayIdx] / 100;
        if (habitList.length > 0) {
          const full = habitList.filter((h) => h.days?.[dayIdx]).length;
          const micro = (habitList.filter((h) => h.microDays?.[dayIdx]).length || 0) * 0.5;
          const dayPct = (full + micro) / habitList.length;
          pct = Math.min(0.96, Math.max(0.25, dayPct * 0.65 + (defaults[dayIdx] / 100) * 0.35));
        }
        const y = yMax - pct * (yMax - yMin);
        return { x, y: Math.round(y * 10) / 10 };
      });
    };

    const sleepPoints = computePoints(sleepHabits, defaultSleep, 22, 98);
    const workPoints = computePoints(workHabits, defaultWork, 48, 122);
    const selfPoints = computePoints(selfHabits, defaultSelf, 72, 140);

    const createPath = (pts: { x: number; y: number }[]) => {
      if (pts.length === 0) return '';
      let d = `M ${pts[0].x} ${pts[0].y}`;
      for (let i = 0; i < pts.length - 1; i++) {
        const p0 = pts[i];
        const p1 = pts[i + 1];
        const cp1x = p0.x + (p1.x - p0.x) * 0.5;
        const cp1y = p0.y;
        const cp2x = p1.x - (p1.x - p0.x) * 0.5;
        const cp2y = p1.y;
        d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p1.x} ${p1.y}`;
      }
      return d;
    };

    return {
      sleepPoints,
      workPoints,
      selfPoints,
      sleepPath: createPath(sleepPoints),
      workPath: createPath(workPoints),
      selfPath: createPath(selfPoints),
    };
  }, [habits]);

  // Improvements data for Analysis section (matches the design)
  const analysisData = useMemo(() => {
    if (timeFilter === 'today') {
      return [
        { label: 'Work', prev: 58, curr: 82, delta: 24 },
        { label: 'Sleep', prev: 64, curr: 82, delta: 18 },
        { label: 'Self-Improvement', prev: 60, curr: 92, delta: 32 },
        { label: 'Overall', prev: 61, curr: 88, delta: 27 },
      ];
    }
    if (timeFilter === 'week') {
      return [
        { label: 'Work', prev: 62, curr: 85, delta: 23 },
        { label: 'Sleep', prev: 70, curr: 84, delta: 14 },
        { label: 'Self-Improvement', prev: 65, curr: 90, delta: 25 },
        { label: 'Overall', prev: 66, curr: 86, delta: 20 },
      ];
    }
    // month
    return [
      { label: 'Work', prev: 54, curr: 86, delta: 32 },
      { label: 'Sleep', prev: 60, curr: 82, delta: 22 },
      { label: 'Self-Improvement', prev: 55, curr: 94, delta: 39 },
      { label: 'Overall', prev: 56, curr: 87, delta: 31 },
    ];
  }, [timeFilter]);

  // CSV Exporter
  const handleDownloadCSV = () => {
    setDownloadSuccess(true);
    setTimeout(() => setDownloadSuccess(false), 2400);

    const headers = ['Category', 'Previous_Week_Score', 'This_Week_Score', 'Improvement_Pct', 'Active_Habits', 'Evidence_Votes'];
    const rows = analysisData.map((item) => [
      `"${item.label}"`,
      item.prev,
      item.curr,
      `"+${item.delta}%"`,
      habits.length,
      evidenceList.length,
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `ascend-report-${timeFilter}-${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleNoteSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNoteText.trim()) return;
    onAddFrictionNote(newNoteHabit || habits[0]?.name || 'Routine', newNoteText.trim());
    setNewNoteText('');
    setNewNoteHabit('');
    setShowFrictionModal(false);
  };

  // Concentric Rings Geometry
  const cx = 160;
  const cy = 110;
  const outerR = 56;
  const middleR = 43;
  const innerR = 30;
  const strokeW = 7.5;

  const getArc = (radius: number, percent: number) => {
    const circumference = 2 * Math.PI * radius;
    const strokeDasharray = `${circumference * percent} ${circumference * (1 - percent)}`;
    return { circumference, strokeDasharray };
  };

  const outerArc = getArc(outerR, 0.72);
  const middleArc = getArc(middleR, 0.84);
  const innerArc = getArc(innerR, 0.65);

  return (
    <div id="report-screen" onScroll={onScroll} className="absolute inset-0 px-4.5 pt-[calc(env(safe-area-inset-top)+4.25rem)] pb-28 space-y-4 overflow-y-auto overscroll-y-contain select-none max-w-md mx-auto">
      {/* Top Header Section */}
      <section className="flex items-start justify-between pt-1">
        <div>
          <h1 className="text-[32px] font-black text-slate-900 dark:text-white tracking-tight leading-none">
            Report
          </h1>
          <p className="text-[13px] text-slate-500 dark:text-slate-400 font-normal mt-1">
            Your progress, in perspective.
          </p>
        </div>

        {/* Download Report (CSV) Button */}
        <button
          id="download-report-csv-btn"
          type="button"
          onClick={handleDownloadCSV}
          className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl p-2 px-3 flex items-center space-x-2.5 shadow-xs hover:border-slate-300 dark:hover:border-slate-700 active:scale-95 transition cursor-pointer"
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
              {downloadSuccess ? 'Exported' : 'Download'}
            </div>
            <div className="text-[11.5px] font-bold text-slate-900 dark:text-white">Report</div>
            <div className="text-[9.5px] text-slate-400 dark:text-slate-500 font-medium">(CSV)</div>
          </div>
        </button>
      </section>

      {/* Upper Graph Section */}
      <section className="relative w-full">
        {graphMode === 'concentric' ? (
          <div className="relative w-full flex flex-col items-center justify-center">
            {/* SVG Concentric Donut / Radial Ring Visualization */}
            <div className="relative w-full max-w-[340px] h-[210px] flex items-center justify-center">
              <svg className="w-full h-full overflow-visible" viewBox="0 0 320 220">
                {/* Subtle outer guideline circles */}
                <circle cx={cx} cy={cy} r={80} fill="none" stroke={isDark ? '#334155' : '#F1F5F9'} strokeWidth="1" strokeDasharray="3 3" />
                <circle cx={cx} cy={cy} r={outerR} fill="none" stroke={isDark ? '#334155' : '#F1F5F9'} strokeWidth={strokeW} />
                <circle cx={cx} cy={cy} r={middleR} fill="none" stroke={isDark ? '#334155' : '#F1F5F9'} strokeWidth={strokeW} />
                <circle cx={cx} cy={cy} r={innerR} fill="none" stroke={isDark ? '#334155' : '#F1F5F9'} strokeWidth={strokeW} />

                {/* Outer Ring: Sleep */}
                <circle
                  cx={cx}
                  cy={cy}
                  r={outerR}
                  fill="none"
                  stroke={isDark ? '#1d4ed8' : '#166534'}
                  strokeWidth={strokeW}
                  strokeDasharray={outerArc.strokeDasharray}
                  strokeLinecap="round"
                  transform={`rotate(-90 ${cx} ${cy})`}
                />

                {/* Middle Ring: Work / Academic */}
                <circle
                  cx={cx}
                  cy={cy}
                  r={middleR}
                  fill="none"
                  stroke={isDark ? '#3b82f6' : '#23C15D'}
                  strokeWidth={strokeW}
                  strokeDasharray={middleArc.strokeDasharray}
                  strokeLinecap="round"
                  transform={`rotate(-90 ${cx} ${cy})`}
                />

                {/* Inner Ring: Self-Improvement */}
                <circle
                  cx={cx}
                  cy={cy}
                  r={innerR}
                  fill="none"
                  stroke={isDark ? '#93c5fd' : '#4ADE80'}
                  strokeWidth={strokeW}
                  strokeDasharray={innerArc.strokeDasharray}
                  strokeLinecap="round"
                  transform={`rotate(-90 ${cx} ${cy})`}
                />

                {/* --- CALLOUT GUIDELINES & POINTER LABELS --- */}

                {/* Callout 1: Sleep (Top Right) */}
                <g className="cursor-default">
                  <polyline
                    points={`${cx + 38},${cy - 42} ${cx + 52},${cy - 52} ${cx + 70},${cy - 52}`}
                    fill="none"
                    stroke={isDark ? '#64748b' : '#CBD5E1'}
                    strokeWidth="1.2"
                  />
                  <circle cx={cx + 76} cy={cy - 52} r={3} fill={isDark ? '#1d4ed8' : '#166534'} />
                  <text
                    x={cx + 84}
                    y={cy - 48}
                    fill={isDark ? '#f8fafc' : '#1e293b'}
                    className="text-[12px] font-semibold"
                    textAnchor="start"
                  >
                    Sleep
                  </text>
                </g>

                {/* Callout 2: Work / Academic (Left) */}
                <g className="cursor-default">
                  <polyline
                    points={`${cx - 43},${cy - 4} ${cx - 75},${cy - 4}`}
                    fill="none"
                    stroke={isDark ? '#64748b' : '#CBD5E1'}
                    strokeWidth="1.2"
                  />
                  <circle cx={cx - 81} cy={cy - 4} r={3} fill={isDark ? '#2563eb' : '#0B5938'} />
                  <text
                    x={cx - 90}
                    y={cy - 12}
                    fill={isDark ? '#f8fafc' : '#1e293b'}
                    className="text-[11.5px] font-semibold"
                    textAnchor="end"
                  >
                    Work /
                  </text>
                  <text
                    x={cx - 90}
                    y={cy + 3}
                    fill={isDark ? '#f8fafc' : '#1e293b'}
                    className="text-[11.5px] font-semibold"
                    textAnchor="end"
                  >
                    Academic
                  </text>
                </g>

                {/* Callout 3: Self-Improvement (Right) */}
                <g className="cursor-default">
                  <polyline
                    points={`${cx + 30},${cy + 8} ${cx + 72},${cy + 8}`}
                    fill="none"
                    stroke={isDark ? '#64748b' : '#CBD5E1'}
                    strokeWidth="1.2"
                  />
                  <circle cx={cx + 78} cy={cy + 8} r={3} fill={isDark ? '#3b82f6' : '#23C15D'} />
                  <text
                    x={cx + 86}
                    y={cy + 12}
                    fill={isDark ? '#f8fafc' : '#1e293b'}
                    className="text-[12px] font-semibold"
                    textAnchor="start"
                  >
                    Self-Improvement
                  </text>
                </g>
              </svg>
            </div>
          </div>
        ) : (
          /* Alternative Graph: 3-Line Trajectory Graph matching the 3 Concentric Rings */
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-3 border border-slate-200/90 dark:border-slate-800 shadow-xs space-y-2 animate-in fade-in duration-200">
            <div className="flex items-center justify-between text-xs px-1">
              <span className="font-bold text-slate-800 dark:text-white">Momentum Trajectory</span>
              <span className="text-emerald-700 dark:text-blue-400 font-bold">
                {Math.round(((categoryStats.work + categoryStats.sleep + categoryStats.self) / 3) * 100)}% Consistency
              </span>
            </div>
            <svg className="w-full h-[155px] overflow-visible" viewBox="0 0 375 162">
              {/* Subtle background horizontal guidelines */}
              <line x1="16" y1="36" x2="216" y2="36" stroke={isDark ? '#334155' : '#F1F5F9'} strokeWidth="1" strokeDasharray="3 3" />
              <line x1="16" y1="78" x2="216" y2="78" stroke={isDark ? '#334155' : '#F1F5F9'} strokeWidth="1" strokeDasharray="3 3" />
              <line x1="16" y1="120" x2="216" y2="120" stroke={isDark ? '#334155' : '#F1F5F9'} strokeWidth="1" strokeDasharray="3 3" />

              {/* Day markers along the bottom */}
              {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, idx) => {
                const xs = [24, 54, 84, 114, 144, 176, 208];
                return (
                  <text
                    key={idx}
                    x={xs[idx]}
                    y={155}
                    textAnchor="middle"
                    fill={isDark ? '#64748b' : '#94A3B8'}
                    className="text-[9.5px] font-bold select-none"
                  >
                    {day}
                  </text>
                );
              })}

              {/* Line 1: Sleep (matching Outer Ring) */}
              <path
                d={lineGraphData.sleepPath}
                fill="none"
                stroke={isDark ? '#1d4ed8' : '#166534'}
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle
                cx={lineGraphData.sleepPoints[6].x}
                cy={lineGraphData.sleepPoints[6].y}
                r={3.5}
                fill={isDark ? '#1d4ed8' : '#166534'}
                stroke="#FFF"
                strokeWidth="1.5"
              />
              {/* Callout: Sleep with guide line, dot, and text label */}
              <g className="cursor-default">
                <polyline
                  points={`${lineGraphData.sleepPoints[6].x},${lineGraphData.sleepPoints[6].y} 228,${lineGraphData.sleepPoints[6].y - 5} 244,${lineGraphData.sleepPoints[6].y - 5}`}
                  fill="none"
                  stroke={isDark ? '#64748b' : '#CBD5E1'}
                  strokeWidth="1.2"
                />
                <circle
                  cx={250}
                  cy={lineGraphData.sleepPoints[6].y - 5}
                  r={3}
                  fill={isDark ? '#1d4ed8' : '#166534'}
                />
                <text
                  x={258}
                  y={lineGraphData.sleepPoints[6].y - 1}
                  fill={isDark ? '#f8fafc' : '#1e293b'}
                  className="text-[12px] font-semibold"
                  textAnchor="start"
                >
                  Sleep
                </text>
              </g>

              {/* Line 2: Work / Academic (matching Middle Ring) */}
              <path
                d={lineGraphData.workPath}
                fill="none"
                stroke={isDark ? '#3b82f6' : '#23C15D'}
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle
                cx={lineGraphData.workPoints[6].x}
                cy={lineGraphData.workPoints[6].y}
                r={3.5}
                fill={isDark ? '#3b82f6' : '#23C15D'}
                stroke="#FFF"
                strokeWidth="1.5"
              />
              {/* Callout: Work / Academic with guide line, dot, and text label */}
              <g className="cursor-default">
                <polyline
                  points={`${lineGraphData.workPoints[6].x},${lineGraphData.workPoints[6].y} 228,${lineGraphData.workPoints[6].y} 242,${lineGraphData.workPoints[6].y}`}
                  fill="none"
                  stroke={isDark ? '#64748b' : '#CBD5E1'}
                  strokeWidth="1.2"
                />
                <circle
                  cx={248}
                  cy={lineGraphData.workPoints[6].y}
                  r={3}
                  fill={isDark ? '#2563eb' : '#0B5938'}
                />
                <text
                  x={256}
                  y={lineGraphData.workPoints[6].y - 6}
                  fill={isDark ? '#f8fafc' : '#1e293b'}
                  className="text-[11.5px] font-semibold"
                  textAnchor="start"
                >
                  Work /
                </text>
                <text
                  x={256}
                  y={lineGraphData.workPoints[6].y + 7}
                  fill={isDark ? '#f8fafc' : '#1e293b'}
                  className="text-[11.5px] font-semibold"
                  textAnchor="start"
                >
                  Academic
                </text>
              </g>

              {/* Line 3: Self-Improvement (matching Inner Ring) */}
              <path
                d={lineGraphData.selfPath}
                fill="none"
                stroke={isDark ? '#93c5fd' : '#4ADE80'}
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle
                cx={lineGraphData.selfPoints[6].x}
                cy={lineGraphData.selfPoints[6].y}
                r={3.5}
                fill={isDark ? '#93c5fd' : '#4ADE80'}
                stroke="#FFF"
                strokeWidth="1.5"
              />
              {/* Callout: Self-Improvement with guide line, dot, and text label */}
              <g className="cursor-default">
                <polyline
                  points={`${lineGraphData.selfPoints[6].x},${lineGraphData.selfPoints[6].y} 228,${lineGraphData.selfPoints[6].y + 5} 242,${lineGraphData.selfPoints[6].y + 5}`}
                  fill="none"
                  stroke={isDark ? '#64748b' : '#CBD5E1'}
                  strokeWidth="1.2"
                />
                <circle
                  cx={248}
                  cy={lineGraphData.selfPoints[6].y + 5}
                  r={3}
                  fill={isDark ? '#3b82f6' : '#23C15D'}
                />
                <text
                  x={256}
                  y={lineGraphData.selfPoints[6].y + 9}
                  fill={isDark ? '#f8fafc' : '#1e293b'}
                  className="text-[11.5px] font-semibold"
                  textAnchor="start"
                >
                  Self-Improvement
                </text>
              </g>
            </svg>
          </div>
        )}

        {/* Switch Graph Button (Aligned to the right) */}
        <div className="flex justify-end pt-1">
          <button
            id="switch-graph-btn"
            type="button"
            onClick={() => setGraphMode((prev) => (prev === 'concentric' ? 'trajectory' : 'concentric'))}
            className="px-3.5 py-1.5 bg-white dark:bg-slate-900 rounded-xl border border-slate-200/90 dark:border-slate-800 shadow-xs flex items-center space-x-2 text-[12px] font-semibold text-slate-800 dark:text-slate-200 hover:border-slate-300 dark:hover:border-slate-700 transition cursor-pointer active:scale-95"
          >
            {/* Swap horizontal arrows icon */}
            <svg className="w-4 h-4 text-slate-800 dark:text-slate-200" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
            </svg>
            <span>Switch Graph</span>
          </button>
        </div>
      </section>

      {/* Identity Evidence Ledger Card (Non-clickable, text and accomplished/total habits only) */}
      <section>
        <div
          id="identity-evidence-ledger-card"
          className="w-full bg-white dark:bg-slate-900 rounded-2xl p-3.5 px-4 border border-slate-100 dark:border-slate-800 shadow-xs flex items-center justify-between"
        >
          <span className="text-[14.5px] font-bold text-slate-800 dark:text-white tracking-tight">
            Identity Evidence ledger
          </span>
          <span className="text-[14.5px] font-bold text-slate-800 dark:text-white tabular-nums">
            {accomplishedHabitsCount}/{totalHabitsCount}
          </span>
        </div>
      </section>

      {/* Segmented Time Filter (Today / Week / Month / Momentum) */}
      <section className="bg-[#EFF3F6] dark:bg-slate-800/80 p-1 rounded-2xl flex items-center">
        {(['today', 'week', 'month', 'momentum'] as TimeFilter[]).map((tab) => {
          const isActive = timeFilter === tab;
          const label =
            tab === 'today'
              ? 'Today'
              : tab === 'week'
              ? 'Week'
              : tab === 'month'
              ? 'Month'
              : '⚡ Momentum';
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

      {/* MOMENTUM TAB VIEW */}
      {timeFilter === 'momentum' ? (
        <section className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-100 dark:border-slate-800 shadow-xs space-y-4 animate-in fade-in duration-200">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2.5">
              <div className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-blue-950/60 flex items-center justify-center text-emerald-700 dark:text-blue-400 font-black text-base shrink-0">
                ⚡
              </div>
              <div>
                <h2 className="text-[16px] font-extrabold text-slate-900 dark:text-white tracking-tight leading-tight">
                  Momentum Engine Audit
                </h2>
                <p className="text-[11.5px] text-slate-400 dark:text-slate-400 font-normal">
                  Continuous habit velocity & anti-fragile compounding
                </p>
              </div>
            </div>
          </div>

          {/* Central Score Dial */}
          <div className="py-2 flex flex-col items-center justify-center text-center">
            <div className="relative w-28 h-28 rounded-full bg-gradient-to-br from-emerald-50 via-white to-emerald-100 dark:from-slate-800 dark:via-slate-900 dark:to-blue-950 border-3 border-[#23C15D] dark:border-blue-500 shadow-md flex flex-col items-center justify-center">
              <span className="text-3xl font-black text-slate-900 dark:text-white tracking-tight leading-none">
                {momentumScore}
              </span>
              <span className="text-[9.5px] font-bold text-emerald-700 dark:text-blue-400 uppercase tracking-widest mt-1">
                / 100
              </span>
            </div>
            <p className="mt-2.5 text-[12.5px] font-bold text-emerald-800 dark:text-blue-400">
              {momentumScore >= 80
                ? 'Apex Velocity: Your daily compounding is fully optimized!'
                : momentumScore >= 50
                ? 'Strong Steady Velocity: Daily habits compounding reliably.'
                : 'Building Velocity: Micro-habits will rapidly accelerate your score.'}
            </p>
          </div>

          {/* Core Velocity Mechanics */}
          <div className="space-y-2.5 text-xs pt-1">
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800/80 flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <span className="text-base">🎯</span>
                <div>
                  <p className="font-bold text-slate-800 dark:text-white">Active Habit Execution</p>
                  <p className="text-[10.5px] text-slate-500 dark:text-slate-400">Full habits = 1.0 • Micro-habits = 0.5</p>
                </div>
              </div>
              <span className="font-extrabold text-slate-900 dark:text-white tabular-nums">
                {accomplishedHabitsCount} / {totalHabitsCount} Today
              </span>
            </div>
          </div>

          {/* 7-Day Habit Completion Matrix */}
          <div className="pt-2">
            <h4 className="text-[12px] font-bold text-slate-700 dark:text-slate-300 mb-2">
              7-Day Velocity Matrix
            </h4>
            <div className="grid grid-cols-7 gap-1.5 text-center">
              {Array.from({ length: 7 }, (_, i) => {
                const dayNum = i + 1;
                const isPastOrToday = i <= todayIndex;
                const completedCount = habits.filter((h) => h.days?.[i]).length;
                const rate = habits.length > 0 ? completedCount / habits.length : 0;
                const color =
                  !isPastOrToday
                    ? 'bg-slate-100 dark:bg-slate-800 text-slate-400'
                    : rate > 0.70
                    ? 'bg-emerald-500 text-white'
                    : rate >= 0.40
                    ? 'bg-emerald-200 text-emerald-900 dark:bg-blue-600 dark:text-white'
                    : 'bg-orange-400 text-white';

                return (
                  <div key={dayNum} className="flex flex-col items-center">
                    <span className="text-[10.5px] font-bold text-slate-500 dark:text-slate-400 mb-1">
                      {getWeekdayShort(i)}
                    </span>
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-[11px] font-extrabold shadow-2xs ${color}`}>
                      {isPastOrToday ? Math.round(rate * 100) + '%' : '—'}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      ) : (
        /* Analysis Card */
        <section className="bg-white dark:bg-slate-900 rounded-2xl p-4.5 border border-slate-100 dark:border-slate-800 shadow-xs space-y-4">
        {/* Analysis Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            {/* Rounded Icon Box with Trending Up Arrow */}
            <div className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-blue-950/60 flex items-center justify-center text-emerald-800 dark:text-blue-400 shrink-0">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
            </div>
            <div>
              <h2 className="text-[16px] font-extrabold text-slate-900 dark:text-white tracking-tight leading-tight">
                Analysis
              </h2>
              <p className="text-[11.5px] text-slate-400 dark:text-slate-400 font-normal">
                How you improved from the previous week
              </p>
            </div>
          </div>

          {/* Three Dots Menu Button */}
          <div className="relative">
            <button
              id="analysis-menu-btn"
              type="button"
              onClick={() => setShowAnalysisMenu(!showAnalysisMenu)}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition cursor-pointer"
              aria-label="Options"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <circle cx="5" cy="12" r="2" />
                <circle cx="12" cy="12" r="2" />
                <circle cx="19" cy="12" r="2" />
              </svg>
            </button>

            {/* Dropdown Options */}
            {showAnalysisMenu && (
              <div className="absolute right-0 top-8 w-48 bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-slate-100 dark:border-slate-700 p-1.5 z-20 animate-in fade-in zoom-in-95 duration-150">
                <button
                  type="button"
                  onClick={() => {
                    onToggleExamShield();
                    setShowAnalysisMenu(false);
                  }}
                  className="w-full text-left px-2.5 py-1.5 rounded-lg text-[11.5px] font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center justify-between"
                >
                  <span>Exam Shield</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${examShieldActive ? 'bg-emerald-100 dark:bg-blue-950 text-emerald-800 dark:text-blue-300' : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400'}`}>
                    {examShieldActive ? 'Active' : 'Off'}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowFrictionModal(true);
                    setShowAnalysisMenu(false);
                  }}
                  className="w-full text-left px-2.5 py-1.5 rounded-lg text-[11.5px] font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700"
                >
                  + Add Reflection Note
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Grouped Comparison Bar Chart */}
        <div className="pt-2 pb-1">
          <div className="grid grid-cols-4 gap-2">
            {analysisData.map((col) => {
              const prevHeight = Math.max(28, (col.prev / 100) * 96);
              const currHeight = Math.max(36, (col.curr / 100) * 110);

              return (
                <div key={col.label} className="flex flex-col items-center">
                  {/* Bars & Delta Container anchored to a shared bottom baseline */}
                  <div className="h-[136px] w-full flex flex-col items-center justify-end">
                    {/* Improvement Percentage Indicator at Top */}
                    <span className="text-[11.5px] font-extrabold text-emerald-600 dark:text-blue-400 mb-1.5 tracking-tight flex items-center">
                      ↑ {col.delta}%
                    </span>

                    {/* Dual Bars: Previous Week & This Week */}
                    <div className="flex items-end space-x-1.5">
                      {/* Previous Week Bar */}
                      <div
                        style={{ height: `${prevHeight}px` }}
                        className="w-5 sm:w-6 bg-[#E5E9ED] dark:bg-slate-700 rounded-t-lg rounded-b-sm transition-all duration-500"
                        title={`Previous week: ${col.prev}%`}
                      />
                      {/* This Week Bar */}
                      <div
                        style={{ height: `${currHeight}px` }}
                        className="w-5 sm:w-6 bg-[#23C15D] dark:bg-blue-500 rounded-t-lg rounded-b-sm transition-all duration-500 shadow-xs"
                        title={`This week: ${col.curr}%`}
                      />
                    </div>
                  </div>

                  {/* Category Label: Pushed down below the shared baseline */}
                  <div className="mt-2.5 min-h-[32px] flex items-start justify-center text-center">
                    <span
                      className={`leading-tight ${
                        col.label === 'Self-Improvement'
                          ? 'text-[10.5px] font-semibold text-slate-700 dark:text-slate-300 max-w-[85px]'
                          : 'text-[11.5px] font-semibold text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      {col.label}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Chart Legend at bottom of card */}
        <div className="flex items-center justify-start space-x-6 pt-2 border-t border-slate-100 dark:border-slate-800 text-[11.5px]">
          <div className="flex items-center space-x-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#A8B3BD] dark:bg-slate-600" />
            <span className="text-slate-500 dark:text-slate-400 font-medium">Previous week</span>
          </div>
          <div className="flex items-center space-x-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#23C15D] dark:bg-blue-500" />
            <span className="text-slate-700 dark:text-slate-200 font-semibold">This week</span>
          </div>
        </div>
      </section>
      )}

      {/* Reflection Note Modal */}
      {showFrictionModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-sm w-full p-4 border border-slate-100 dark:border-slate-800 shadow-xl space-y-3 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between">
              <h3 className="text-[14px] font-bold text-slate-900 dark:text-white">Add Reflection Note</h3>
              <button
                type="button"
                onClick={() => setShowFrictionModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-lg leading-none cursor-pointer"
              >
                ×
              </button>
            </div>
            <form onSubmit={handleNoteSubmit} className="space-y-2.5">
              <input
                type="text"
                placeholder="Habit or context (e.g. Sleep / Deep Work)"
                value={newNoteHabit}
                onChange={(e) => setNewNoteHabit(e.target.value)}
                className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-[12px] text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:focus:ring-blue-500"
              />
              <textarea
                rows={3}
                required
                placeholder="What went well or caused friction? How did you adapt?"
                value={newNoteText}
                onChange={(e) => setNewNoteText(e.target.value)}
                className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-[12px] text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:focus:ring-blue-500 resize-none"
              />
              <button
                type="submit"
                className="w-full py-2 bg-emerald-700 hover:bg-emerald-600 dark:bg-blue-600 dark:hover:bg-blue-500 text-white rounded-xl text-[12px] font-bold cursor-pointer"
              >
                Save Reflection
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
