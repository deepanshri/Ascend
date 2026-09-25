import React, { Suspense, useEffect, useRef } from 'react';
import { animate, motion, useMotionValue } from 'motion/react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { playCompletionSound } from '../utils/feedback';
import { getMarbleColor } from '../utils/colors';
import {
  FLIGHT_CAMERA,
  FLIGHT_DURATION_MS,
  HANDOFF_DEFAULT_VEL,
  HANDOFF_PX_TO_WORLD,
  MARBLE_CANVAS_DPR,
  MARBLE_CANVAS_GL,
  MARBLE_PHYSICAL_MATERIAL,
  configureMarbleRenderer,
} from '../lib/marbleRenderer';
import { MarbleLightRig, StudioEnvironment } from '../lib/marbleScene';
import { getThemeIsDark, subscribeTheme } from '../lib/themeStore';

const PIECE_PX = 28;
const MAX_FLIGHTS = 4;
/** Rise mostly upward to cruise altitude (avoids sweeping through the glass). */
const RISE_END = 0.38;
/** Finish above the rim opening before the vertical drop. */
const APPROACH_END = 0.7;
/** Sample window for terminal velocity (last 5% — vertical drop only). */
const TERMINAL_SAMPLE_T = 0.95;
/** Screen-space lift above the rim handoff point before the vertical drop. */
const HOVER_LIFT_MIN = 52;
const HOVER_LIFT_SPAN = 28;

export interface FlightHandoffVelocity {
  vx: number;
  vy: number;
  vz: number;
}

export interface PieceFlight {
  /** Unique flight instance id. */
  id: string;
  /** Matches AccumulationPiece.id (`habitId::isoDate`) — hidden in bowl until land. */
  pieceId: string;
  /** Explicit completion type — drives getMarbleColor light vs solid shade. */
  isFallback: boolean;
  /** @deprecated Prefer isFallback — kept for bowl pieceId kind parity. */
  kind: 'full' | 'fallback';
  from: { x: number; y: number };
  to: { x: number; y: number };
  isDark: boolean;
  direction?: 'left' | 'right';
  /** Hex from getMarbleColor(isDark, isFallback) at throw time. */
  color?: string;
}

