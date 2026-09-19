import React, { useEffect, useRef, useState } from 'react';
import { animate, motion, useMotionValue, useTransform } from 'motion/react';

const COLLAPSED_WIDTH = 120;
const EXPANDED_WIDTH = 188;
const EXPAND_MS = 0.3;
const DELTA_IN_MS = 0.2;
const COUNT_MS = 0.8;
const DELTA_READ_DELAY_MS = 0.5;
const DELTA_OUT_MS = 0.2;
const CONTRACT_MS = 0.3;

export interface MomentumPillProps {
  momentumScore: number;
  /** Increments on each habit completion / miss so the island always pulses. */
  momentumPulse?: number;
  isDark?: boolean;
}

/**
 * Apple-style Dynamic Island momentum pill.
 * Strict sequence: expand → show delta → count → hide delta → contract.
 */
export const MomentumPill: React.FC<MomentumPillProps> = ({
  momentumScore,
  momentumPulse = 0,
  isDark = false,
}) => {
  const targetScore = Math.round(Number.isFinite(momentumScore) ? momentumScore : 0);
  const darkMode = Boolean(isDark);

  const [delta, setDelta] = useState<number | null>(null);
  const [displayMomentum, setDisplayMomentum] = useState(targetScore);

  const displayRef = useRef(targetScore);
  const pulseRef = useRef(momentumPulse);
  const animatingRef = useRef(false);
  const runIdRef = useRef(0);
  /** Captured during render when pulse fires — before hydrate can snap the score. */
  const pendingPulseRef = useRef<{ from: number; to: number } | null>(null);

  if (momentumPulse > pulseRef.current) {
    pendingPulseRef.current = {
      from: displayRef.current,
      to: targetScore,
    };
    animatingRef.current = true;
  }
  pulseRef.current = momentumPulse;

  const pillWidth = useMotionValue(COLLAPSED_WIDTH);
  const deltaOpacity = useMotionValue(0);
  const count = useMotionValue(displayRef.current);
  const rounded = useTransform(count, (value) => Math.round(value));

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
    const runId = ++runIdRef.current;
    const isLive = () => runId === runIdRef.current;

    const stoppers: Array<{ stop: () => void }> = [];
    const run = (controls: { stop: () => void }) => {
      stoppers.push(controls);
      return controls;
    };

    count.set(from);
    displayRef.current = from;
    setDisplayMomentum(from);
    setDelta(nextDelta !== 0 ? nextDelta : null);
    deltaOpacity.set(0);
    animatingRef.current = true;

    void (async () => {
      try {
        // 1) Expand pill
        await new Promise<void>((resolve) => {
          run(
            animate(pillWidth, EXPANDED_WIDTH, {
              duration: EXPAND_MS,
              ease: [0.22, 1, 0.36, 1],
              onComplete: () => resolve(),
            })
          );
        });
        if (!isLive()) return;

        // 2) Show delta (only when score actually changed)
        if (nextDelta !== 0) {
          await new Promise<void>((resolve) => {
            run(
              animate(deltaOpacity, 1, {
                duration: DELTA_IN_MS,
                ease: 'easeOut',
                onComplete: () => resolve(),
              })
            );
          });
          if (!isLive()) return;
        }

        // 3) Count up / down while delta stays visible
        if (from !== to) {
          await new Promise<void>((resolve) => {
            run(
              animate(count, to, {
                duration: COUNT_MS,
                ease: 'easeOut',
                onComplete: () => {
                  displayRef.current = to;
                  setDisplayMomentum(to);
                  resolve();
                },
              })
            );
          });
          if (!isLive()) return;
        } else {
          // Pulse with no score change: brief hold at expanded width
          await new Promise<void>((resolve) => {
            window.setTimeout(resolve, DELTA_READ_DELAY_MS * 1000);
          });
          if (!isLive()) return;
        }

        // 4) Hold so the delta is readable, then fade it out
        if (nextDelta !== 0) {
          await new Promise<void>((resolve) => {
            run(
              animate(deltaOpacity, 0, {
                duration: DELTA_OUT_MS,
                delay: DELTA_READ_DELAY_MS,
                ease: 'easeIn',
                onComplete: () => resolve(),
              })
            );
          });
          if (!isLive()) return;
          setDelta(null);
        }

        // 5) Contract pill
        await new Promise<void>((resolve) => {
          run(
            animate(pillWidth, COLLAPSED_WIDTH, {
              duration: CONTRACT_MS,
              ease: [0.22, 1, 0.36, 1],
              onComplete: () => resolve(),
            })
          );
        });
      } finally {
        if (isLive()) {
          displayRef.current = to;
          count.set(to);
          setDisplayMomentum(to);
          setDelta(null);
          deltaOpacity.set(0);
          pillWidth.set(COLLAPSED_WIDTH);
          animatingRef.current = false;
        }
      }
    })();

    return () => {
      runIdRef.current += 1;
      stoppers.forEach((c) => c.stop());
    };
  }, [momentumPulse, count, pillWidth, deltaOpacity]);

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
      }}
      className={`inline-flex items-center justify-center rounded-full border text-[11px] font-bold tabular-nums transform-gpu will-change-[width] overflow-hidden px-4 py-1.5 gap-1.5 ${
        darkMode
          ? 'bg-slate-900/95 border-blue-500/50 text-blue-200'
          : 'bg-white/95 border-emerald-200 text-emerald-800 shadow-sm'
      }`}
      title="Live momentum score"
    >
      <span className={`whitespace-nowrap ${darkMode ? 'text-blue-400' : 'text-emerald-600'}`}>
        Momentum
      </span>
      <span className="text-[13px] font-black min-w-[1.75ch] text-center">{displayMomentum}</span>
      {deltaLabel ? (
        <motion.span
          style={{ opacity: deltaOpacity }}
          className={`text-[12px] font-black whitespace-nowrap ${
            darkMode
              ? 'text-blue-300 drop-shadow-[0_0_10px_rgba(59,130,246,0.95)]'
              : 'text-emerald-600 drop-shadow-[0_0_10px_rgba(16,185,129,0.85)]'
          }`}
        >
          {deltaLabel}
        </motion.span>
      ) : null}
    </motion.div>
  );
};
