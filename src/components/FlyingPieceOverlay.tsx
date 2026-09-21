import React, { useEffect, useState } from 'react';
import { animate, motion, useMotionValue } from 'motion/react';
import pieceGreenDark from '../assets/bowl/piece-green-dark.webp';
import pieceGreenLight from '../assets/bowl/piece-green-light.webp';
import pieceBlueDark from '../assets/bowl/piece-blue-dark.webp';
import pieceBlueLight from '../assets/bowl/piece-blue-light.webp';
import { playCompletionSound } from '../utils/feedback';

/** Organic self-scaling emergence duration on the habit bar. */
const EMERGENCE_MS = 320;
/** Kinetic pre-launch anticipation duration. */
const ANTICIPATION_MS = 170;
/** Total wait time reduced by 30% (from 700ms down to 490ms). */
const TOTAL_HOLD_MS = EMERGENCE_MS + ANTICIPATION_MS; // 490ms
/** Natural physical gravity flight arc into the bowl cavity. */
const FLIGHT_MS = 620;
const PIECE_PX = 24;
const MAX_FLIGHTS = 4;

export interface PieceFlight {
  /** Unique flight instance id. */
  id: string;
  /** Matches AccumulationPiece.id (`habitId::isoDate`) — hidden in bowl until land. */
  pieceId: string;
  kind: 'full' | 'fallback';
  from: { x: number; y: number };
  to: { x: number; y: number };
  isDark: boolean;
  direction?: 'left' | 'right';
}

interface FlyingPieceOverlayProps {
  flights: PieceFlight[];
  onFlightComplete: (flightId: string, pieceId: string) => void;
}

function asAssetUrl(value: unknown): string {
  if (typeof value === 'string' && value.length > 0) return value;
  if (value && typeof value === 'object' && 'default' in (value as object)) {
    const nested = (value as { default: unknown }).default;
    if (typeof nested === 'string' && nested.length > 0) return nested;
  }
  return String(value ?? '');
}

function pieceSrc(isDark: boolean, isFallback: boolean): string {
  if (isDark) {
    return asAssetUrl(isFallback ? pieceBlueLight : pieceBlueDark) || asAssetUrl(pieceBlueDark);
  }
  return asAssetUrl(isFallback ? pieceGreenLight : pieceGreenDark) || asAssetUrl(pieceGreenDark);
}

/** Cubic Bézier for authentic top-down parabolic free-fall trajectory. */
function cubic(t: number, a: number, b: number, c: number, d: number): number {
  const u = 1 - t;
  return u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c + t * t * t * d;
}

