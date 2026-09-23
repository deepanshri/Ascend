import React, { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { ContactShadows, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { AnimatePresence, motion } from 'motion/react';
import { CYCLE_DAY_OPTIONS, clampCycleDays, type AccumulationPiece, type CycleDays } from '../services/reportService';
import { tapPress } from '../lib/motionPresets';

// Preload the 3D bowl model at module scope for instant rendering
useGLTF.preload('/assets/bowl.glb');

export interface BowlProps {
  completedCount?: number;
  pieces?: AccumulationPiece[];
  fillPercent?: number;
  isOverflowing?: boolean;
  isDark?: boolean;
  votes?: number;
  capacity?: number;
  cycleDays?: number;
  onCycleDaysChange?: (days: CycleDays) => void;
  celebrating?: boolean;
  onCelebrationDone?: () => void;
  deferredPieceIds?: ReadonlySet<string>;
  settlePieceIds?: ReadonlySet<string>;
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

/** Procedural studio environment providing neutral reflections and refraction for glass and glossy marbles */
function StudioEnvironment() {
  const { gl, scene } = useThree();

  useEffect(() => {
    const pmremGenerator = new THREE.PMREMGenerator(gl);
    pmremGenerator.compileEquirectangularShader();
    const room = new RoomEnvironment();
    const envTexture = pmremGenerator.fromScene(room, 0.04).texture;
    scene.environment = envTexture;
    room.dispose();
    pmremGenerator.dispose();

    return () => {
      scene.environment = null;
      envTexture.dispose();
    };
  }, [gl, scene]);

  return null;
}

/** 3D Glass Bowl Model loaded from GLB with enhanced glass visibility */
function BowlModel({ isDark = false }: { isDark?: boolean }) {
  const { scene } = useGLTF('/assets/bowl.glb');

  useMemo(() => {
    scene.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        // Normalize raw geometry so bowl diameter is 2.0 units (raw GLB is 0.12 units)
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

        // Real transmissive clear glass: FrontSide avoids self-overlapping backfaces of the 2-shell mesh
        mesh.material = new THREE.MeshPhysicalMaterial({
          color: new THREE.Color(isDark ? '#e0f2fe' : '#ffffff'),
          transparent: true,
          opacity: 0.26,
          transmission: 0.65,
          roughness: 0.04,
          metalness: 0.0,
          ior: 1.5,
          reflectivity: 1.0,
          clearcoat: 1.0,
          clearcoatRoughness: 0.06,
          thickness: 0.3,
          depthWrite: false, // Prevents front glass from cutting off inner marbles
          side: THREE.FrontSide,
        });
        mesh.receiveShadow = true;
        mesh.castShadow = false;
      }
    });
  }, [scene, isDark]);

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
  isDark: boolean;
}

/** Physically plausible 3D bottom-up settling marble scattering with contact shadows */
function MarbleScatter({ completedCount, pieces, deferredPieceIds, isDark }: MarbleScatterProps) {
  const visiblePieces = useMemo(() => {
    if (!pieces) return null;
    if (!deferredPieceIds || deferredPieceIds.size === 0) return pieces;
    return pieces.filter((p) => !deferredPieceIds.has(p.id));
  }, [pieces, deferredPieceIds]);

  const count = completedCount !== undefined
    ? completedCount
    : (visiblePieces ? visiblePieces.length : 0);
  const positions = useMemo(() => getPlacedPositions(count), [count]);
  const shadowTexture = useMemo(() => getContactShadowTexture(), []);

  const marbles = useMemo(() => {
    return Array.from({ length: count }).map((_, i) => {
      const piece = visiblePieces ? visiblePieces[i] : null;
      const seed = hashSeed(piece?.id || `marble-${i}`);
      const pos = positions[i] || { x: 0, y: -0.05, z: 0 };

      const isFallback = piece?.kind === 'fallback';
      const color = isDark
        ? isFallback
          ? '#60a5fa'
          : '#2563eb'
        : isFallback
        ? '#34d399'
        : '#059669';

      // Check if this piece is resting on or close to the bowl floor
      const floorY = getBowlFloorY(Math.hypot(pos.x, pos.z));
      const isFloorContact = Math.abs(pos.y - floorY) < 0.02;

      return {
        id: piece?.id || i,
        position: [pos.x, pos.y, pos.z] as [number, number, number],
        rotation: [
          Math.abs(hashUnit(seed * 13 + i)) * Math.PI,
          Math.abs(hashUnit(seed * 19 + i)) * Math.PI,
          0,
        ] as [number, number, number],
        color,
        isFloorContact,
        shadowY: floorY - SPHERE_RADIUS + 0.005,
      };
    });
  }, [count, visiblePieces, positions, isDark]);

  return (
    <group renderOrder={1}>
      {/* Contact shadow darkening discs under marbles touching the bowl floor */}
      {marbles.map(
        (m) =>
          m.isFloorContact && (
            <mesh
              key={`shadow-${m.id}`}
              position={[m.position[0], m.shadowY, m.position[2]]}
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
          )
      )}

      {/* Glossy rigid spheres */}
      {marbles.map((m) => (
        <mesh
          key={m.id}
          position={m.position}
          rotation={m.rotation}
          castShadow
          receiveShadow
        >
          <sphereGeometry args={[SPHERE_RADIUS, 24, 24]} />
          <meshStandardMaterial
            color={m.color}
            roughness={0.18}
            metalness={0.12}
          />
        </mesh>
      ))}
    </group>
  );
}