interface FlyingPieceOverlayProps {
  flights: PieceFlight[];
  onFlightComplete: (
    flightId: string,
    pieceId: string,
    handoff: FlightHandoffVelocity
  ) => void;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Approx half-width of the bowl frame in CSS px — used only to stay outside the glass. */
const BOWL_CLEAR_HALF_W = 92;

function riseSideX(p0x: number, rimX: number): number {
  return p0x <= rimX ? rimX - BOWL_CLEAR_HALF_W : rimX + BOWL_CLEAR_HALF_W;
}

/**
 * 1) Rise to altitude outside the bowl silhouette
 * 2) Cruise horizontally above the bowl to the hover point
 * 3) Ease-in vertical drop into the rim opening
 */
function flightPositionAt(
  p0: { x: number; y: number },
  hover: { x: number; y: number },
  rim: { x: number; y: number },
  t: number
): { x: number; y: number } {
  const sideX = riseSideX(p0.x, rim.x);
  // Where the cruise starts after a full rise — continuous with the rise end pose.
  const cruiseStartX =
    p0.y > rim.y ? lerp(sideX, hover.x, 0.35) : lerp(p0.x, hover.x, 0.35);

  if (t <= RISE_END) {
    const u = t / RISE_END;
    const eased = 1 - (1 - u) * (1 - u);
    const y = lerp(p0.y, hover.y, eased);
    let x: number;
    if (p0.y > rim.y && y > rim.y) {
      // Ascending past the glass: hold clear of the bowl column.
      x = lerp(p0.x, sideX, Math.min(1, eased * 1.4));
      if (Math.abs(x - rim.x) < BOWL_CLEAR_HALF_W) x = sideX;
    } else if (p0.y > rim.y) {
      // Crossed above the rim this frame — ease from clear side toward hover.
      x = lerp(sideX, hover.x, eased * 0.35);
    } else {
      // Already above the rim at launch — no lateral jump.
      x = lerp(p0.x, hover.x, eased * 0.35);
    }
    return { x, y };
  }
  if (t <= APPROACH_END) {
    const u = (t - RISE_END) / (APPROACH_END - RISE_END);
    const eased = u * u * (3 - 2 * u);
    return {
      x: lerp(cruiseStartX, hover.x, eased),
      y: hover.y,
    };
  }
  const u = (t - APPROACH_END) / (1 - APPROACH_END);
  const eased = u * u;
  return {
    x: rim.x,
    y: lerp(hover.y, rim.y, eased),
  };
}

/** Screen px/s → bowl world units/s (Y flipped: CSS down → world up). */
function screenDeltaToWorldVel(
  dxPx: number,
  dyPx: number,
  dtSec: number
): FlightHandoffVelocity {
  if (dtSec <= 0) {
    return { ...HANDOFF_DEFAULT_VEL };
  }
  const sx = (dxPx / dtSec) * HANDOFF_PX_TO_WORLD;
  const syScreen = (dyPx / dtSec) * HANDOFF_PX_TO_WORLD;
  // Screen Y+ is down; bowl Y+ is up.
  const vy = -syScreen;
  return {
    vx: sx * 0.55,
    vy: Math.min(vy, HANDOFF_DEFAULT_VEL.vy),
    vz: syScreen * 0.12,
  };
}

/** Pure 3D WebGL marble mesh rendered inside the persistent Canvas scene. */
function SingleFlyingMarble({
  flight,
  onDone,
}: {
  flight: PieceFlight;
  onDone: (handoff: FlightHandoffVelocity) => void;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.MeshPhysicalMaterial>(null);
  const { viewport, size } = useThree();

  const isFallback = Boolean(flight.isFallback) || flight.kind === 'fallback';
  const isDark = Boolean(flight.isDark);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  const handoffRef = useRef<FlightHandoffVelocity>({ ...HANDOFF_DEFAULT_VEL });

  const progressRef = useRef(0);
  const scaleFactorRef = useRef(0.5);

  useEffect(() => {
    let finished = false;
    let launchControls: { stop: () => void } | null = null;

    const finish = () => {
      if (finished) return;
      finished = true;
      onDoneRef.current?.(handoffRef.current);
    };

    try {
      playCompletionSound();
    } catch {
      /* audio failure must never block animation */
    }

    const startFrom = flight.from;
    const targetTo = flight.to;
    const durationSec = FLIGHT_DURATION_MS / 1000;

    let seed = 0;
    for (let i = 0; i < flight.id.length; i++) {
      seed = (seed * 31 + flight.id.charCodeAt(i)) & 0xffffffff;
    }
    const rand1 = (seed & 0xffff) / 0xffff;

    const hoverLift = HOVER_LIFT_MIN + rand1 * HOVER_LIFT_SPAN;
    const rim = targetTo;
    const hover = { x: rim.x, y: rim.y - hoverLift };
    const p0 = startFrom;

    const pNear = flightPositionAt(p0, hover, rim, TERMINAL_SAMPLE_T);
    const pEnd = flightPositionAt(p0, hover, rim, 1);
    const dtTerminal = (1 - TERMINAL_SAMPLE_T) * durationSec;
    handoffRef.current = screenDeltaToWorldVel(
      pEnd.x - pNear.x,
      pEnd.y - pNear.y,
      dtTerminal
    );
    handoffRef.current.vx *= 0.2;
    handoffRef.current.vz *= 0.2;

    if (meshRef.current) {
      (meshRef.current as any)._flightTrajectory = { p0, hover, rim };
    }

    try {
      launchControls = animate(0, 1, {
        duration: durationSec,
        ease: 'linear',
        onUpdate: (t) => {
          progressRef.current = t;
          if (t < 0.22) {
            const su = t / 0.22;
            scaleFactorRef.current = 0.5 + 0.5 * Math.sin(su * Math.PI * 0.5);
          } else {
            scaleFactorRef.current = 1.0;
          }
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

  useEffect(() => {
    const syncThrowColor = () => {
      const mat = materialRef.current;
      if (!mat) return;
      mat.color.set(flight.color || getMarbleColor(isDark, isFallback));
    };
    const syncTheme = () => {
      const mat = materialRef.current;
      if (!mat) return;
      mat.color.set(getMarbleColor(getThemeIsDark(), isFallback));
    };
    syncThrowColor();
    const unsub = subscribeTheme(syncTheme);
    return () => unsub();
  }, [flight.color, isFallback, isDark]);

  useFrame((_, delta) => {
    if (!meshRef.current) return;
    const traj = (meshRef.current as any)._flightTrajectory;
    if (!traj) return;

    const pos = flightPositionAt(traj.p0, traj.hover, traj.rim, progressRef.current);

    const worldX = (pos.x / size.width - 0.5) * viewport.width;
    const worldY = -(pos.y / size.height - 0.5) * viewport.height;

    meshRef.current.position.set(worldX, worldY, 0);

    const baseRadius = (14 / size.width) * viewport.width;
    const finalScale = baseRadius * scaleFactorRef.current;
    meshRef.current.scale.setScalar(finalScale);

    meshRef.current.rotation.x += delta * 4.8;
    meshRef.current.rotation.y += delta * 6.5;
  });

  const initialColor = flight.color || getMarbleColor(isDark, isFallback);

  return (
    <mesh ref={meshRef}>
      <sphereGeometry args={[1, 24, 24]} />
      <meshPhysicalMaterial
        ref={materialRef}
        color={initialColor}
        roughness={MARBLE_PHYSICAL_MATERIAL.roughness}
        metalness={MARBLE_PHYSICAL_MATERIAL.metalness}
        clearcoat={MARBLE_PHYSICAL_MATERIAL.clearcoat}
        clearcoatRoughness={MARBLE_PHYSICAL_MATERIAL.clearcoatRoughness}
      />
    </mesh>
  );
}

export const FlyingPieceOverlay: React.FC<FlyingPieceOverlayProps> = ({
  flights,
  onFlightComplete,
}) => {
  const visible = (flights || []).slice(-MAX_FLIGHTS);

  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 pointer-events-none"
      style={{ zIndex: 9999 }}
    >
      <Canvas
        gl={MARBLE_CANVAS_GL}
        dpr={MARBLE_CANVAS_DPR}
        camera={{ position: [0, 0, 5], fov: 45 }}
        onCreated={({ gl }) => configureMarbleRenderer(gl)}
        className="pointer-events-none h-full w-full"
      >
        <MarbleLightRig />
        <Suspense fallback={null}>
          <StudioEnvironment />
          {visible.map((flight) => (
            <SingleFlyingMarble
              key={flight.id}
              flight={flight}
              onDone={(handoff) => onFlightComplete?.(flight.id, flight.pieceId, handoff)}
            />
          ))}
        </Suspense>
      </Canvas>
    </div>
  );
};

/**
 * Resolve card swipe point → bowl rim opening (handoff).
 * Destination is the aperture at the top of the bowl — never mid-glass —
 * so the overlay can hover above then drop vertically into the opening.
 */
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

  // Small lateral jitter only — keep Y on the rim so the drop stays vertical.
  const rimJitterX = (Math.random() - 0.5) * 10;

  let toX = screenW * 0.5 + rimJitterX;
  // Fallback: upper third of the viewport ≈ rim when bowl DOM is missing.
  let toY = screenH * 0.18;

  if (bowlFrame || bowl) {
    const b = (bowlFrame || bowl)!.getBoundingClientRect();
    if (b.width > 0 && b.height > 0) {
      toX = b.left + b.width * 0.5 + rimJitterX;
      // Rim aperture (~top 10% of the bowl frame), not mid-body (was 0.45).
      toY = b.top + Math.min(20, b.height * 0.1);
    }
  }

  return {
    from: { x: fromX, y: fromY },
    to: { x: toX, y: toY },
  };
}