const FlightMarble: React.FC<{
  flight: PieceFlight;
  onDone: () => void;
}> = ({ flight, onDone }) => {
  const x = useMotionValue(flight.from.x);
  const y = useMotionValue(flight.from.y);
  // Phase 1 (Emergence & Self-Scaling): Starts at scale 0, opacity 0, organically self-scaling up
  const scale = useMotionValue(0);
  const opacity = useMotionValue(0);
  const rotate = useMotionValue(0);
  const rotateX = useMotionValue(0);
  const [broken, setBroken] = useState(false);
  const onDoneRef = React.useRef(onDone);
  onDoneRef.current = onDone;
  const isFallback = flight.kind === 'fallback';
  const src = pieceSrc(flight.isDark, isFallback);
  const tone = isFallback
    ? flight.isDark
      ? 'bg-blue-400'
      : 'bg-emerald-400'
    : flight.isDark
      ? 'bg-blue-500'
      : 'bg-emerald-500';

  const glowColor = flight.isDark
    ? isFallback
      ? 'rgba(96, 165, 250, 0.65)'
      : 'rgba(59, 130, 246, 0.75)'
    : isFallback
      ? 'rgba(52, 211, 153, 0.65)'
      : 'rgba(16, 185, 129, 0.75)';

  useEffect(() => {
    let finished = false;
    let holdTimer: number | null = null;
    let emergenceControls: { stop: () => void } | null = null;
    let anticipationControls: { stop: () => void } | null = null;
    let launchControls: { stop: () => void } | null = null;

    const finish = () => {
      if (finished) return;
      finished = true;
      onDoneRef.current?.();
    };

    const habitId = flight.pieceId.split('::')[0];
    const isLeft = flight.direction === 'left' || flight.kind === 'fallback';

    // Keep the piece anchored over the completed checkmark / today button during the hold
    const updateCardAnchor = () => {
      const card = document.getElementById(`habit-card-${habitId}`);
      if (card) {
        const todayBtn =
          card.querySelector('[data-today-button="true"]') ||
          document.getElementById(`habit-today-btn-${habitId}`);
        if (todayBtn) {
          const tRect = todayBtn.getBoundingClientRect();
          x.set(tRect.left + tRect.width * 0.5);
          y.set(tRect.top + tRect.height * 0.5);
        } else {
          const a = card.getBoundingClientRect();
          x.set(isLeft ? a.right - 36 : a.left + 36);
          y.set(a.top + a.height * 0.5);
        }
      }
    };

    window.addEventListener('scroll', updateCardAnchor, { passive: true });

    // --- PHASE 1: ORGANIC SELF-SCALING EMERGENCE (0 to 320ms) ---
    // Smoothly expands and scales itself up from 0 to 1.28 with elastic blossom curve
    try {
      emergenceControls = animate(0, 1, {
        duration: EMERGENCE_MS / 1000,
        ease: [0.34, 1.56, 0.64, 1], // Organic elastic scale-up curve
        onUpdate: (v) => {
          // Self-scaling curve: elastic swell to 1.28 then settle to 1.05
          scale.set(v * 1.28);
          opacity.set(Math.min(1, v * 2.8));
          rotate.set(v * 220);
        },
        onComplete: () => {
          scale.set(1.05);
          opacity.set(1);
          rotate.set(220);

          // --- PHASE 2: KINETIC ANTICIPATION & COIL (320ms to 490ms) ---
          // Pre-launch compression that coils energy right before liftoff
          try {
            anticipationControls = animate(1.05, 0.94, {
              duration: ANTICIPATION_MS / 1000,
              ease: 'easeInOut',
              onUpdate: (s) => {
                scale.set(s);
              },
            });
          } catch {}
        },
      });
    } catch {
      scale.set(1);
      opacity.set(1);
      rotate.set(220);
    }

    // --- PHASE 3: PARABOLIC LAUNCH (AFTER 490ms HOLD - REDUCED BY 30%) ---
    holdTimer = window.setTimeout(() => {
      window.removeEventListener('scroll', updateCardAnchor);
      emergenceControls?.stop();
      anticipationControls?.stop();

      // Trigger completion audio precisely at the moment of launch
      try {
        playCompletionSound();
      } catch {
        /* audio failure must never block animation */
      }

      // Live measurements at launch moment
      const swipeDir = flight.direction || (isFallback ? 'left' : 'right');
      const livePoints = measureCompletionFlight(habitId, swipeDir);
      const startFrom = livePoints ? livePoints.from : { x: x.get(), y: y.get() };
      const targetTo = livePoints ? livePoints.to : flight.to;

      const bowlFrame = document.getElementById('accumulation-bowl-frame');
      const bowlTop = bowlFrame ? bowlFrame.getBoundingClientRect().top : targetTo.y - 45;

      // Force Y_apex at least 65px ABOVE the top rim of the bowl container
      const yApex = Math.min(bowlTop - 65, targetTo.y - 90, startFrom.y - 120);

      // Trajectory control points:
      const c1X = startFrom.x + (targetTo.x - startFrom.x) * 0.25;
      const c1Y = yApex;
      const c2X = targetTo.x;
      const c2Y = yApex;

      try {
        launchControls = animate(0, 1, {
          duration: FLIGHT_MS / 1000,
          ease: [0.22, 0.88, 0.36, 1], // Natural physical gravity curve
          onUpdate: (t) => {
            x.set(cubic(t, startFrom.x, c1X, c2X, targetTo.x));
            y.set(cubic(t, startFrom.y, c1Y, c2Y, targetTo.y));

            // Dynamic 3D scale pop at apex then smooth scale taper to match resting bowl pieces
            scale.set(1.15 + Math.sin(t * Math.PI) * 0.38 - t * 0.22);

            // Continuous rapid multi-turn 3D tumbling rotation
            rotate.set(220 + t * 720);
            rotateX.set(Math.sin(t * Math.PI) * 45);

            // Handover opacity right as it drops through the rim into resting position
            if (t > 0.94) {
              opacity.set(1 - (t - 0.94) / 0.06);
            }
          },
          onComplete: finish,
        });
      } catch {
        finish();
      }
    }, TOTAL_HOLD_MS);

    return () => {
      window.removeEventListener('scroll', updateCardAnchor);
      if (holdTimer !== null) window.clearTimeout(holdTimer);
      emergenceControls?.stop();
      anticipationControls?.stop();
      launchControls?.stop();
    };
    // Animate once per flight id
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flight.id]);

  return (
    <motion.div
      aria-hidden="true"
      className="pointer-events-none fixed will-change-transform gpu-smooth"
      style={{
        zIndex: 9999,
        width: PIECE_PX,
        height: PIECE_PX,
        marginLeft: -PIECE_PX / 2,
        marginTop: -PIECE_PX / 2,
        left: 0,
        top: 0,
        x,
        y,
        scale,
        opacity,
        rotate,
        rotateX,
        perspective: 800,
        transformStyle: 'preserve-3d',
      }}
    >
      {/* Radiant particle aura */}
      <div
        className="pointer-events-none absolute -inset-2 rounded-full animate-pulse blur-xs"
        style={{
          background: `radial-gradient(circle, ${glowColor} 0%, transparent 70%)`,
        }}
      />
      {broken || !src ? (
        <span className={`relative block h-full w-full rounded-full shadow-lg ${tone}`} />
      ) : (
        <img
          src={src}
          alt=""
          draggable={false}
          onError={() => setBroken(true)}
          className="relative pointer-events-none h-full w-full rounded-full object-contain drop-shadow-[0_4px_10px_rgba(0,0,0,0.35)]"
        />
      )}
    </motion.div>
  );
};

