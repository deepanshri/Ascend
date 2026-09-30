import { Suspense, useEffect, useMemo, useRef } from 'react';
import { animate } from 'motion/react';
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

const PIECE_PX = 14;
/** Sample window for terminal velocity (last 5% — handoff to bowl physics). */
const TERMINAL_SAMPLE_T = 0.95;

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
  /** Relative horizontal touch point on card (0 = left, 1 = right). */
  touchRatio?: number;
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

/**
 * Smooth quadratic Bezier curve:
 * P(t) = (1-t)^2 * P_start + 2*(1-t)*t * P_control + t^2 * P_target
 */
function flightPositionAt(
  pStart: { x: number; y: number },
  pControl: { x: number; y: number },
  pTarget: { x: number; y: number },
  t: number
): { x: number; y: number } {
  const clampedT = Math.max(0, Math.min(1, t));
  const u = 1 - clampedT;
  return {
    x: u * u * pStart.x + 2 * u * clampedT * pControl.x + clampedT * clampedT * pTarget.x,
    y: u * u * pStart.y + 2 * u * clampedT * pControl.y + clampedT * clampedT * pTarget.y,
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
    vz: Math.max(0, syScreen * 0.12),
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

  const trajectory = useMemo(() => {
    const pStart = flight.from;
    const pTarget = flight.to;
    const touchRatio = Number.isFinite(flight.touchRatio) ? flight.touchRatio! : 0.5;

    let pControl: { x: number; y: number };
    if (touchRatio < 0.35) {
      // Left Swipe: curve outward to the left
      pControl = {
        x: Math.min(pStart.x, pTarget.x) - 90,
        y: Math.min(pStart.y, pTarget.y) - 100,
      };
    } else if (touchRatio > 0.65) {
      // Right Swipe: curve outward to the right
      pControl = {
        x: Math.max(pStart.x, pTarget.x) + 90,
        y: Math.min(pStart.y, pTarget.y) - 100,
      };
    } else {
      // Middle Swipe: centered arc
      pControl = {
        x: (pStart.x + pTarget.x) / 2,
        y: Math.min(pStart.y, pTarget.y) - 130,
      };
    }
    return { pStart, pControl, pTarget };
  }, [flight.from, flight.to, flight.touchRatio]);

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

    const { pStart, pControl, pTarget } = trajectory;
    const durationSec = FLIGHT_DURATION_MS / 1000;

    const pNear = flightPositionAt(pStart, pControl, pTarget, TERMINAL_SAMPLE_T);
    const pEnd = flightPositionAt(pStart, pControl, pTarget, 1);
    const dtTerminal = (1 - TERMINAL_SAMPLE_T) * durationSec;
    handoffRef.current = screenDeltaToWorldVel(
      pEnd.x - pNear.x,
      pEnd.y - pNear.y,
      dtTerminal
    );
    handoffRef.current.vx *= 0.2;
    handoffRef.current.vz = Math.max(0, handoffRef.current.vz * 0.2);

    try {
      launchControls = animate(0, 1, {
        duration: durationSec,
        ease: 'linear',
        onUpdate: (t) => {
          progressRef.current = t;
        },
        onComplete: finish,
      });
    } catch {
      finish();
    }

    return () => {
      launchControls?.stop();
    };
  }, [trajectory]);

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
    const traj = trajectory;

    const progress = progressRef.current;
    const pos = flightPositionAt(traj.pStart, traj.pControl, traj.pTarget, progress);

    const worldX = (pos.x / size.width - 0.5) * viewport.width;
    const worldY = -(pos.y / size.height - 0.5) * viewport.height;
    const worldZ = lerp(0, 0.15, progress);

    meshRef.current.position.set(worldX, worldY, worldZ);

    // PIECE_PX = 14 -> 7px target physical radius
    const targetWorldRadius = (PIECE_PX / 2) * (viewport.height / size.height);
    const distanceComp = 1.88 / Math.max(0.1, 1.88 - worldZ);

    // Set exact 1:1 physical scale
    meshRef.current.scale.setScalar(targetWorldRadius / distanceComp);

    meshRef.current.visible = true;

    meshRef.current.rotation.x += delta * 4.8;
    meshRef.current.rotation.y += delta * 6.5;
  });

  const initialColor = flight.color || getMarbleColor(isDark, isFallback);

  return (
    <mesh ref={meshRef} visible={false} scale={[0, 0, 0]}>
      <sphereGeometry args={[1, 32, 32]} />
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

export default function FlyingPieceOverlay({
  flights,
  onFlightComplete,
}: FlyingPieceOverlayProps) {
  return (
    <div className="fixed inset-0 pointer-events-none z-50" style={{ touchAction: 'none' }}>
      <Canvas
        style={{ pointerEvents: 'none', background: 'transparent', width: '100%', height: '100%', display: 'block' }}
        gl={MARBLE_CANVAS_GL}
        dpr={MARBLE_CANVAS_DPR}
        camera={FLIGHT_CAMERA}
        onCreated={({ gl }) => {
          gl.setClearColor(0x000000, 0);
          configureMarbleRenderer(gl);
        }}
      >
        <Suspense fallback={null}>
          <MarbleLightRig />
          <StudioEnvironment />

          {flights.map((flight) => (
            <SingleFlyingMarble
              key={flight.id}
              flight={flight}
              onDone={(handoff) => onFlightComplete(flight.id, flight.pieceId, handoff)}
            />
          ))}
        </Suspense>
      </Canvas>
    </div>
  );
}

/**
 * Resolve card swipe point → bowl rim opening (handoff).
 * Destination is the aperture at the top of the bowl — never mid-glass —
 * so the overlay can hover above then drop vertically into the opening.
 */
let cachedBowlRect: { rect: DOMRect; timestamp: number } | null = null;

function getCachedBowlRect(): DOMRect | null {
  const now = Date.now();
  if (cachedBowlRect && now - cachedBowlRect.timestamp < 1000) {
    return cachedBowlRect.rect;
  }
  const bowlFrame = document.getElementById('accumulation-bowl-frame');
  const bowl = bowlFrame || document.getElementById('accumulation-bowl');
  if (bowl) {
    const r = bowl.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) {
      cachedBowlRect = { rect: r, timestamp: now };
      return r;
    }
  }
  return null;
}