interface BowlCanvasProps {
  completedCount: number;
  pieces?: AccumulationPiece[];
  deferredPieceIds?: ReadonlySet<string>;
  isDark: boolean;
}

const BowlCanvasInner: React.FC<BowlCanvasProps> = ({
  completedCount,
  pieces,
  deferredPieceIds,
  isDark,
}) => {
  return (
    <Canvas
      shadows
      camera={{ position: [0, 2.5, 4.5], fov: 45 }}
      dpr={[1, 1.5]}
      gl={{
        alpha: true,
        antialias: true,
        powerPreference: 'high-performance',
      }}
      className="h-full w-full pointer-events-none"
    >
      <ambientLight intensity={0.4} />
      <directionalLight
        position={[2, 5, 3]}
        intensity={1.1}
        color="#ffffff"
        castShadow
        shadow-mapSize-width={512}
        shadow-mapSize-height={512}
        shadow-camera-near={1}
        shadow-camera-far={12}
        shadow-camera-left={-2}
        shadow-camera-right={2}
        shadow-camera-top={2}
        shadow-camera-bottom={-2}
        shadow-bias={-0.001}
        shadow-normalBias={0.02}
      />
      <directionalLight position={[-3, 3, 2]} intensity={0.45} color="#ffffff" />
      <directionalLight position={[0, 4, -3]} intensity={0.3} color="#f1f5f9" />
      <Suspense fallback={null}>
        <StudioEnvironment />
        <MarbleScatter
          completedCount={completedCount}
          pieces={pieces}
          deferredPieceIds={deferredPieceIds}
          isDark={isDark}
        />
        <BowlModel isDark={isDark} />
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
    prev.isDark === next.isDark
  );
});

function BowlInner({
  completedCount,
  pieces,
  fillPercent = 0,
  isOverflowing = false,
  isDark = false,
  votes = 0,
  capacity = 7,
  cycleDays = 7,
  onCycleDaysChange,
  celebrating = false,
  onCelebrationDone,
  deferredPieceIds,
  settlePieceIds: _settlePieceIds,
}: BowlProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  const selectedCycle = clampCycleDays(cycleDays);
  const celebrateDoneRef = useRef(onCelebrationDone);
  celebrateDoneRef.current = onCelebrationDone;

  const darkMode = Boolean(isDark);
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
      aria-label={`${darkMode ? 'Night' : 'Morning'} 3D accumulation bowl, ${votes} of ${capacity} votes in a ${selectedCycle}-day cycle, ${roundedFill} percent full${isOverflowing ? ', overflowing' : ''}${celebrating ? ', cycle complete' : ''}`}
    >
      <AnimatePresence>
        {celebrating && (
          <motion.div
            key="cycle-complete-card"
            initial={{ opacity: 0, y: 8, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.96 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className={`absolute top-0 z-50 rounded-2xl px-3 py-1.5 text-[11px] font-bold shadow-lg border ${
              darkMode
                ? 'bg-slate-900/95 text-blue-200 border-blue-500/50'
                : 'bg-white/95 text-emerald-800 border-emerald-300/80'
            }`}
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

        {/* Real-Time 3D WebGL Canvas */}
        <BowlCanvas
          completedCount={resolvedCount}
          pieces={pieces}
          deferredPieceIds={deferredPieceIds}
          isDark={darkMode}
        />

        {/* Cycle-complete celebration glow */}
        {celebrating && (
          <motion.div
            className={`pointer-events-none absolute inset-x-4 bottom-2 z-[35] h-8 rounded-full blur-md ${
              darkMode ? 'bg-blue-400/40' : 'bg-emerald-400/35'
            }`}
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
          className={`backdrop-blur-sm px-2.5 py-0.5 rounded-full text-[11px] tabular-nums cursor-pointer transition-colors border ${
            darkMode
              ? 'bg-slate-800/80 border-slate-700/60 text-slate-300 hover:text-white'
              : 'bg-white/90 border-slate-200 text-slate-700 hover:text-slate-900 shadow-sm'
          }`}
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
              className={`absolute left-1/2 top-full z-50 mt-1.5 w-[148px] -translate-x-1/2 rounded-2xl border p-1 shadow-xl backdrop-blur-md ${
                darkMode
                  ? 'bg-slate-900/95 text-white border-slate-800'
                  : 'bg-white/95 text-slate-900 border-slate-200'
              }`}
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
                        ? darkMode
                          ? 'bg-blue-600 text-white'
                          : 'bg-emerald-500 text-white'
                        : darkMode
                        ? 'text-slate-300 hover:bg-slate-800'
                        : 'text-slate-700 hover:bg-slate-100'
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
    prev.isDark === next.isDark &&
    prev.votes === next.votes &&
    prev.capacity === next.capacity &&
    prev.cycleDays === next.cycleDays &&
    prev.celebrating === next.celebrating &&
    prev.deferredPieceIds === next.deferredPieceIds &&
    prev.settlePieceIds === next.settlePieceIds &&
    prev.onCycleDaysChange === next.onCycleDaysChange &&
    prev.onCelebrationDone === next.onCelebrationDone
  );
}

export const Bowl: React.FC<BowlProps> = React.memo(BowlInner, bowlPropsAreEqual);

// Alias AccumulationBowl to Bowl for full backward compatibility
export const AccumulationBowl = Bowl;
