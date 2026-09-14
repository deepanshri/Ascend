import React from 'react';
import { Habit } from '../types';
import { getTodayDayIndex, getWeekDates, getWeekdayNarrow, toISODate } from '../utils/dates';
import { isHabitScheduledOnDayIndex } from '../utils/schedule';
import { MascotDotTrack } from './MascotDotTrack';

interface RadialFanCalendarProps {
  selectedDay: number; // 1 to 7 (for reference/current active day indicator)
  onSelectDay?: (day: number) => void;
  dayCompletionRates: Array<number | null>; // 7 rates 0–1, or null when no habit is scheduled that day
  habits: Habit[];
  momentumScore: number; // 0 to 100
  isCelebrating?: boolean;
  isDark?: boolean;
  originDate?: Date;
}

export const RadialFanCalendar: React.FC<RadialFanCalendarProps> = ({
  selectedDay,
  onSelectDay: _onSelectDay,
  dayCompletionRates,
  habits,
  momentumScore,
  isCelebrating = false,
  isDark = false,
  originDate,
}) => {
  // Theme-aware palette
  const dotColor = isDark ? '#3B82F6' : '#22C55E';
  const dotMicroHalf = isDark ? '#1E3A8A' : '#DDF6E7';
  const emptyDotStroke = isDark ? '#334155' : '#E2E8F0';
  const emptyDotFill = isDark ? '#1E293B' : '#F8FAFC';

  // Current day index (0 to 6)
  const currentDayIndex = selectedDay - 1;

  // Filter out active habits
  const activeHabits = habits.filter((h) => !h.archived);
  const habitCount = Math.max(activeHabits.length, 1);

  // Sort habits so completed ones fill smoothly along the arc
  const sortedDayHabitStatuses = activeHabits
    .map((h) => {
      const isDone = Boolean(h.days?.[currentDayIndex]);
      const isMicro = Boolean(h.microDays?.[currentDayIndex]);
      const isScheduled = isHabitScheduledOnDayIndex(h, currentDayIndex, originDate ?? new Date());
      return {
        id: h.id,
        name: h.name,
        isDone,
        isMicro,
        status: !isScheduled ? 'off' : isDone ? (isMicro ? 'micro' : 'full') : 'incomplete',
      };
    })
    .sort((a, b) => {
      const rank = (s: string) => (s === 'full' ? 3 : s === 'micro' ? 2 : s === 'incomplete' ? 1 : 0);
      return rank(b.status) - rank(a.status);
    });

  // =========================================================================
  // GEOMETRIC HARMONY
  // Single shared center: (cx, cy)
  // All dots, momentum orb, and date cards are concentric around this exact point
  // =========================================================================
  const cx = 180;
  const cy = 154;

  // 1. DATE CARDS (Day 1 to Day 7) arched along radius = 132
  const cardRadius = 132;
  const cardAngles = [
    { day: 1, angle: 154, rot: -64 },
    { day: 2, angle: 132.7, rot: -42.7 },
    { day: 3, angle: 111.3, rot: -21.3 },
    { day: 4, angle: 90, rot: 0 },
    { day: 5, angle: 68.7, rot: 21.3 },
    { day: 6, angle: 47.3, rot: 42.7 },
    { day: 7, angle: 26, rot: 64 },
  ];

  const todayIndex = getTodayDayIndex();
  const weekOrigin = originDate ?? new Date();
  const weekDates = getWeekDates(weekOrigin);
  // Rolling 7-day window: cards 0–2 past, 3 today (center), 4–6 next

  const dateCards = cardAngles.map((item) => {
    const rad = (item.angle * Math.PI) / 180;
    const x = cx + cardRadius * Math.cos(rad);
    const y = cy - cardRadius * Math.sin(rad);
    const dayIdx = item.day - 1;
    const completion = dayCompletionRates[dayIdx];
    const cardDate = weekDates[dayIdx];

    // Dot color rules:
    // 1. If no habit is scheduled that day -> Neutral (never orange/miss)
    // 2. If date hasn't arrived yet (dayIdx > today) -> Grey
    // 3. If done habits > 70% -> Green
    // 4. If done habits between 40% - 70% -> Light Green
    // 5. If done habits < 40% -> Orange
    let dotBg = '#94A3B8';
    let statusLabel = 'Upcoming';

    if (completion == null) {
      dotBg = isDark ? '#475569' : '#CBD5E1';
      statusLabel = 'Off day';
    } else if (dayIdx > todayIndex) {
      dotBg = isDark ? '#64748B' : '#94A3B8';
      statusLabel = 'Upcoming';
    } else if (completion > 0.70) {
      dotBg = '#22C55E';
      statusLabel = `${Math.round(completion * 100)}% complete`;
    } else if (completion >= 0.40) {
      dotBg = isDark ? '#4ADE80' : '#86EFAC';
      statusLabel = `${Math.round(completion * 100)}% complete`;
    } else {
      dotBg = '#F97316';
      statusLabel = `${Math.round(completion * 100)}% complete`;
    }

    return {
      ...item,
      x,
      y,
      dotBg,
      statusLabel,
      dateLabel: cardDate?.getDate() ?? item.day,
      weekdayLabel: getWeekdayNarrow(dayIdx, weekOrigin),
      isToday: dayIdx === todayIndex,
      isSelected: item.day === selectedDay,
      isPast: dayIdx < todayIndex,
      isoDate: cardDate ? toISODate(cardDate) : '',
    };
  });

  // =========================================================================
  // 2. CONCENTRIC SEMICIRCLE DOTS
  // 5 Concentric semicircular arcs centered at (cx, cy)
  // Semicircle spans from 172° (left) to 8° (right)
  // Momentum ring radius is 30, so innermost arc is at radius 46 (gap of 16px)
  // =========================================================================
  const angleStart = 170;
  const angleEnd = 10;

  // Layer 1 (Innermost: Habit Progress Arc, R = 46)
  const arcDots = sortedDayHabitStatuses.map((h, i) => {
    const frac = habitCount > 1 ? i / (habitCount - 1) : 0.5;
    const angleDeg = angleStart - frac * (angleStart - angleEnd);
    const rad = (angleDeg * Math.PI) / 180;
    const x = cx + 46 * Math.cos(rad);
    const y = cy - 46 * Math.sin(rad);
    return { ...h, x, y };
  });

  return (
    <section
      id="radial-calendar-widget"
      data-tour="momentum-card"
      className="relative w-full max-w-[360px] mx-auto h-[200px] -mt-2 pt-0 pb-0 overflow-visible select-none cursor-default"
    >
      {/* Ambient background soft radial glow centered on momentum */}
      <div className="absolute left-1/2 -translate-x-1/2 top-10 w-60 h-32 bg-accent-soft/40 rounded-full blur-2xl pointer-events-none z-0" />

      <MascotDotTrack
        celebrate={isCelebrating}
        momentumScore={momentumScore}
        dotColor={dotColor}
        emptyDotStroke={emptyDotStroke}
      />

      {/* ========================================================================= */}
      {/* UNIFIED SVG CANVAS: date cards stay above the mascot dot track            */}
      {/* ========================================================================= */}
      <svg
        className="relative z-10 w-full h-full overflow-visible pointer-events-none select-none"
        fill="none"
        viewBox="0 0 360 200"
      >
        <defs>
          <linearGradient id="microDotGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="50%" stopColor={dotColor} />
            <stop offset="50%" stopColor={dotMicroHalf} />
          </linearGradient>

          <radialGradient id="momentumOrbGrad" cx="40%" cy="30%" r="75%">
            <stop offset="0%" stopColor="#FFFFFF" />
            <stop offset="70%" stopColor={isDark ? '#0F172A' : '#F8FAFC'} />
            <stop offset="100%" stopColor={isDark ? '#1E293B' : '#E8F5E9'} />
          </radialGradient>

          <filter id="cleanCardShadow" x="-25%" y="-25%" width="150%" height="150%">
            <feDropShadow dx="0" dy="2" stdDeviation="2.5" floodColor="#0F172A" floodOpacity="0.07" />
          </filter>

          <filter id="orbShadow" x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="0" dy="3" stdDeviation="4" floodColor={isDark ? '#3B82F6' : '#10B981'} floodOpacity="0.22" />
          </filter>

          <filter id="glowAccent" x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="0" dy="0" stdDeviation="1.5" floodColor={dotColor} floodOpacity="0.5" />
          </filter>
        </defs>

        {/* Decorative layers 2–5 live in MascotDotTrack so 2D proximity can depress them. */}
        {/* LAYER 1: DAILY PROGRESS HABIT DOTS stay in SVG (R = 46). */}

        {/* Subtle guide rail semicircle arch hugging over the momentum orb */}
        <path
          d={`M ${cx - 46} ${cy} A 46 46 0 0 1 ${cx + 46} ${cy}`}
          fill="none"
          stroke={emptyDotStroke}
          strokeWidth="1.2"
          strokeDasharray="2 3"
          opacity="0.45"
        />

        {/* LAYER 1: DAILY PROGRESS HABIT DOTS (R = 46) - HUGS MOMENTUM RING */}
        {arcDots.map((dot, idx) => {
          const isFull = dot.status === 'full';
          const isMicro = dot.status === 'micro';
          const isOff = dot.status === 'off';

          return (
            <g key={dot.id || idx}>
              {isOff ? (
                <circle
                  cx={dot.x}
                  cy={dot.y}
                  r="3.6"
                  fill="none"
                  stroke={emptyDotStroke}
                  strokeWidth="1.1"
                  strokeDasharray="1.6 1.8"
                  opacity="0.55"
                />
              ) : isFull ? (
                <g>
                  <circle
                    cx={dot.x}
                    cy={dot.y}
                    r="5.4"
                    fill={dotColor}
                    stroke="#FFFFFF"
                    strokeWidth="1.4"
                    filter="url(#glowAccent)"
                  />
                  <circle cx={dot.x} cy={dot.y} r="1.5" fill="#FFFFFF" />
                </g>
              ) : isMicro ? (
                <g>
                  <circle
                    cx={dot.x}
                    cy={dot.y}
                    r="5.4"
                    fill="url(#microDotGrad)"
                    stroke={dotColor}
                    strokeWidth="1.4"
                  />
                  <circle cx={dot.x} cy={dot.y} r="1.4" fill={dotColor} />
                </g>
              ) : (
                <circle
                  cx={dot.x}
                  cy={dot.y}
                  r="4.4"
                  fill={emptyDotFill}
                  stroke={emptyDotStroke}
                  strokeWidth="1.3"
                />
              )}
            </g>
          );
        })}

        {/* ========================================================================= */}
        {/* CENTRAL MOMENTUM ORB: EXACTLY IN THE MIDDLE OF THE CONCENTRIC DOTS        */}
        {/* Centered at (cx, cy) = (180, 154), radius 30                             */}
        {/* ========================================================================= */}
        <g id="central-momentum-orb" transform={`translate(${cx}, ${cy})`}>
          {/* Outer gentle ambient pulse aura ring */}
          <circle
            r="33.5"
            fill="none"
            stroke={isDark ? 'rgba(59, 130, 246, 0.35)' : 'rgba(34, 197, 94, 0.35)'}
            strokeWidth="3"
            opacity="0.6"
          />

          {/* Main Momentum Disc */}
          <circle
            r="30"
            fill="url(#momentumOrbGrad)"
            stroke={isDark ? '#3B82F6' : '#FFFFFF'}
            strokeWidth="2.4"
            filter="url(#orbShadow)"
          />

          {/* Score Value (0-100) */}
          <text
            textAnchor="middle"
            y="-1"
            fontSize="19"
            fontWeight="900"
            fill={isDark ? '#FFFFFF' : '#0F172A'}
            fontFamily="system-ui, -apple-system, sans-serif"
            letterSpacing="-0.5"
          >
            {momentumScore}
          </text>

          {/* Label */}
          <text
            textAnchor="middle"
            y="12.5"
            fontSize="7.5"
            fontWeight="800"
            letterSpacing="1.6"
            fill={isDark ? '#60A5FA' : '#059669'}
            fontFamily="system-ui, -apple-system, sans-serif"
          >
            MOMENTUM
          </text>
        </g>

        {/* Date cards paint last so they stay readable above the mascot track. */}
        <g id="fan-date-cards" className="pointer-events-none" style={{ pointerEvents: 'none' }}>
          {dateCards.map((card) => {
            const isActive = card.isSelected || card.isToday;
            return (
              <g
                key={card.day}
                id={`fan-day-card-${card.day}`}
                transform={`translate(${card.x}, ${card.y}) rotate(${card.rot})`}
                className="pointer-events-none cursor-default"
                aria-hidden="true"
              >
                <rect
                  x="-18"
                  y="-22"
                  width="36"
                  height="44"
                  rx="13"
                  ry="13"
                  fill={isActive ? (isDark ? '#1E293B' : '#FFFFFF') : (isDark ? '#0F172A' : '#FFFFFF')}
                  stroke={card.isSelected ? (isDark ? '#3B82F6' : '#10B981') : card.isToday ? (isDark ? '#3B82F6' : '#94A3B8') : (isDark ? '#334155' : '#E2E8F0')}
                  strokeWidth={card.isSelected ? '2' : card.isToday ? '1.6' : '1'}
                  filter="url(#cleanCardShadow)"
                />
                <text
                  textAnchor="middle"
                  y="-8"
                  fontSize="7"
                  fontWeight="800"
                  fill={isActive ? (isDark ? '#93C5FD' : '#059669') : (isDark ? '#94A3B8' : '#94A3B8')}
                  fontFamily="system-ui, -apple-system, sans-serif"
                >
                  {card.weekdayLabel}
                </text>
                <text
                  textAnchor="middle"
                  y="5"
                  fontSize="13"
                  fontWeight={isActive ? '900' : '700'}
                  fill={isActive ? (isDark ? '#FFFFFF' : '#0F172A') : (isDark ? '#E2E8F0' : '#334155')}
                  fontFamily="system-ui, -apple-system, sans-serif"
                >
                  {card.dateLabel}
                </text>
                <circle
                  cx="0"
                  cy="12"
                  r="3.2"
                  fill={card.dotBg}
                  stroke={isDark ? '#1E293B' : '#FFFFFF'}
                  strokeWidth="0.9"
                />
              </g>
            );
          })}
        </g>
      </svg>
    </section>
  );
};
