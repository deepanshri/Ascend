import React, { useEffect, useState } from 'react';
import { animate, motion, useMotionValue } from 'motion/react';
import pieceGreenDark from '../assets/bowl/piece-green-dark.webp';
import pieceGreenLight from '../assets/bowl/piece-green-light.webp';
import pieceBlueDark from '../assets/bowl/piece-blue-dark.webp';
import pieceBlueLight from '../assets/bowl/piece-blue-light.webp';
import { playCompletionSound } from '../utils/feedback';

/** Organic self-scaling emergence duration on the habit bar. */
const EMERGENCE_MS = 240;
/** Kinetic pre-launch anticipation duration. */
const ANTICIPATION_MS = 120;
/** Total wait time (360ms) before the throw begins. */
const TOTAL_HOLD_MS = EMERGENCE_MS + ANTICIPATION_MS; // 360ms
/** Natural physical gravity flight arc into the bowl cavity (+0.5s slower, majestic & smooth). */
const FLIGHT_MS = 1120;
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

    // --- PHASE 1: ORGANIC SELF-SCALING EMERGENCE ---
    try {
      emergenceControls = animate(0, 1, {
        duration: EMERGENCE_MS / 1000,
        ease: [0.34, 1.56, 0.64, 1], // Organic elastic scale-up curve
        onUpdate: (v) => {
          scale.set(v * 1.25);
          opacity.set(Math.min(1, v * 2.8));
          rotate.set(v * 180);
        },
        onComplete: () => {
          scale.set(1.05);
          opacity.set(1);
          rotate.set(180);

          // --- PHASE 2: KINETIC ANTICIPATION & COIL ---
          try {
            anticipationControls = animate(1.05, 0.95, {
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
      rotate.set(180);
    }

    // --- PHASE 3: PARABOLIC THROW LAUNCH (+0.5s SLOWER, ORGANIC GRAVITY) ---
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
      const bowlTop = bowlFrame ? bowlFrame.getBoundingClientRect().top : targetTo.y - 48;

      // Force Y_apex at least 55px ABOVE the top rim of the bowl for an organic, majestic arc
      const yApex = Math.max(16, Math.min(bowlTop - 55, targetTo.y - 95, startFrom.y - 120));
      const apexT = 0.44; // Peak of the throw at 44% of the flight
      const landingScale = 10 / 24; // 0.4167, exactly 10px diameter matching resting bowl pieces

      try {
        launchControls = animate(0, 1, {
          duration: FLIGHT_MS / 1000,
          ease: 'linear', // Pure normalized time; physical gravity curves below
          onUpdate: (t) => {
            // Horizontal travel: smooth energetic start, easing gently over the bowl
            const xProgress = Math.sin(t * Math.PI * 0.5);
            x.set(startFrom.x + (targetTo.x - startFrom.x) * xProgress);

            // Vertical travel: parabolic physical gravity arc
            let currentY: number;
            if (t <= apexT) {
              const u = t / apexT;
              // Smooth upward deceleration to zero velocity at apex
              currentY = yApex + (startFrom.y - yApex) * Math.pow(1 - u, 2.2);
            } else {
              const p = (t - apexT) / (1 - apexT);
              // Downward gravity acceleration straight into the cavity floor
              currentY = yApex + (targetTo.y - yApex) * Math.pow(p, 1.85);
            }
            y.set(currentY);

            // Perspective scale: swells in midair, then tapers down to exact 10px piece size
            let currentScale: number;
            if (t <= apexT) {
              const u = t / apexT;
              currentScale = 0.95 + Math.sin(u * Math.PI * 0.5) * 0.30;
            } else {
              const p = (t - apexT) / (1 - apexT);
              currentScale = 1.25 - (1.25 - landingScale) * Math.sin(p * Math.PI * 0.5);
            }
            scale.set(currentScale);

            // Organic tumbling rotation
            rotate.set(180 + t * 450);
            rotateX.set(Math.sin(t * Math.PI) * 28);

            // Soft handover into resting piece as it plunges into the cavity floor
            if (t > 0.90) {
              opacity.set(Math.max(0, 1 - (t - 0.90) / 0.10));
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
    // Target resting position deep inside bowl cavity floor (56% down into the piece cluster)
    to: bowlTarget
      ? {
          x: bowlTarget.getBoundingClientRect().left,
          y: bowlTarget.getBoundingClientRect().top,
        }
      : {
          x: b.left + b.width * 0.5,
          y: b.top + b.height * 0.56,
        },
  };
}
