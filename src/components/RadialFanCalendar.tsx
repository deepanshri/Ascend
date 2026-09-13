import React from 'react';
import { Habit } from '../types';
import { getTodayDayIndex, getWeekDates, getWeekdayNarrow, toISODate } from '../utils/dates';
import { Mascot, mascotAngleFromMomentum } from './Mascot';

interface RadialFanCalendarProps {
  selectedDay: number; // 1 to 7 (for reference/current active day indicator)
  onSelectDay?: (day: number) => void;
  dayCompletionRates: number[]; // 7 numbers between 0 and 1
  habits: Habit[];
  momentumScore: number; // 0 to 100
  isCelebrating?: boolean;
  isDark?: boolean;
  originDate?: Date;
}

export const RadialFanCalendar: React.FC<RadialFanCalendarProps> = ({
  selectedDay,
  onSelectDay,
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
      return {
        id: h.id,
        name: h.name,
        isDone,
        isMicro,
        status: isDone ? (isMicro ? 'micro' : 'full') : 'incomplete',
      };
    })
    .sort((a, b) => {
      const rank = (s: string) => (s === 'full' ? 2 : s === 'micro' ? 1 : 0);
      return rank(b.status) - rank(a.status);
    });

  // =========================================================================
  // GEOMETRIC HARMONY
  // Single shared center: (cx, cy)
  // All dots, momentum orb, and date cards are concentric around this exact point
  // =========================================================================
  const cx = 180;
  const cy = 160;

  // 1. DATE CARDS (Day 1 to Day 7) arched along radius = 138
  const cardRadius = 138;
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
    const completion = dayCompletionRates[dayIdx] ?? 0;
    const cardDate = weekDates[dayIdx];

    // Dot color rules:
    // 1. If date hasn't arrived yet (dayIdx > today) -> Grey
    // 2. If done habits > 70% -> Green
    // 3. If done habits between 40% - 70% -> Light Green
    // 4. If done habits < 40% -> Orange
    let dotBg = '#94A3B8';
    let statusLabel = 'Upcoming';

    if (dayIdx > todayIndex) {
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

  const generateArcDots = (radius: number, count: number, start = 172, end = 8) => {
    const dots = [];
    for (let i = 0; i < count; i++) {
      const frac = count > 1 ? i / (count - 1) : 0.5;
      const angleDeg = start - frac * (start - end);
      const rad = (angleDeg * Math.PI) / 180;
      const x = cx + radius * Math.cos(rad);
      const y = cy - radius * Math.sin(rad);
      dots.push({ x, y, i });
    }
    return dots;
  };

  const layer2Dots = generateArcDots(62, 11);
  const layer3Dots = generateArcDots(78, 13);
  const layer4Dots = generateArcDots(94, 15);
  const layer5Dots = generateArcDots(110, 17);

  // 7 fixed mascot slots on the outer momentum-dot arc (Dot 1 … Dot 7).
  // Index 3 is today's centered card. Coordinates are % of the 360×215 canvas.
  const mascotArcSlots = cardAngles.map((item) => {
    const rad = (item.angle * Math.PI) / 180;
    const x = cx + 110 * Math.cos(rad);
    const y = cy - 110 * Math.sin(rad);
    return {
      left: `${(x / 360) * 100}%`,
      top: `${(y / 215) * 100}%`,
    };
  });
  const mascotSlot = mascotArcSlots[currentDayIndex] ?? mascotArcSlots[3];

  return (
    <section
      id="radial-calendar-widget"
      data-tour="momentum-card"
      className="relative w-full max-w-[360px] mx-auto h-[215px] pt-1 pb-1 overflow-visible select-none cursor-default"
    >
      {/* Ambient background soft radial glow centered on momentum */}
      <div className="absolute left-1/2 -translate-x-1/2 top-14 w-60 h-32 bg-accent-soft/40 rounded-full blur-2xl pointer-events-none z-0" />

      <div
        id="mascot-companion"
        className="mascot-arc-slot z-0 pointer-events-none"
        style={{ top: mascotSlot.top, left: mascotSlot.left }}
      >
        <Mascot
          size={56}
          angle={mascotAngleFromMomentum(momentumScore)}
          momentumScore={momentumScore}
          celebrate={isCelebrating}
          animate
        />
      </div>

      {/* ========================================================================= */}
      {/* UNIFIED SVG CANVAS: Everything is mathematically locked to (cx, cy)       */}
      {/* Completely eliminates coordinate drift, viewport scaling mismatch, &      */}
      {/* weird artifact shadows.                                                   */}
      {/* ========================================================================= */}
      <svg
        className="relative z-10 w-full h-full overflow-visible pointer-events-none select-none"
        fill="none"
        viewBox="0 0 360 215"
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

        {/* ========================================================================= */}
        {/* SEMICIRCLE ARCH OF DATE CARDS (Day 1 to Day 7)                            */}
        {/* Tap a card to select that day; the mascot glides along the outer dot arc  */}
        {/* ========================================================================= */}
        <g id="fan-date-cards" className="pointer-events-auto">
          {dateCards.map((card) => {
            const isActive = card.isSelected || card.isToday;
            return (
              <g
                key={card.day}
                id={`fan-day-card-${card.day}`}
                transform={`translate(${card.x}, ${card.y}) rotate(${card.rot})`}
                className="cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectDay?.(card.day);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelectDay?.(card.day);
                  }
                }}
                role="button"
                tabIndex={0}
                aria-label={`Select ${card.isoDate || `day ${card.day}`}${card.isToday ? ', today' : card.isPast ? ', historical' : ', upcoming'}`}
                aria-pressed={card.isSelected}
              >
                {/* Crisp card background */}
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

                {/* Weekday + calendar date */}
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

                {/* Status indicator dot with explicit completion colors */}
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

        {/* ========================================================================= */}
        {/* CONCENTRIC SEMICIRCLE DOTS                                               */}
        {/* Radiating outward from the central momentum orb                          */}
        {/* ========================================================================= */}
        {/* LAYER 5: Outermost Semicircle Arc (R = 110) */}
        {layer5Dots.map((dot) => {
          const isHighlighted = (dot.i + 1) % 3 === 0;
          return (
            <circle
              key={`l5-${dot.i}`}
              cx={dot.x}
              cy={dot.y}
              r={isHighlighted ? 3.6 : 2.8}
              fill={isHighlighted ? dotColor : emptyDotStroke}
              opacity={isHighlighted ? 0.75 : 0.4}
            />
          );
        })}

        {/* LAYER 4: Upper Semicircle Arc (R = 94) */}
        {layer4Dots.map((dot) => {
          const isHighlighted = (dot.i + 2) % 3 === 0;
          return (
            <circle
              key={`l4-${dot.i}`}
              cx={dot.x}
              cy={dot.y}
              r={isHighlighted ? 3.8 : 3.0}
              fill={isHighlighted ? dotColor : emptyDotStroke}
              opacity={isHighlighted ? 0.8 : 0.48}
            />
          );
        })}

        {/* LAYER 3: Middle Semicircle Arc (R = 78) */}
        {layer3Dots.map((dot) => {
          const isFilled = dot.i % 2 === 0;
          return (
            <circle
              key={`l3-${dot.i}`}
              cx={dot.x}
              cy={dot.y}
              r={isFilled ? 4.0 : 3.2}
              fill={isFilled ? dotColor : emptyDotStroke}
              opacity={isFilled ? 0.85 : 0.58}
            />
          );
        })}

        {/* LAYER 2: Inner Semicircle Arc (R = 62) */}
        {layer2Dots.map((dot) => {
          const isFilled = dot.i % 3 !== 1;
          return (
            <circle
              key={`l2-${dot.i}`}
              cx={dot.x}
              cy={dot.y}
              r={isFilled ? 4.2 : 3.4}
              fill={isFilled ? dotColor : emptyDotStroke}
              opacity={isFilled ? 0.9 : 0.65}
            />
          );
        })}

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

          return (
            <g key={dot.id || idx}>
              {isFull ? (
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
        {/* Centered at (cx, cy) = (180, 160), radius 30                             */}
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
      </svg>
    </section>
  );
};
