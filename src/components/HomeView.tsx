import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { AccumulationBowl } from './AccumulationBowl';
import type { AccumulationPiece, BowlFill, CycleDays } from '../services/reportService';

const ISLAND_SPRING = { type: 'spring' as const, stiffness: 300, damping: 25, mass: 0.85 };
/** Total island sequence ≈ 1.2s expand → count → contract. */
const EXPAND_MS = 220;
const COUNT_MS = 650;
/** Badge exit after count finishes, before contract. */
const BADGE_OUT_MS = 200;
const CONTRACT_HOLD_MS = 130;

interface HomeViewProps {
  pieces: AccumulationPiece[];
  bowlFill: BowlFill;
  isDark?: boolean;
  momentumScore: number;
  /** Increments on each habit completion / miss so the island always pulses. */
  momentumPulse?: number;
  onCycleDaysChange: (days: CycleDays) => void;
  celebrating?: boolean;
  onCelebrationDone?: () => void;
  children: React.ReactNode;
}

function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

export const HomeView: React.FC<HomeViewProps> = ({
  pieces,
  bowlFill,
  isDark = false,
  momentumScore,
  momentumPulse = 0,
  onCycleDaysChange,
  celebrating = false,
  onCelebrationDone,
  children,
}) => {
  const targetMomentum = Math.round(Number.isFinite(momentumScore) ? momentumScore : 0);
  const [displayMomentum, setDisplayMomentum] = useState(targetMomentum);
  const [expanded, setExpanded] = useState(false);
  const [badgeVisible, setBadgeVisible] = useState(false);
  const [delta, setDelta] = useState<number | null>(null);

  const displayRef = useRef(targetMomentum);
  const targetRef = useRef(targetMomentum);
  const animatingRef = useRef(false);
  targetRef.current = targetMomentum;

  const darkMode = Boolean(isDark);
  const safePieces = Array.isArray(pieces) ? pieces : [];
  const fillPercent = Number.isFinite(bowlFill?.fillPercent) ? bowlFill.fillPercent : 0;
  const votes = Number.isFinite(bowlFill?.votes) ? bowlFill.votes : 0;
  const capacity = Number.isFinite(bowlFill?.capacity) ? Math.max(0, bowlFill.capacity) : 0;
  const cycleDays = Number.isFinite(bowlFill?.cycleDays) ? bowlFill.cycleDays : 7;

  // Hydrate/tab remount only — never run while a pulse sequence owns the display value.
  useEffect(() => {
    if (animatingRef.current) return;
    if (displayRef.current === targetMomentum) return;
    displayRef.current = targetMomentum;
    setDisplayMomentum(targetMomentum);
  }, [targetMomentum]);

  /**
   * Sequenced island:
   * 1) expand + show delta badge
   * 2) count old→new while badge stays visible
   * 3) badge fades out
   * 4) pill contracts
   */
  useEffect(() => {
    if (momentumPulse <= 0) return;

    // Capture OLD display BEFORE any sync can overwrite it.
    const from = displayRef.current;
    const to = targetRef.current;
    const nextDelta = to - from;

    animatingRef.current = true;
    setExpanded(true);
    setDelta(nextDelta);
    setBadgeVisible(nextDelta !== 0);

    let rafId = 0;
    let cancelled = false;
    const timers: number[] = [];

    const later = (ms: number, fn: () => void) => {
      const id = window.setTimeout(() => {
        if (!cancelled) fn();
      }, ms);
      timers.push(id);
    };

    // After expand settles: count while badge is visible.
    later(EXPAND_MS, () => {
      if (cancelled) return;
      if (from === to) {
        // Score flat — keep badge (if any) briefly then wind down.
        later(COUNT_MS, () => {
          setBadgeVisible(false);
          later(BADGE_OUT_MS, () => {
            setExpanded(false);
            setDelta(null);
            animatingRef.current = false;
          });
        });
        return;
      }

      const startedAt = performance.now();
      const tick = (now: number) => {
        if (cancelled) return;
        const t = Math.min(1, (now - startedAt) / COUNT_MS);
        const value = Math.round(from + (to - from) * easeOutCubic(t));
        displayRef.current = value;
        setDisplayMomentum(value);
        if (t < 1) {
          rafId = window.requestAnimationFrame(tick);
          return;
        }
        displayRef.current = to;
        setDisplayMomentum(to);
        // Count finished → badge out → contract.
        setBadgeVisible(false);
        later(BADGE_OUT_MS, () => {
          later(CONTRACT_HOLD_MS, () => {
            setExpanded(false);
            setDelta(null);
            animatingRef.current = false;
          });
        });
      };
      rafId = window.requestAnimationFrame(tick);
    });

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(rafId);
      timers.forEach((id) => window.clearTimeout(id));
    };
  }, [momentumPulse]);

  const deltaLabel =
    delta == null || delta === 0 ? null : delta > 0 ? `+${delta}` : `${delta}`;

  return (
    <div className="mt-1 flex w-full flex-col items-center gap-2 pt-2">
      <div className="relative z-10 my-2 flex w-full justify-center">
        <motion.div
          id="home-momentum-badge"
          data-tour="home-momentum-badge"
          layout
          initial={false}
          animate={{
            scale: expanded ? 1.06 : 1,
            paddingLeft: expanded ? 28 : 16,
            paddingRight: expanded ? 28 : 16,
            paddingTop: expanded ? 11 : 6,
            paddingBottom: expanded ? 11 : 6,
            gap: expanded ? 10 : 6,
            minWidth: expanded ? 180 : 120,
          }}
          transition={ISLAND_SPRING}
          className={`inline-flex items-center justify-center rounded-full border text-[11px] font-bold tabular-nums transform-gpu will-change-transform ${
            darkMode
              ? 'bg-slate-900/95 border-blue-500/50 text-blue-200'
              : 'bg-white/95 border-emerald-200 text-emerald-800 shadow-sm'
          }`}
          style={{
            boxShadow: expanded
              ? darkMode
                ? '0 0 0 1px rgba(59,130,246,0.45), 0 10px 28px rgba(37,99,235,0.35)'
                : '0 0 0 1px rgba(16,185,129,0.4), 0 10px 28px rgba(5,150,105,0.22)'
              : undefined,
          }}
          title="Live momentum score"
        >
          <span
            className={`whitespace-nowrap transition-transform duration-300 ${
              expanded ? '-translate-x-1' : ''
            } ${darkMode ? 'text-blue-400' : 'text-emerald-600'}`}
          >
            Momentum
          </span>
          <span className="text-[13px] font-black min-w-[1.75ch] text-center">{displayMomentum}</span>
          <AnimatePresence initial={false}>
            {badgeVisible && deltaLabel ? (
              <motion.span
                key={`delta-${deltaLabel}`}
                initial={{ opacity: 0, scale: 0.55, x: 10 }}
                animate={{ opacity: 1, scale: 1, x: 0 }}
                exit={{ opacity: 0, scale: 0.7, x: -6 }}
                transition={ISLAND_SPRING}
                className={`text-[12px] font-black whitespace-nowrap ${
                  darkMode
                    ? 'text-blue-300 drop-shadow-[0_0_10px_rgba(59,130,246,0.95)]'
                    : 'text-emerald-600 drop-shadow-[0_0_10px_rgba(16,185,129,0.85)]'
                }`}
              >
                {deltaLabel}
              </motion.span>
            ) : null}
          </AnimatePresence>
        </motion.div>
      </div>

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

      <div className="mt-2 flex w-full flex-col gap-2">{children}</div>
    </div>
  );
};
