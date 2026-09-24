import React, { useEffect, useMemo, useRef } from 'react';
import { animate, motion, useMotionValue } from 'motion/react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { playCompletionSound } from '../utils/feedback';
import { BOWL_COLORS, normalizeHabitColor } from '../utils/colors';

/** Organic 120 FPS flight duration into the bowl rim opening (synchronized 600ms). */
const FLIGHT_MS = 600;
const PIECE_PX = 28;
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
  color?: string;
}

interface FlyingPieceOverlayProps {
  flights: PieceFlight[];
  onFlightComplete: (flightId: string, pieceId: string) => void;
}

/** Pure 3D WebGL rotating marble matching the geometry and material of bowl marbles */
function FlyingSphereMesh({ color }: { color: string }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const resolvedColor = useMemo(() => new THREE.Color(normalizeHabitColor(color)), [color]);

  useFrame((_, delta) => {
    if (meshRef.current) {
      meshRef.current.rotation.x += delta * 4.8;
      meshRef.current.rotation.y += delta * 6.5;
    }
  });

  return (
    <mesh ref={meshRef}>
      <sphereGeometry args={[0.82, 32, 32]} />
      <meshStandardMaterial
        color={resolvedColor}
        roughness={0.18}
        metalness={0.12}
      />
    </mesh>
  );
}

const FlightMarble: React.FC<{
  flight: PieceFlight;
  onDone: () => void;
}> = ({ flight, onDone }) => {
  const x = useMotionValue(flight.from.x);
  const y = useMotionValue(flight.from.y);
  const scale = useMotionValue(0.5);
  const opacity = useMotionValue(1);

  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  const isFallback = flight.kind === 'fallback';

  // Strict adherence to locked Blue/Green/Orange palette with darkened dark green
  const sphereColor = normalizeHabitColor(
    flight.color ||
      (flight.isDark
        ? isFallback
          ? BOWL_COLORS.light_blue
          : BOWL_COLORS.blue
        : isFallback
        ? BOWL_COLORS.light_green
        : BOWL_COLORS.dark_green)
  );

  const glowColor = useMemo(() => {
    const hex = sphereColor.toLowerCase();
    if (hex === BOWL_COLORS.dark_green || hex === '#064e3b') return 'rgba(6, 78, 59, 0.55)';
    if (hex === BOWL_COLORS.light_green || hex === '#34d399') return 'rgba(52, 211, 153, 0.45)';
    if (hex === BOWL_COLORS.orange || hex === '#ea580c') return 'rgba(234, 88, 12, 0.55)';
    if (hex === BOWL_COLORS.light_blue || hex === '#60a5fa') return 'rgba(96, 165, 250, 0.45)';
    return 'rgba(37, 99, 235, 0.55)';
  }, [sphereColor]);

  useEffect(() => {
    let finished = false;
    let launchControls: { stop: () => void } | null = null;

    const finish = () => {
      if (finished) return;
      finished = true;
      onDoneRef.current?.();
    };

    // Trigger completion chime immediately at throw launch
    try {
      playCompletionSound();
    } catch {
      /* audio failure must never block animation */
    }

    const startFrom = flight.from;
    const targetTo = flight.to;

    // Pseudo-random deterministic parameters from flight id for distinct arcs
    let seed = 0;
    for (let i = 0; i < flight.id.length; i++) {
      seed = (seed * 31 + flight.id.charCodeAt(i)) & 0xffffffff;
    }
    const rand1 = (seed & 0xffff) / 0xffff;
    const rand2 = ((seed >>> 16) & 0xffff) / 0xffff;
    const rand3 = Math.abs(Math.sin(seed));

    // Dynamic arc variation: height varies above bowl top rim
    const apexLift = 50 + rand1 * 35;
    const yApex = Math.min(startFrom.y, targetTo.y) - apexLift;

    // Dynamic apex timing along the throw (38% to 48%)
    const apexT = 0.38 + rand2 * 0.10;

    // Dynamic lateral curvature (natural air sway)
    const lateralCurvature = (rand3 - 0.5) * 40;

    try {
      launchControls = animate(0, 1, {
        duration: FLIGHT_MS / 1000,
        ease: 'linear', // Time is linear; physical parabolic curve calculated below
        onUpdate: (t) => {
          // Horizontal travel: energetic start easing smoothly into the rim aperture
          const xProg = Math.sin(t * Math.PI * 0.5);
          const sway = Math.sin(t * Math.PI) * lateralCurvature;
          const curX = startFrom.x + (targetTo.x - startFrom.x) * xProg + sway;

          // Vertical travel: parabolic physical ballistic gravity arc up to apex, then falling to rim
          let curY: number;
          if (t <= apexT) {
            const u = t / apexT;
            curY = yApex + (startFrom.y - yApex) * Math.pow(1 - u, 2.0);
          } else {
            const u = (t - apexT) / (1 - apexT);
            curY = yApex + (targetTo.y - yApex) * Math.pow(u, 2.0);
          }

          // Scale: emerges smoothly from 0.5 to full 1.0 size within first 22%
          let curScale: number;
          if (t < 0.22) {
            const su = t / 0.22;
            curScale = 0.5 + 0.5 * Math.sin(su * Math.PI * 0.5);
          } else {
            curScale = 1.0;
          }

          x.set(curX);
          y.set(curY);
          scale.set(curScale);
          // Opacity remains 100% full right up to handoff at t=1.0 to prevent disappearing
          opacity.set(1);
        },
        onComplete: finish,
      });
    } catch {
      finish();
    }

    return () => {
      launchControls?.stop();
    };
  }, [flight.id, flight.from, flight.to]);

  return (
    <motion.div
      aria-hidden="true"
      className="pointer-events-none fixed will-change-transform"
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
        transform: 'translate3d(0, 0, 0)',
      }}
    >
      {/* Radiant particle aura */}
      <div
        className="pointer-events-none absolute -inset-2.5 rounded-full animate-pulse blur-xs"
        style={{
          background: `radial-gradient(circle, ${glowColor} 0%, transparent 72%)`,
        }}
      />

      {/* High-Fidelity 3D WebGL Sphere */}
      <Canvas
        gl={{ alpha: true, antialias: true, powerPreference: 'high-performance' }}
        camera={{ position: [0, 0, 2.1], fov: 45 }}
        className="pointer-events-none h-full w-full"
      >
        <ambientLight intensity={0.55} />
        <directionalLight position={[2, 4, 3]} intensity={1.2} color="#ffffff" />
        <directionalLight position={[-2, 1, 1]} intensity={0.4} color="#ffffff" />
        <FlyingSphereMesh color={sphereColor} />
      </Canvas>
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

