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
/** Natural physical gravity flight arc into the bowl cavity without pauses. */
const FLIGHT_MS = 880;
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
  // Starts with subtle scale and immediately scales up in flight — zero pause
  const scale = useMotionValue(0.4);
  const opacity = useMotionValue(0.85);
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
    let launchControls: { stop: () => void } | null = null;

    const finish = () => {
      if (finished) return;
      finished = true;
      onDoneRef.current?.();
    };

    // Trigger completion chime immediately at throw launch — zero pause
    try {
      playCompletionSound();
    } catch {
      /* audio failure must never block animation */
    }

    const startFrom = flight.from;
    const targetTo = flight.to;

    const bowlFrame = document.getElementById('accumulation-bowl-frame');
    const bowlTop = bowlFrame ? bowlFrame.getBoundingClientRect().top : targetTo.y - 48;

    // Pseudo-random deterministic parameters from flight id for per-swipe distinct arcs
    let seed = 0;
    for (let i = 0; i < flight.id.length; i++) {
      seed = (seed * 31 + flight.id.charCodeAt(i)) & 0xffffffff;
    }
    const rand1 = ((seed & 0xffff) / 0xffff);
    const rand2 = (((seed >>> 16) & 0xffff) / 0xffff);
    const rand3 = Math.abs(Math.sin(seed));

    // Dynamic arc variation: height varies above bowl top rim
    const apexLift = 40 + rand1 * 40;
    const yApex = Math.min(bowlTop - apexLift, Math.min(startFrom.y, targetTo.y) - 50);

    // Dynamic apex timing along the throw (34% to 48%)
    const apexT = 0.34 + rand2 * 0.14;

    // Dynamic lateral curvature (sway in air)
    const lateralCurvature = (rand3 - 0.5) * 55;

    // Rim contact point where the marble transitions direction and speed
    const rimT = 0.70;
    const rimX = targetTo.x + (rand1 - 0.5) * 24;
    const rimY = bowlTop + 14;

    const landingScale = 10 / 24; // 0.4167, exactly 10px diameter matching resting bowl pieces

    try {
      launchControls = animate(0, 1, {
        duration: FLIGHT_MS / 1000,
        ease: 'linear', // Normalized time; physical gravity curves below
        onUpdate: (t) => {
          let curX: number;
          let curY: number;
          let curScale: number;

          if (t <= rimT) {
            // --- STAGE 1: AIRBORNE BALLISTIC ARC (Card to Bowl Rim) ---
            const u = t / rimT; // 0 to 1

            // Horizontal travel: energetic start, easing toward rim
            const xProg = Math.sin(u * Math.PI * 0.5);
            const sway = Math.sin(u * Math.PI) * lateralCurvature;
            curX = startFrom.x + (rimX - startFrom.x) * xProg + sway;

            // Vertical travel: parabolic physical gravity arc up to apex, then falling to rim
            if (u <= apexT) {
              const au = u / apexT;
              curY = yApex + (startFrom.y - yApex) * Math.pow(1 - au, 2.0);
            } else {
              const ad = (u - apexT) / (1 - apexT);
              curY = yApex + (rimY - yApex) * Math.pow(ad, 1.8);
            }

            // Continuous scale: emerges immediately from 0.40 to 1.15 in first 20%, then glides
            if (u < 0.20) {
              const su = u / 0.20;
              curScale = 0.40 + (1.15 - 0.40) * Math.sin(su * Math.PI * 0.5);
              opacity.set(Math.min(1, 0.4 + su * 0.6));
            } else {
              curScale = 1.15 - (u - 0.20) * 0.12;
              opacity.set(1);
            }
          } else {
            // --- STAGE 2: RIM DEFLECTION (Direction & Speed Change into Cavity Floor) ---
            const p = (t - rimT) / (1 - rimT); // 0 to 1

            // Direction curves sharply inward towards resting center target
            const inwardEase = Math.sin(p * Math.PI * 0.5);
            curX = rimX + (targetTo.x - rimX) * inwardEase;

            // Speed changes: plunges with dampened deceleration into cavity floor
            curY = rimY + (targetTo.y - rimY) * Math.pow(p, 1.45);

            // Scales down smoothly to resting 10px piece size
            curScale = 1.09 - (1.09 - landingScale) * Math.sin(p * Math.PI * 0.5);

            // Soft handover into resting marble in cavity floor
            if (p > 0.70) {
              opacity.set(Math.max(0, 1 - (p - 0.70) / 0.30));
            }
          }

          x.set(curX);
          y.set(curY);
          scale.set(curScale);
          rotate.set(t * 540);
          rotateX.set(Math.sin(t * Math.PI) * 32);
        },
        onComplete: finish,
      });
    } catch {
      finish();
    }

    return () => {
      launchControls?.stop();
    };
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

/** Resolve card swipe point → bowl base for an authentic continuous parabolic flight. */
export function measureCompletionFlight(
  habitId: string,
  direction?: 'left' | 'right',
  customOrigin?: { x: number; y: number }
): { from: { x: number; y: number }; to: { x: number; y: number } } | null {
  const card = document.getElementById(`habit-card-${habitId}`);
  const bowlFrame = document.getElementById('accumulation-bowl-frame');
  const bowlTarget = document.getElementById('accumulation-bowl-target');
  const bowl = bowlFrame || bowlTarget || document.getElementById('accumulation-bowl');
  if (!card || !bowl) return null;

  const a = card.getBoundingClientRect();
  const b = (bowlFrame || bowl).getBoundingClientRect();

  let fromX: number;
  let fromY: number;

  if (customOrigin && Number.isFinite(customOrigin.x) && Number.isFinite(customOrigin.y)) {
    fromX = customOrigin.x;
    fromY = customOrigin.y;
  } else {
    // If swiped right: release point is towards the right side of the card
    // If swiped left: release point is towards the left side of the card
    if (direction === 'left') {
      fromX = a.left + 48;
      fromY = a.top + a.height * 0.5;
    } else {
      fromX = a.right - 48;
      fromY = a.top + a.height * 0.5;
    }
  }

  // Target resting position inside bowl cavity floor with organic spread
  const targetJitterX = (Math.random() - 0.5) * 16;
  const targetJitterY = (Math.random() - 0.5) * 10;

  const toX = bowlTarget
    ? bowlTarget.getBoundingClientRect().left + targetJitterX
    : b.left + b.width * 0.5 + targetJitterX;
  const toY = bowlTarget
    ? bowlTarget.getBoundingClientRect().top + targetJitterY
    : b.top + b.height * 0.56 + targetJitterY;

  return {
    from: { x: fromX, y: fromY },
    to: { x: toX, y: toY },
  };
}
