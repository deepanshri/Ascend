import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, animate, motion, useMotionValue, useTransform } from 'motion/react';

const ISLAND_SPRING = { type: 'spring' as const, stiffness: 350, damping: 22, mass: 0.85 };
/** Expand → count (~800ms) → badge out → contract ≈ 1.2s total. */
const EXPAND_HOLD_MS = 1200;
const COUNT_MS = 800;
const BADGE_OUT_MS = 180;

export interface MomentumPillProps {
  momentumScore: number;
  /** Increments on each habit completion / miss so the island always pulses. */
  momentumPulse?: number;
  isDark?: boolean;
}

/**
 * Apple-style Dynamic Island momentum pill:
 * horizontal spring expand, left-shifted label, glowing delta, interpolated score.
 */
export const MomentumPill: React.FC<MomentumPillProps> = ({
  momentumScore,
  momentumPulse = 0,
  isDark = false,
}) => {
  const targetScore = Math.round(Number.isFinite(momentumScore) ? momentumScore : 0);
  const darkMode = Boolean(isDark);

  const [expanded, setExpanded] = useState(false);
  const [badgeVisible, setBadgeVisible] = useState(false);
  const [delta, setDelta] = useState<number | null>(null);

  const displayRef = useRef(targetScore);
  const targetRef = useRef(targetScore);
  const pulseRef = useRef(momentumPulse);
  const animatingRef = useRef(false);
  /** Captured during render when pulse fires — before hydrate can snap the score. */
  const pendingPulseRef = useRef<{ from: number; to: number } | null>(null);

  targetRef.current = targetScore;

  if (momentumPulse > pulseRef.current) {
    pendingPulseRef.current = {
      from: displayRef.current,
      to: targetScore,
    };
    animatingRef.current = true;
  }
  pulseRef.current = momentumPulse;

  const count = useMotionValue(displayRef.current);
  const rounded = useTransform(count, (value) => Math.round(value));
  const [displayMomentum, setDisplayMomentum] = useState(displayRef.current);

  useEffect(() => {
    const unsubscribe = rounded.on('change', (value) => {
      displayRef.current = value;
      setDisplayMomentum(value);
    });
    return unsubscribe;
  }, [rounded]);

  // Hydrate when not mid-island sequence.
  useEffect(() => {
    if (animatingRef.current || pendingPulseRef.current) return;
    if (displayRef.current === targetScore) return;
    displayRef.current = targetScore;
    count.set(targetScore);
    setDisplayMomentum(targetScore);
  }, [targetScore, count]);

  useEffect(() => {
    const pending = pendingPulseRef.current;
    if (!pending) return;
    pendingPulseRef.current = null;

    const from = pending.from;
    const to = pending.to;
    const nextDelta = to - from;

    setExpanded(true);
    setDelta(nextDelta);
    setBadgeVisible(nextDelta !== 0);

    let cancelled = false;
    const timers: number[] = [];
    let controls: { stop: () => void } | null = null;

    const later = (ms: number, fn: () => void) => {
      const id = window.setTimeout(() => {
        if (!cancelled) fn();
      }, ms);
      timers.push(id);
    };

    count.set(from);
    displayRef.current = from;
    setDisplayMomentum(from);

    if (from === to) {
      later(EXPAND_HOLD_MS, () => {
        setBadgeVisible(false);
        later(BADGE_OUT_MS, () => {
          setExpanded(false);
          setDelta(null);
          animatingRef.current = false;
        });
      });
    } else {
      controls = animate(count, to, {
        duration: COUNT_MS / 1000,
        ease: 'easeOut',
        onComplete: () => {
          if (cancelled) return;
          displayRef.current = to;
          setDisplayMomentum(to);
        },
      });

      later(EXPAND_HOLD_MS, () => {
        setBadgeVisible(false);
        later(BADGE_OUT_MS, () => {
          setExpanded(false);
          setDelta(null);
          animatingRef.current = false;
        });
      });
    }

    return () => {
      cancelled = true;
      controls?.stop();
      timers.forEach((id) => window.clearTimeout(id));
    };
  }, [momentumPulse, count]);

  const deltaLabel =
    delta == null || delta === 0 ? null : delta > 0 ? `+${delta}` : `${delta}`;

  return (
    <motion.div
      id="home-momentum-badge"
      data-tour="home-momentum-badge"
      layout
      initial={false}
      animate={{
        scale: expanded ? 1.05 : 1,
        paddingLeft: expanded ? 28 : 16,
        paddingRight: expanded ? 28 : 16,
        paddingTop: expanded ? 10 : 6,
        paddingBottom: expanded ? 10 : 6,
        gap: expanded ? 10 : 6,
        minWidth: expanded ? 188 : 120,
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
      <motion.span
        animate={{ x: expanded ? -6 : 0 }}
        transition={ISLAND_SPRING}
        className={`whitespace-nowrap ${darkMode ? 'text-blue-400' : 'text-emerald-600'}`}
      >
        Momentum
      </motion.span>
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
  );
};