export function measureCompletionFlight(
  habitId: string,
  customOrigin?: { x: number; y: number; touchRatio?: number }
): { from: { x: number; y: number }; to: { x: number; y: number }; touchRatio: number } {
  const screenW = typeof window !== 'undefined' ? window.innerWidth : 390;
  const screenH = typeof window !== 'undefined' ? window.innerHeight : 844;

  let fromX: number;
  let fromY: number;
  let touchRatio = customOrigin && Number.isFinite(customOrigin.touchRatio) ? customOrigin.touchRatio! : 0.5;

  if (customOrigin && Number.isFinite(customOrigin.x) && Number.isFinite(customOrigin.y) && customOrigin.x !== 0 && customOrigin.y !== 0) {
    fromX = customOrigin.x;
    fromY = customOrigin.y;
  } else {
    const card = document.getElementById(`habit-card-${habitId}`);
    if (card) {
      const a = card.getBoundingClientRect();
      fromX = a.left + a.width * 0.5;
      fromY = a.top + a.height * 0.5;
      if (!Number.isFinite(customOrigin?.touchRatio) && customOrigin && Number.isFinite(customOrigin.x) && a.width > 0) {
        touchRatio = (customOrigin.x - a.left) / a.width;
      }
    } else {
      fromX = screenW * 0.5;
      fromY = screenH * 0.65;
    }
  }

  touchRatio = Math.max(0, Math.min(1, touchRatio));

  // Small lateral jitter only — keep Y on the rim so the drop stays vertical.
  const rimJitterX = (Math.random() - 0.5) * 10;

  let toX = screenW * 0.5 + rimJitterX;
  // Fallback: bowl rim visual height ≈ 35% of screen height
  let toY = screenH * 0.35;

  const b = getCachedBowlRect();
  if (b) {
    toX = b.left + b.width * 0.5 + rimJitterX;
    toY = b.top + b.height * 0.2;
  }

  return {
    from: { x: fromX, y: fromY },
    to: { x: toX, y: toY },
    touchRatio,
  };
}
