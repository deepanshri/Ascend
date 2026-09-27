import React, { useEffect, useRef, useState } from 'react';
import { animate, motion, useMotionValue, useSpring } from 'motion/react';

const COLLAPSED_WIDTH = 120;
const EXPANDED_WIDTH = 188;
const EXPAND_MS = 0.3;
const DELTA_IN_MS = 0.2;
const DELTA_OUT_MS = 0.2;
const CONTRACT_MS = 0.3;
const HOLD_MS = 1000;

export interface MomentumPillProps {
  momentumScore: number;
  /** Increments when a genuine momentum vote may have changed the score. */
  momentumPulse?: number;
}

/**
 * Apple-style Dynamic Island momentum pill with smooth spring-based number interpolation.
 * Rapid score fluctuations glide smoothly without layout shifts or text jitter.
 */
const MomentumPillInner: React.FC<MomentumPillProps> = ({
  momentumScore,
  momentumPulse = 0,
}) => {
  const targetScore = Math.round(Number.isFinite(momentumScore) ? momentumScore : 0);

  const count = useMotionValue(targetScore);
  const spring = useSpring(count, { stiffness: 280, damping: 28 });
  const [displayScore, setDisplayScore] = useState(targetScore);

  const [delta, setDelta] = useState<number | null>(null);

  const pillWidth = useMotionValue(COLLAPSED_WIDTH);
  const deltaOpacity = useMotionValue(0);

  const prevScoreRef = useRef(targetScore);
  const animRunningRef = useRef(false);
  const animTimeoutRef = useRef<number | null>(null);
  const pillControlsRef = useRef<Array<{ stop: () => void }>>([]);

  // Subscribe to physics spring updates to render smoothly in React 19
  useEffect(() => {
    return spring.on('change', (latest) => {
      setDisplayScore(Math.round(latest));
    });
  }, [spring]);

  // Smoothly update spring target whenever momentumScore changes
  useEffect(() => {
    count.set(targetScore);
  }, [targetScore, count]);

  // Handle Dynamic Island expand/contract sequence on score change or momentumPulse
  useEffect(() => {
    const diff = targetScore - prevScoreRef.current;
    prevScoreRef.current = targetScore;

    if (diff === 0 && momentumPulse === 0) return;

    if (diff !== 0) {
      setDelta(diff);
    }

    // If an animation sequence is currently active, refresh hold timeout rather than thrashing
    if (animRunningRef.current) {
      if (animTimeoutRef.current) window.clearTimeout(animTimeoutRef.current);
      animTimeoutRef.current = window.setTimeout(() => {
        closePill();
      }, HOLD_MS);
      return;
    }

    if (diff === 0) return;

    // Start expand sequence
    animRunningRef.current = true;
    pillControlsRef.current.forEach((c) => c.stop());
    pillControlsRef.current = [];

    const c1 = animate(pillWidth, EXPANDED_WIDTH, {
      duration: EXPAND_MS,
      ease: [0.22, 1, 0.36, 1],
    });
    const c2 = animate(deltaOpacity, 1, {
      duration: DELTA_IN_MS,
      ease: 'easeOut',
    });
    pillControlsRef.current.push(c1, c2);

    if (animTimeoutRef.current) window.clearTimeout(animTimeoutRef.current);
    animTimeoutRef.current = window.setTimeout(() => {
      closePill();
    }, HOLD_MS);
  }, [targetScore, momentumPulse, pillWidth, deltaOpacity]);

  const closePill = () => {
    pillControlsRef.current.forEach((c) => c.stop());
    pillControlsRef.current = [];

    const c1 = animate(deltaOpacity, 0, {
      duration: DELTA_OUT_MS,
      ease: 'easeIn',
      onComplete: () => {
        setDelta(null);
      },
    });
    const c2 = animate(pillWidth, COLLAPSED_WIDTH, {
      duration: CONTRACT_MS,
      ease: [0.22, 1, 0.36, 1],
      onComplete: () => {
        animRunningRef.current = false;
      },
    });
    pillControlsRef.current.push(c1, c2);
  };

  useEffect(() => {
    return () => {
      if (animTimeoutRef.current) window.clearTimeout(animTimeoutRef.current);
      pillControlsRef.current.forEach((c) => c.stop());
    };
  }, []);

  const deltaLabel =
    delta == null || delta === 0 ? null : delta > 0 ? `+${delta}` : `${delta}`;

  return (
    <motion.div
      id="home-momentum-badge"
      data-tour="home-momentum-badge"
      initial={false}
      style={{
        width: pillWidth,
        minWidth: pillWidth,
        contain: 'layout style',
      }}
      className="inline-flex items-center justify-center rounded-full border text-[11px] font-bold tabular-nums overflow-hidden px-3.5 py-1 gap-1.5 will-change-[width] bg-white/95 border-emerald-200 text-emerald-800 shadow-sm dark:bg-slate-900/95 dark:border-blue-500/50 dark:text-blue-200 dark:shadow-none"
      title="Live momentum score"
    >
      <span className="whitespace-nowrap text-emerald-600 dark:text-blue-400">
        Momentum
      </span>
      <span className="text-[13px] font-black min-w-[1.75ch] text-center">
        {displayScore}
      </span>
      {deltaLabel ? (
        <motion.span
          style={{ opacity: deltaOpacity }}
          className="text-[12px] font-black whitespace-nowrap text-emerald-600 drop-shadow-[0_0_10px_rgba(16,185,129,0.85)] dark:text-blue-300 dark:drop-shadow-[0_0_10px_rgba(59,130,246,0.95)]"
        >
          {deltaLabel}
        </motion.span>
      ) : null}
    </motion.div>
  );
};

export const MomentumPill = React.memo(MomentumPillInner);

