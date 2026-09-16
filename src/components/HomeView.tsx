import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { AccumulationBowl } from './AccumulationBowl';
import type { AccumulationPiece, BowlFill, CycleDays } from '../services/reportService';

const ISLAND_SPRING = { type: 'spring' as const, stiffness: 300, damping: 25 };
const ISLAND_HOLD_MS = 1200;
const COUNT_MS = 550;

interface HomeViewProps {
  pieces: AccumulationPiece[];
  bowlFill: BowlFill;
  isDark?: boolean;
  momentumScore: number;
  onCycleDaysChange: (days: CycleDays) => void;
  celebrating?: boolean;
  onCelebrationDone?: () => void;
  children: React.ReactNode;
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

export const HomeView: React.FC<HomeViewProps> = ({
  pieces,
  bowlFill,
  isDark = false,
  momentumScore,
  onCycleDaysChange,
  celebrating = false,
  onCelebrationDone,
  children,
}) => {
  const targetMomentum = Math.round(Number.isFinite(momentumScore) ? momentumScore : 0);
  const [displayMomentum, setDisplayMomentum] = useState(targetMomentum);
  const [isAnimating, setIsAnimating] = useState(false);
  const [delta, setDelta] = useState<number | null>(null);
  const displayRef = useRef(displayMomentum);
  const animGenRef = useRef(0);
  displayRef.current = displayMomentum;

  // Stable theme flag — never remount the bowl on light/dark toggle.
  const darkMode = Boolean(isDark);
  const safePieces = Array.isArray(pieces) ? pieces : [];
  const fillPercent = Number.isFinite(bowlFill?.fillPercent) ? bowlFill.fillPercent : 0;
  const votes = Number.isFinite(bowlFill?.votes) ? bowlFill.votes : 0;
  const capacity = Number.isFinite(bowlFill?.capacity) ? Math.max(0, bowlFill.capacity) : 0;
  const cycleDays = Number.isFinite(bowlFill?.cycleDays) ? bowlFill.cycleDays : 7;

  useEffect(() => {
    const from = displayRef.current;
    const to = targetMomentum;
    if (from === to) return;

    const gen = ++animGenRef.current;
    const nextDelta = to - from;
    setDelta(nextDelta);
    setIsAnimating(true);

    const startedAt = performance.now();
    let rafId = 0;

    const tick = (now: number) => {
      if (animGenRef.current !== gen) return;
      const t = Math.min(1, (now - startedAt) / COUNT_MS);
      const value = Math.round(from + (to - from) * easeOutCubic(t));
      displayRef.current = value;
      setDisplayMomentum(value);
      if (t < 1) {
        rafId = window.requestAnimationFrame(tick);
      } else {
        displayRef.current = to;
        setDisplayMomentum(to);
      }
    };
    rafId = window.requestAnimationFrame(tick);

    const collapseTimer = window.setTimeout(() => {
      if (animGenRef.current !== gen) return;
      setIsAnimating(false);
      setDelta(null);
    }, ISLAND_HOLD_MS);

    return () => {
      window.cancelAnimationFrame(rafId);
      window.clearTimeout(collapseTimer);
    };
  }, [targetMomentum]);

  const deltaLabel =
    delta == null || delta === 0 ? null : delta > 0 ? `+${delta}` : `${delta}`;

  return (
    <div className="mt-2 flex w-full flex-col items-center gap-3 pt-4">
      <div className="flex w-full justify-center min-h-[36px]">
        <motion.div
          id="home-momentum-badge"
          data-tour="home-momentum-badge"
          layout
          initial={false}
          animate={{
            paddingLeft: isAnimating ? 28 : 16,
            paddingRight: isAnimating ? 28 : 16,
            paddingTop: isAnimating ? 8 : 6,
            paddingBottom: isAnimating ? 8 : 6,
            gap: isAnimating ? 10 : 6,
          }}
          transition={ISLAND_SPRING}
          className={`inline-flex items-center rounded-full border text-[11px] font-bold tabular-nums shadow-xs will-change-transform ${
            darkMode
              ? 'bg-slate-900/90 border-blue-500/40 text-blue-200'
              : 'bg-white/95 border-emerald-200 text-emerald-800'
          }`}
          title="Live momentum score"
        >
          <motion.span
            layout="position"
            transition={ISLAND_SPRING}
            className={`${isAnimating ? '-translate-x-0.5' : ''} ${
              darkMode ? 'text-blue-400' : 'text-emerald-600'
            }`}
          >
            Momentum
          </motion.span>
          <motion.span layout="position" transition={ISLAND_SPRING} className="text-[12px] font-black">
            {displayMomentum}
          </motion.span>
          <AnimatePresence mode="popLayout">
            {isAnimating && deltaLabel ? (
              <motion.span
                key={`delta-${deltaLabel}`}
                initial={{ opacity: 0, scale: 0.65, x: 6 }}
                animate={{ opacity: 1, scale: 1, x: 0 }}
                exit={{ opacity: 0, scale: 0.8, x: -4 }}
                transition={{ type: 'spring', stiffness: 380, damping: 22 }}
                className={`text-[11px] font-black ${
                  darkMode
                    ? 'text-blue-300 drop-shadow-[0_0_8px_rgba(59,130,246,0.85)]'
                    : 'text-emerald-600 drop-shadow-[0_0_8px_rgba(16,185,129,0.75)]'
                }`}
              >
                {deltaLabel}
              </motion.span>
            ) : null}
          </AnimatePresence>
        </motion.div>
      </div>

      {/* No theme-keyed remount — AccumulationBowl stays mounted across light/dark. */}
      <div className="mx-auto flex w-full flex-col items-center justify-center">
        <AccumulationBowl
          pieces={safePieces}
          fillPercent={fillPercent}
          isOverflowing={Boolean(bowlFill?.isOverflowing)}
          isDark={darkMode}
          votes={votes}
          capacity={capacity}
          cycleDays={cycleDays}
          onCycleDaysChange={onCycleDaysChange}
          celebrating={celebrating}
          onCelebrationDone={onCelebrationDone}
        />
      </div>

      <div className="mt-4 flex w-full flex-col space-y-3">{children}</div>
    </div>
  );
};
