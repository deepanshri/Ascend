import React, { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { ContactShadows, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
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

        mesh.material = new THREE.MeshPhysicalMaterial({
          color: new THREE.Color(isDark ? '#e2e8f0' : '#ffffff'), // Pure white/subtle slate base to prevent muddy tinting
          transmission: 0.95, // Let almost all light pass through
          opacity: 0.45, // Reduced by ~40% for high transparency
          transparent: true,
          roughness: 0.08, // Very smooth glass (less frosted = more visibility)
          metalness: 0.1,
          ior: 1.5,
          reflectivity: 0.9,
          clearcoat: 1.0,
          clearcoatRoughness: 0.1,
          depthWrite: false, // CRITICAL: Prevents the front glass from blocking marbles in the WebGL depth buffer
          side: THREE.DoubleSide, // Renders both inside and outside of the bowl
        });
      }
    });
  }, [scene, isDark]);

  return <primitive object={scene} scale={1.2} position={[0, -0.3, 0]} renderOrder={1} />;
}

interface MarbleScatterProps {
  completedCount: number;
  pieces?: AccumulationPiece[];
  deferredPieceIds?: ReadonlySet<string>;
  isDark: boolean;
}

/** Procedural 3D Volumetric Marble Scattering */
function MarbleScatter({ completedCount, pieces, deferredPieceIds, isDark }: MarbleScatterProps) {
  const visiblePieces = useMemo(() => {
    if (!pieces) return null;
    if (!deferredPieceIds || deferredPieceIds.size === 0) return pieces;
    return pieces.filter((p) => !deferredPieceIds.has(p.id));
  }, [pieces, deferredPieceIds]);

  const count = visiblePieces ? visiblePieces.length : completedCount;

  const marbles = useMemo(() => {
    return Array.from({ length: count }).map((_, i) => {
      const piece = visiblePieces ? visiblePieces[i] : null;
      const seed = hashSeed(piece?.id || `marble-${i}`);
      const randX = hashUnit(seed * 17 + i * 3 + 5);
      const randZ = hashUnit(seed * 29 + i * 7 + 11);
      const randYJitter = Math.abs(hashUnit(seed * 43 + i * 11 + 17)) * 0.05;

      // Interior scatter coordinates:
      // X inside bowl radius: randX * 0.55
      // Y height stacking: -0.1 + (Math.floor(i / 5) * 0.25) + randYJitter
      // Z depth position: randZ * 0.55
      const x = randX * 0.55;
      const y = -0.1 + Math.floor(i / 5) * 0.25 + randYJitter;
      const z = randZ * 0.55;

      const isFallback = piece?.kind === 'fallback';
      const color = isDark
        ? isFallback
          ? '#60a5fa'
          : '#2563eb'
        : isFallback
        ? '#34d399'
        : '#059669';

      return {
        id: piece?.id || i,
        position: [x, y, z] as [number, number, number],
        rotation: [
          Math.abs(hashUnit(seed * 13 + i)) * Math.PI,
          Math.abs(hashUnit(seed * 19 + i)) * Math.PI,
          0,
        ] as [number, number, number],
        color,
      };
    });
  }, [count, visiblePieces, isDark]);

  return (
    <group>
      {marbles.map((m) => (
        <mesh key={m.id} position={m.position} rotation={m.rotation}>
          <sphereGeometry args={[0.2, 16, 16]} />
          <meshStandardMaterial color={m.color} roughness={0.15} metalness={0.2} />
        </mesh>
      ))}
    </group>
  );
}

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
        <Canvas
          camera={{ position: [0, 2.5, 4.5], fov: 45 }}
          dpr={[1, 1.5]}
          gl={{ alpha: true, antialias: true, powerPreference: 'high-performance' }}
          className="h-full w-full pointer-events-none"
        >
          <ambientLight intensity={1.2} />
          <directionalLight position={[5, 8, 5]} intensity={2.0} color="#ffffff" />
          <directionalLight position={[-5, 3, -5]} intensity={1.0} color="#38bdf8" />
          <Suspense fallback={null}>
            <BowlModel isDark={darkMode} />
            <MarbleScatter
              completedCount={resolvedCount}
              pieces={pieces}
              deferredPieceIds={deferredPieceIds}
              isDark={darkMode}
            />
            <ContactShadows position={[0, -0.45, 0]} opacity={0.4} scale={4} blur={1.5} far={1} />
          </Suspense>
        </Canvas>

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