/** Resolve card swipe point → bowl top rim opening for a continuous parabolic flight. */
export function measureCompletionFlight(
  habitId: string,
  direction?: 'left' | 'right',
  customOrigin?: { x: number; y: number }
): { from: { x: number; y: number }; to: { x: number; y: number } } {
  const card = document.getElementById(`habit-card-${habitId}`);
  const bowlFrame = document.getElementById('accumulation-bowl-frame');
  const bowl = bowlFrame || document.getElementById('accumulation-bowl');

  const screenW = typeof window !== 'undefined' ? window.innerWidth : 390;
  const screenH = typeof window !== 'undefined' ? window.innerHeight : 844;

  let fromX: number;
  let fromY: number;

  if (customOrigin && Number.isFinite(customOrigin.x) && Number.isFinite(customOrigin.y)) {
    fromX = customOrigin.x;
    fromY = customOrigin.y;
  } else if (card) {
    const a = card.getBoundingClientRect();
    if (direction === 'left') {
      fromX = a.left + 48;
      fromY = a.top + a.height * 0.5;
    } else {
      fromX = a.right - 48;
      fromY = a.top + a.height * 0.5;
    }
  } else {
    fromX = direction === 'left' ? screenW * 0.25 : screenW * 0.75;
    fromY = screenH * 0.65;
  }

  // Target precisely the top rim aperture of the 3D bowl in screen space (25-30% down from top)
  const rimJitterX = (Math.random() - 0.5) * 12;
  const rimJitterY = (Math.random() - 0.5) * 6;

  let toX = screenW * 0.5 + rimJitterX;
  let toY = screenH * 0.28 + rimJitterY;

  if (bowlFrame || bowl) {
    const b = (bowlFrame || bowl)!.getBoundingClientRect();
    if (b.width > 0 && b.height > 0) {
      toX = b.left + b.width * 0.5 + rimJitterX;
      toY = b.top + b.height * 0.45 + rimJitterY;
    }
  }

  return {
    from: { x: fromX, y: fromY },
    to: { x: toX, y: toY },
  };
}