export const FlyingPieceOverlay: React.FC<FlyingPieceOverlayProps> = ({
  flights,
  onFlightComplete,
}) => {
  const visible = (flights || []).slice(-MAX_FLIGHTS);

  return (
    <>
      {visible.map((flight) => (
        <FlightMarble
          key={flight.id}
          flight={flight}
          onDone={() => onFlightComplete?.(flight.id, flight.pieceId)}
        />
      ))}
    </>
  );
};

/** Resolve card checkmark → bowl base for an authentic top-down parabolic flight. */
export function measureCompletionFlight(
  habitId: string,
  direction?: 'left' | 'right'
): { from: { x: number; y: number }; to: { x: number; y: number } } | null {
  const card = document.getElementById(`habit-card-${habitId}`);
  const bowlFrame = document.getElementById('accumulation-bowl-frame');
  const bowlTarget = document.getElementById('accumulation-bowl-target');
  const bowl = bowlFrame || bowlTarget || document.getElementById('accumulation-bowl');
  if (!card || !bowl) return null;

  const a = card.getBoundingClientRect();
  const b = (bowlFrame || bowl).getBoundingClientRect();

  // Anchor directly over the today day button if present, or swipe checkmark
  let fromX: number;
  let fromY: number;

  const todayBtn =
    card.querySelector('[data-today-button="true"]') ||
    document.getElementById(`habit-today-btn-${habitId}`) ||
    card.querySelector('button[id*="-day-"]');
  if (todayBtn) {
    const tRect = todayBtn.getBoundingClientRect();
    fromX = tRect.left + tRect.width * 0.5;
    fromY = tRect.top + tRect.height * 0.5;
  } else if (direction === 'left') {
    fromX = a.right - 36;
    fromY = a.top + a.height * 0.5;
  } else {
    fromX = a.left + 36;
    fromY = a.top + a.height * 0.5;
  }

  return {
    from: { x: fromX, y: fromY },
    // Target resting position inside bowl base
    to: {
      x: b.left + b.width * 0.5,
      y: b.top + b.height * 0.48,
    },
  };
}
