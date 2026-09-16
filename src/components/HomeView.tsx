import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, animate, motion } from 'motion/react';
import { AccumulationBowl } from './AccumulationBowl';
import type { AccumulationPiece, BowlFill, CycleDays } from '../services/reportService';

const ISLAND_SPRING = { type: 'spring' as const, stiffness: 300, damping: 25 };
const ISLAND_HOLD_MS = 1200;

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
  const [expanded, setExpanded] = useState(false);
  const [delta, setDelta] = useState<number | null>(null);
  const displayRef = useRef(displayMomentum);
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

    const nextDelta = to - from;
    setDelta(nextDelta);
    setExpanded(true);

    const controls = animate(from, to, {
      duration: 0.55,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (value) => setDisplayMomentum(Math.round(value)),
    });

    const collapseTimer = window.setTimeout(() => {
      setExpanded(false);
      setDelta(null);
    }, ISLAND_HOLD_MS);

    return () => {
      controls.stop();
      window.clearTimeout(collapseTimer);
    };
  }, [targetMomentum]);

  const deltaLabel =
    delta == null || delta === 0 ? null : delta > 0 ? `+${delta}` : `${delta}`;

  return (
    <div className="mt-2 flex w-full flex-col items-center gap-3 pt-4">
      <div className="flex w-full justify-center">
        <motion.div
          id="home-momentum-badge"
          data-tour="home-momentum-badge"
          layout
          transition={ISLAND_SPRING}
          className={`inline-flex items-center rounded-full border font-bold tabular-nums shadow-xs ${
            expanded ? 'gap-2.5 px-7 py-2' : 'gap-1.5 px-4 py-1.5'
          } ${
            darkMode
              ? 'bg-slate-900/90 border-blue-500/40 text-blue-200'
              : 'bg-white/95 border-emerald-200 text-emerald-800'
          }`}
          title="Live momentum score"
        >
          <motion.span
            layout
            transition={ISLAND_SPRING}
            className={`text-[11px] ${
              expanded ? '-translate-x-0.5' : ''
            } ${darkMode ? 'text-blue-400' : 'text-emerald-600'}`}
          >
            Momentum
          </motion.span>
          <motion.span layout transition={ISLAND_SPRING} className="text-[12px] font-black">
            {displayMomentum}
          </motion.span>
          <AnimatePresence>
            {deltaLabel && (
              <motion.span
                key={deltaLabel}
                initial={{ opacity: 0, scale: 0.7, x: 4 }}
                animate={{ opacity: 1, scale: 1, x: 0 }}
                exit={{ opacity: 0, scale: 0.85, x: -2 }}
                transition={{ type: 'spring', stiffness: 380, damping: 22 }}
                className={`text-[11px] font-black ${
                  darkMode
                    ? 'text-blue-300 drop-shadow-[0_0_8px_rgba(59,130,246,0.85)]'
                    : 'text-emerald-600 drop-shadow-[0_0_8px_rgba(16,185,129,0.75)]'
                }`}
              >
                {deltaLabel}
              </motion.span>
            )}
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
