import React, { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { ContactShadows, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { AnimatePresence, motion } from 'motion/react';
import { CYCLE_DAY_OPTIONS, clampCycleDays, type AccumulationPiece, type CycleDays } from '../services/reportService';
import { tapPress } from '../lib/motionPresets';
import { getMarbleColor } from '../utils/colors';
import {
  BOWL_CAMERA,
  HANDOFF_DEFAULT_VEL,
  HANDOFF_RIM_Y,
  MARBLE_CANVAS_DPR,
  MARBLE_CANVAS_GL,
  MARBLE_PHYSICAL_MATERIAL,
  configureMarbleRenderer,
} from '../lib/marbleRenderer';
import { MarbleLightRig, StudioEnvironment } from '../lib/marbleScene';
import { getThemeIsDark, subscribeTheme } from '../lib/themeStore';
import type { FlightHandoffVelocity } from './FlyingPieceOverlay';

// Preload the 3D bowl model at module scope for instant rendering
useGLTF.preload('/assets/bowl.glb');

export interface BowlProps {
  completedCount?: number;
  pieces?: AccumulationPiece[];
  fillPercent?: number;
  isOverflowing?: boolean;
  votes?: number;
  capacity?: number;
  cycleDays?: number;
  onCycleDaysChange?: (days: CycleDays) => void;
  celebrating?: boolean;
  onCelebrationDone?: () => void;
  deferredPieceIds?: ReadonlySet<string>;
  settlePieceIds?: ReadonlySet<string>;
  /** Terminal flight velocity per pieceId — applied as RigidMarble v_spawn at handoff. */
  settleHandoffs?: ReadonlyMap<string, FlightHandoffVelocity>;
}

function hashSeed(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}

function hashUnit(seed: number): number {
  const n = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return (n - Math.floor(n)) * 2 - 1;
}

/** 3D glass bowl — materials created once; theme only mutates .color in-place. */
function BowlModel() {
  const { scene } = useGLTF('/assets/bowl.glb');
  const glassMatsRef = useRef<THREE.MeshPhysicalMaterial[]>([]);

  useEffect(() => {
    const mats: THREE.MeshPhysicalMaterial[] = [];
    scene.traverse((child) => {
      if (!(child as THREE.Mesh).isMesh) return;
      const mesh = child as THREE.Mesh;

      if (!mesh.geometry.userData.normalized) {
        mesh.geometry.computeBoundingBox();
        const bbox = mesh.geometry.boundingBox;
        if (bbox) {
          const sizeX = bbox.max.x - bbox.min.x;
          if (sizeX > 0 && sizeX < 1.0) {
            const factor = 2.0 / sizeX;
            mesh.geometry.scale(factor, factor, factor);
            mesh.geometry.computeVertexNormals();
          }
        }
        mesh.geometry.userData.normalized = true;
      }

      const existing = mesh.material;
      let mat: THREE.MeshPhysicalMaterial;
      if (
        existing &&
        !Array.isArray(existing) &&
        (existing as THREE.MeshPhysicalMaterial).isMeshPhysicalMaterial &&
        (existing as THREE.Material).userData?.ascendGlass
      ) {
        mat = existing as THREE.MeshPhysicalMaterial;
      } else {
        mat = new THREE.MeshPhysicalMaterial({
          color: new THREE.Color(getThemeIsDark() ? '#e0f2fe' : '#ffffff'),
          transparent: true,
          opacity: 0.36,
          transmission: 0.58,
          roughness: 0.04,
          metalness: 0.0,
          ior: 1.5,
          reflectivity: 1.0,
          clearcoat: 1.0,
          clearcoatRoughness: 0.06,
          thickness: 0.35,
          depthWrite: false,
          side: THREE.FrontSide,
        });
        mat.userData.ascendGlass = true;
        mesh.material = mat;
      }
      mats.push(mat);
      mesh.receiveShadow = true;
      mesh.castShadow = false;
    });
    glassMatsRef.current = mats;

    const syncGlassColor = () => {
      const hex = getThemeIsDark() ? '#e0f2fe' : '#ffffff';
      for (const mat of glassMatsRef.current) {
        mat.color.set(hex);
      }
    };
    syncGlassColor();
    return subscribeTheme(syncGlassColor);
  }, [scene]);

  return <primitive object={scene} scale={1.2} position={[0, -0.3, 0]} renderOrder={2} />;
}

// Exact interior profile extracted from bowl.glb geometry in world space (scale 1.2, y -0.3)
const BOWL_INNER_PROFILE = [
  { r: 0.00, y: -0.24 },
  { r: 0.25, y: -0.24 },
  { r: 0.35, y: -0.236 },
  { r: 0.45, y: -0.219 },
  { r: 0.55, y: -0.180 },
  { r: 0.65, y: -0.118 },
  { r: 0.75, y: -0.035 },
  { r: 0.85, y: 0.078 },
  { r: 0.95, y: 0.239 },
  { r: 1.05, y: 0.458 },
  { r: 1.10, y: 0.677 },
];

const SPHERE_RADIUS = 0.19;
const MIN_DISTANCE = 2 * SPHERE_RADIUS;
const MIN_DISTANCE_SQ = MIN_DISTANCE * MIN_DISTANCE;
const RIM_MAX_CENTER_R = 1.04 - SPHERE_RADIUS; // Bounds center so outer silhouette never breaches rim

function getBowlFloorY(rc: number): number {
  let maxY = -0.24 + SPHERE_RADIUS;
  for (let i = 0; i < BOWL_INNER_PROFILE.length; i++) {
    const pt = BOWL_INNER_PROFILE[i];
    const dr = Math.abs(rc - pt.r);
    if (dr < SPHERE_RADIUS) {
      const neededY = pt.y + Math.sqrt(SPHERE_RADIUS * SPHERE_RADIUS - dr * dr);
      if (neededY > maxY) maxY = neededY;
    }
  }
  return maxY;
}

function getRestingY(x: number, z: number, placed: { x: number; y: number; z: number }[]): number | null {
  const rc = Math.hypot(x, z);
  if (rc > RIM_MAX_CENTER_R) return null;
  let y = getBowlFloorY(rc);

  for (let i = 0; i < placed.length; i++) {
    const p = placed[i];
    const dx = x - p.x;
    const dz = z - p.z;
    const d2 = dx * dx + dz * dz;
    if (d2 < MIN_DISTANCE_SQ) {
      const neededY = p.y + Math.sqrt(MIN_DISTANCE_SQ - d2);
      if (neededY > y) y = neededY;
    }
  }
  return y;
}

function mulberry32(a: number): () => number {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface PlacedPosition {
  x: number;
  y: number;
  z: number;
}

// Module-level memoization cache: positions for count N are computed at most once
const POSITION_CACHE = new Map<number, PlacedPosition[]>();

function getPlacedPositions(count: number): PlacedPosition[] {
  if (count <= 0) return [];
  const cached = POSITION_CACHE.get(count);
  if (cached) return cached;

  const rng = mulberry32(42);
  const placed: PlacedPosition[] = [];

  for (let i = 0; i < count; i++) {
    // First marble always lands at the bottom center
    if (placed.length === 0) {
      const x0 = (rng() - 0.5) * 0.04;
      const z0 = (rng() - 0.5) * 0.04;
      const y0 = getRestingY(x0, z0, placed) ?? (-0.24 + SPHERE_RADIUS);
      placed.push({ x: x0, y: y0, z: z0 });
      continue;
    }

    const candidates: { x: number; z: number }[] = [];

    // 1. Nesting pockets between pairs of already-placed spheres
    for (let j = 0; j < placed.length; j++) {
      for (let k = j + 1; k < placed.length; k++) {
        const pj = placed[j];
        const pk = placed[k];
        const djk = Math.hypot(pj.x - pk.x, pj.z - pk.z);
        if (djk < MIN_DISTANCE * 1.95 && djk > 0.01) {
          const midX = (pj.x + pk.x) / 2;
          const midZ = (pj.z + pk.z) / 2;
          const perpX = -(pk.z - pj.z);
          const perpZ = pk.x - pj.x;
          const perpLen = Math.hypot(perpX, perpZ);
          if (perpLen > 0.001) {
            const h = Math.sqrt(Math.max(0, MIN_DISTANCE_SQ - (djk / 2) ** 2));
            candidates.push({ x: midX + (perpX / perpLen) * h, z: midZ + (perpZ / perpLen) * h });
            candidates.push({ x: midX - (perpX / perpLen) * h, z: midZ - (perpZ / perpLen) * h });
          }
        }
      }
    }

    // 2. Concentric radial rings from center outward
    const rings = 8;
    const pointsPerRing = 12;
    for (let ring = 1; ring <= rings; ring++) {
      const radius = (ring / rings) * RIM_MAX_CENTER_R;
      const offset = (rng() + ring) * 0.5;
      for (let p = 0; p < pointsPerRing; p++) {
        const theta = offset + (p / pointsPerRing) * Math.PI * 2;
        candidates.push({ x: Math.cos(theta) * radius, z: Math.sin(theta) * radius });
      }
    }

    // 3. Jittered random candidates
    for (let s = 0; s < 24; s++) {
      const r = (rng() ** 0.5) * RIM_MAX_CENTER_R;
      const a = rng() * Math.PI * 2;
      candidates.push({ x: Math.cos(a) * r, z: Math.sin(a) * r });
    }

    let bestX = 0;
    let bestZ = 0;
    let bestEnergy = Infinity;

    for (let c = 0; c < candidates.length; c++) {
      const cand = candidates[c];
      const y = getRestingY(cand.x, cand.z, placed);
      if (y !== null) {
        // Gravitational potential energy: lowest resting Y + slight radial pull toward center
        const energy = y + Math.hypot(cand.x, cand.z) * 0.05;
        if (energy < bestEnergy) {
          bestEnergy = energy;
          bestX = cand.x;
          bestZ = cand.z;
        }
      }
    }

    // Local gradient descent / relaxation
    let curX = bestX;
    let curZ = bestZ;
    let step = 0.04;
    for (let iter = 0; iter < 4; iter++) {
      for (let a = 0; a < Math.PI * 2; a += Math.PI / 4) {
        const nx = curX + Math.cos(a) * step;
        const nz = curZ + Math.sin(a) * step;
        const ny = getRestingY(nx, nz, placed);
        if (ny !== null) {
          const nEnergy = ny + Math.hypot(nx, nz) * 0.05;
          if (nEnergy < bestEnergy) {
            bestEnergy = nEnergy;
            curX = nx;
            curZ = nz;
          }
        }
      }
      step *= 0.5;
    }

    const finalY = getRestingY(curX, curZ, placed) ?? (-0.24 + SPHERE_RADIUS);
    placed.push({ x: curX, y: finalY, z: curZ });
  }

  POSITION_CACHE.set(count, placed);
  return placed;
}

// Reusable contact shadow texture for ambient occlusion at marble-bowl contact points
let cachedShadowTexture: THREE.CanvasTexture | null = null;
function getContactShadowTexture(): THREE.CanvasTexture {
  if (!cachedShadowTexture) {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
      grad.addColorStop(0, 'rgba(0, 0, 0, 0.65)');
      grad.addColorStop(0.35, 'rgba(0, 0, 0, 0.4)');
      grad.addColorStop(0.7, 'rgba(0, 0, 0, 0.12)');
      grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 64, 64);
    }
    cachedShadowTexture = new THREE.CanvasTexture(canvas);
  }
  return cachedShadowTexture;
}

interface MarbleScatterProps {
  completedCount: number;
  pieces?: AccumulationPiece[];
  deferredPieceIds?: ReadonlySet<string>;
  settlePieceIds?: ReadonlySet<string>;
  settleHandoffs?: ReadonlyMap<string, FlightHandoffVelocity>;
}

interface RigidMarbleProps {
  id: string | number;
  targetPos: PlacedPosition;
  rotation: [number, number, number];
  isFallback: boolean;
  isSettling: boolean;
  handoffVel: FlightHandoffVelocity;
  shadowTexture: THREE.CanvasTexture;
  isFloorContact: boolean;
  shadowY: number;
}

function RigidMarble({
  targetPos,
  rotation,
  isFallback,
  isSettling,
  handoffVel,
  shadowTexture,
  isFloorContact,
  shadowY,
}: RigidMarbleProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const shadowRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.MeshPhysicalMaterial>(null);

  // Physics state for physical drop and settling
  const physicsRef = useRef<{
    active: boolean;
    x: number;
    y: number;
    z: number;
    vx: number;
    vy: number;
    vz: number;
  }>({
    active: false,
    x: targetPos.x,
    y: targetPos.y,
    z: targetPos.z,
    vx: 0,
    vy: 0,
    vz: 0,
  });

  // Theme → mutate existing material color (no shader recompile / canvas remount)
  useEffect(() => {
    const sync = () => {
      const mat = materialRef.current;
      if (!mat) return;
      mat.color.set(getMarbleColor(getThemeIsDark(), isFallback));
    };
    sync();
    return subscribeTheme(sync);
  }, [isFallback]);

  useEffect(() => {
    if (isSettling) {
      const vx = Number.isFinite(handoffVel.vx) ? handoffVel.vx : HANDOFF_DEFAULT_VEL.vx;
      const vy = Number.isFinite(handoffVel.vy) ? handoffVel.vy : HANDOFF_DEFAULT_VEL.vy;
      const vz = Number.isFinite(handoffVel.vz) ? handoffVel.vz : HANDOFF_DEFAULT_VEL.vz;
      const spawnZ = 0.12 + Math.random() * 0.1;
      physicsRef.current = {
        active: true,
        // Spawn near the opening center in the foreground (+Z) so the 3D drop lands in front
        x: targetPos.x * 0.2,
        y: HANDOFF_RIM_Y,
        z: spawnZ,
        vx,
        vy: Math.min(vy, HANDOFF_DEFAULT_VEL.vy),
        vz: Math.max(0, vz),
      };
      if (meshRef.current) {
        meshRef.current.position.set(
          physicsRef.current.x,
          physicsRef.current.y,
          physicsRef.current.z
        );
      }
    }
  }, [isSettling, handoffVel.vx, handoffVel.vy, handoffVel.vz, targetPos.x, targetPos.y, targetPos.z]);

  useFrame((_, delta) => {
    const p = physicsRef.current;
    if (!p.active) {
      if (meshRef.current) {
        meshRef.current.position.set(targetPos.x, targetPos.y, targetPos.z);
      }
      return;
    }

    const dt = Math.min(delta, 1 / 60);
    p.vy -= 14.0 * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.z += p.vz * dt;
    const converge = Math.min(1, dt * 4.2);
    p.x += (targetPos.x - p.x) * converge;
    p.z += (targetPos.z - p.z) * converge;
    p.vx *= 1 - Math.min(1, dt * 3.5);
    p.vz *= 1 - Math.min(1, dt * 3.5);

    // Keep the marble inside the rim while falling — no glass clip-through.
    const rc = Math.hypot(p.x, p.z);
    if (rc > RIM_MAX_CENTER_R && rc > 1e-6) {
      const s = RIM_MAX_CENTER_R / rc;
      p.x *= s;
      p.z *= s;
      p.vx *= 0.25;
      p.vz *= 0.25;
    }

    // Collide with the bowl interior floor at the current (x, z), not only the final slot.
    const floorY = Math.max(getBowlFloorY(Math.hypot(p.x, p.z)), targetPos.y);

    if (p.y <= floorY) {
      p.y = floorY;
      p.vy = 0;
      p.vx *= 0.6;
      p.vz *= 0.6;
      if (Math.abs(p.x - targetPos.x) < 0.02 && Math.abs(p.z - targetPos.z) < 0.02) {
        p.active = false;
      }
    }

    if (meshRef.current) {
      meshRef.current.position.set(p.x, p.y, p.z);
      meshRef.current.rotation.x += dt * (Math.abs(p.vy) * 2.0 + 1.2);
      meshRef.current.rotation.y += dt * 2.5;
    }
  });

  const initialColor = getMarbleColor(getThemeIsDark(), isFallback);

  return (
    <>
      {isFloorContact && (
        <mesh
          ref={shadowRef}
          position={[targetPos.x, shadowY, targetPos.z]}
          rotation={[-Math.PI / 2, 0, 0]}
          renderOrder={0}
        >
          <planeGeometry args={[SPHERE_RADIUS * 1.6, SPHERE_RADIUS * 1.6]} />
          <meshBasicMaterial
            map={shadowTexture}
            transparent
            opacity={0.7}
            depthWrite={false}
          />
        </mesh>
      )}

      <mesh
        ref={meshRef}
        position={[targetPos.x, targetPos.y, targetPos.z]}
        rotation={rotation}
        castShadow
        receiveShadow
      >
        <sphereGeometry args={[SPHERE_RADIUS, 24, 24]} />
        <meshPhysicalMaterial
          ref={materialRef}
          color={initialColor}
          roughness={MARBLE_PHYSICAL_MATERIAL.roughness}
          metalness={MARBLE_PHYSICAL_MATERIAL.metalness}
          clearcoat={MARBLE_PHYSICAL_MATERIAL.clearcoat}
          clearcoatRoughness={MARBLE_PHYSICAL_MATERIAL.clearcoatRoughness}
          depthTest={true}
          depthWrite={true}
        />
      </mesh>
    </>
  );
}

/** Physically plausible 3D bottom-up settling marble scattering with contact shadows & real drop handoff */
function MarbleScatter({
  completedCount,
  pieces,
  deferredPieceIds,
  settlePieceIds,
  settleHandoffs,
}: MarbleScatterProps) {
  const visiblePieces = useMemo(() => {
    if (!pieces) return null;
    if (!deferredPieceIds || deferredPieceIds.size === 0) return pieces;
    return pieces.filter((p) => !deferredPieceIds.has(p.id));
  }, [pieces, deferredPieceIds]);

  const count = visiblePieces !== null
    ? visiblePieces.length
    : (completedCount !== undefined ? completedCount : 0);
  const positions = useMemo(() => getPlacedPositions(count), [count]);
  const shadowTexture = useMemo(() => getContactShadowTexture(), []);

  const marbles = useMemo(() => {
    return Array.from({ length: count }).map((_, i) => {
      const piece = visiblePieces ? visiblePieces[i] : null;
      const seed = hashSeed(piece?.id || `marble-${i}`);
      const pos = positions[i] || { x: 0, y: -0.05, z: 0 };
      const isFallback = piece?.kind === 'fallback';

      const floorY = getBowlFloorY(Math.hypot(pos.x, pos.z));
      const isFloorContact = Math.abs(pos.y - floorY) < 0.02;
      const isSettling = Boolean(piece?.id && settlePieceIds?.has(piece.id));
      const handoffVel =
        (piece?.id && settleHandoffs?.get(piece.id)) || HANDOFF_DEFAULT_VEL;

      return {
        id: piece?.id || i,
        pos,
        rotation: [
          Math.abs(hashUnit(seed * 13 + i)) * Math.PI,
          Math.abs(hashUnit(seed * 19 + i)) * Math.PI,
          0,
        ] as [number, number, number],
        isFallback: Boolean(isFallback),
        isFloorContact,
        isSettling,
        handoffVel,
        shadowY: floorY - SPHERE_RADIUS + 0.005,
      };
    });
  }, [count, visiblePieces, positions, settlePieceIds, settleHandoffs]);

  return (
    <group renderOrder={1}>
      {marbles.map((m) => (
        <RigidMarble
          key={m.id}
          id={m.id}
          targetPos={m.pos}
          rotation={m.rotation}
          isFallback={m.isFallback}
          isSettling={m.isSettling}
          handoffVel={m.handoffVel}
          shadowTexture={shadowTexture}
          isFloorContact={m.isFloorContact}
          shadowY={m.shadowY}
        />
      ))}
    </group>
  );
}

interface BowlCanvasProps {
  completedCount: number;
  pieces?: AccumulationPiece[];
  deferredPieceIds?: ReadonlySet<string>;
  settlePieceIds?: ReadonlySet<string>;
  settleHandoffs?: ReadonlyMap<string, FlightHandoffVelocity>;
}

const BowlCanvasInner: React.FC<BowlCanvasProps> = ({
  completedCount,
  pieces,
  deferredPieceIds,
  settlePieceIds,
  settleHandoffs,
}) => {
  return (
    <Canvas
      shadows
      camera={BOWL_CAMERA}
      dpr={MARBLE_CANVAS_DPR}
      gl={MARBLE_CANVAS_GL}
      onCreated={({ gl }) => configureMarbleRenderer(gl)}
      className="h-full w-full pointer-events-none"
    >
      <MarbleLightRig castShadow />
      <Suspense fallback={null}>
        <StudioEnvironment />
        <MarbleScatter
          completedCount={completedCount}
          pieces={pieces}
          deferredPieceIds={deferredPieceIds}
          settlePieceIds={settlePieceIds}
          settleHandoffs={settleHandoffs}
        />
        <BowlModel />
        <ContactShadows position={[0, -0.45, 0]} opacity={0.45} scale={4} blur={1.5} far={1} />
      </Suspense>
    </Canvas>
  );
};

const BowlCanvas = React.memo(BowlCanvasInner, (prev, next) => {
  return (
    prev.completedCount === next.completedCount &&
    prev.pieces === next.pieces &&
    prev.deferredPieceIds === next.deferredPieceIds &&
    prev.settlePieceIds === next.settlePieceIds &&
    prev.settleHandoffs === next.settleHandoffs
  );
});

function BowlInner({
  completedCount,
  pieces,
  fillPercent = 0,
  isOverflowing = false,
  votes = 0,
  capacity = 7,
  cycleDays = 7,
  onCycleDaysChange,
  celebrating = false,
  onCelebrationDone,
  deferredPieceIds,
  settlePieceIds,
  settleHandoffs,
}: BowlProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  const selectedCycle = clampCycleDays(cycleDays);
  const celebrateDoneRef = useRef(onCelebrationDone);
  celebrateDoneRef.current = onCelebrationDone;

  const resolvedCount = completedCount !== undefined
    ? completedCount
    : (pieces ? pieces.length : votes);
  const roundedFill = Math.round(fillPercent);

  useEffect(() => {
    if (!celebrating) return;
    const timer = window.setTimeout(() => celebrateDoneRef.current?.(), 1600);
    return () => window.clearTimeout(timer);
  }, [celebrating]);

  useEffect(() => {
    if (!menuOpen) return;
    const onPointer = (event: PointerEvent) => {
      if (!pickerRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  return (
    <section
      id="accumulation-bowl"
      data-tour="accumulation-bowl"
      className="relative mx-auto my-0 flex w-full flex-col items-center justify-center select-none"
      aria-label={`3D accumulation bowl, ${votes} of ${capacity} votes in a ${selectedCycle}-day cycle, ${roundedFill} percent full${isOverflowing ? ', overflowing' : ''}${celebrating ? ', cycle complete' : ''}`}
    >
      <AnimatePresence>
        {celebrating && (
          <motion.div
            key="cycle-complete-card"
            initial={{ opacity: 0, y: 8, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.96 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="absolute top-0 z-50 rounded-2xl px-3 py-1.5 text-[11px] font-bold shadow-lg border bg-white/95 text-emerald-800 border-emerald-300/80 dark:bg-slate-900/95 dark:text-blue-200 dark:border-blue-500/50"
          >
            Cycle complete!
          </motion.div>
        )}
      </AnimatePresence>

      <div id="accumulation-bowl-frame" className="relative mx-auto h-40 w-48 overflow-visible">
        {/* Landing target for card→bowl flights (cavity floor) */}
        <div
          id="accumulation-bowl-target"
          className="pointer-events-none absolute left-1/2 top-[55%] h-0 w-0 -translate-x-1/2"
          aria-hidden="true"
        />

        {/* Real-Time 3D WebGL Canvas — never keyed on theme */}
        <BowlCanvas
          completedCount={resolvedCount}
          pieces={pieces}
          deferredPieceIds={deferredPieceIds}
          settlePieceIds={settlePieceIds}
          settleHandoffs={settleHandoffs}
        />

        {/* Cycle-complete celebration glow */}
        {celebrating && (
          <motion.div
            className="pointer-events-none absolute inset-x-4 bottom-2 z-[35] h-8 rounded-full blur-md bg-emerald-400/35 dark:bg-blue-400/40"
            initial={{ opacity: 0, scaleX: 0.4 }}
            animate={{ opacity: [0, 1, 0], scaleX: [0.4, 1.1, 1.2] }}
            transition={{ duration: 1.4, ease: 'easeOut' }}
            aria-hidden="true"
          />
        )}
      </div>

      <div ref={pickerRef} className="relative z-40 mb-1 mt-1 flex w-full justify-center">
        <motion.button
          type="button"
          id="accumulation-cycle-pill"
          whileTap={tapPress}
          onClick={() => setMenuOpen((open) => !open)}
          aria-expanded={menuOpen}
          aria-haspopup="listbox"
          className="backdrop-blur-sm px-2.5 py-0.5 rounded-full text-[11px] tabular-nums cursor-pointer transition-colors border bg-white/90 border-slate-200 text-slate-700 hover:text-slate-900 shadow-sm dark:bg-slate-800/80 dark:border-slate-700/60 dark:text-slate-300 dark:hover:text-white dark:shadow-none"
        >
          {votes}/{capacity} · {selectedCycle} Days ▾
        </motion.button>

        <AnimatePresence>
          {menuOpen && (
            <motion.div
              role="listbox"
              aria-label="Cycle length"
              initial={{ opacity: 0, y: -6, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.96 }}
              transition={{ duration: 0.16, ease: 'easeOut' }}
              className="absolute left-1/2 top-full z-50 mt-1.5 w-[148px] -translate-x-1/2 rounded-2xl border p-1 shadow-xl backdrop-blur-md bg-white/95 text-slate-900 border-slate-200 dark:bg-slate-900/95 dark:text-white dark:border-slate-800"
            >
              {CYCLE_DAY_OPTIONS.map((days) => {
                const active = days === selectedCycle;
                return (
                  <button
                    key={days}
                    type="button"
                    role="option"
                    aria-selected={active}
                    onClick={() => {
                      onCycleDaysChange?.(days);
                      setMenuOpen(false);
                    }}
                    className={`w-full text-left px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center justify-between transition cursor-pointer ${
                      active
                        ? 'bg-emerald-500 text-white dark:bg-blue-600'
                        : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                    }`}
                  >
                    <span>{days} Days</span>
                    {active && <span>✓</span>}
                  </button>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </section>
  );
}

function bowlPropsAreEqual(prev: BowlProps, next: BowlProps): boolean {
  return (
    prev.completedCount === next.completedCount &&
    prev.pieces === next.pieces &&
    prev.fillPercent === next.fillPercent &&
    prev.isOverflowing === next.isOverflowing &&
    prev.votes === next.votes &&
    prev.capacity === next.capacity &&
    prev.cycleDays === next.cycleDays &&
    prev.celebrating === next.celebrating &&
    prev.deferredPieceIds === next.deferredPieceIds &&
    prev.settlePieceIds === next.settlePieceIds &&
    prev.settleHandoffs === next.settleHandoffs &&
    prev.onCycleDaysChange === next.onCycleDaysChange &&
    prev.onCelebrationDone === next.onCelebrationDone
  );
}

export const Bowl: React.FC<BowlProps> = React.memo(BowlInner, bowlPropsAreEqual);

// Alias AccumulationBowl to Bowl for full backward compatibility
export const AccumulationBowl = Bowl;
