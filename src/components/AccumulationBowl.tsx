import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import bowlMorning from '../assets/bowl/bowl-morning.webp';
import bowlNight from '../assets/bowl/bowl-night.webp';
import pieceGreenDark from '../assets/bowl/piece-green-dark.webp';
import pieceGreenLight from '../assets/bowl/piece-green-light.webp';
import pieceBlueDark from '../assets/bowl/piece-blue-dark.webp';
import pieceBlueLight from '../assets/bowl/piece-blue-light.webp';
import { CYCLE_DAY_OPTIONS, OVERFLOW_FILL_RATIO, clampCycleDays, type AccumulationPiece, type CycleDays } from '../services/reportService';
import { tapPress } from '../lib/motionPresets';

const DROP_SPRING = { type: 'spring' as const, stiffness: 220, damping: 26, mass: 0.75, restDelta: 0.4 };
/** Spawn above the rim as a % of bowl height so drops scale with the container. */
const SPAWN_Y_PCT = -36;
const MAX_VISIBLE_PIECES = 28;
/** Flat-plane disc diameter (px) — sized so ~10–14 pieces pack on the floor. */
const PIECE_SIZE = 10;
const BOWL_W = 108;
const BOWL_H = 96;
const PIECE_R = PIECE_SIZE / 2;

/**
 * Flat floor of the glass cavity (percent of the 108×96 frame).
 *
 * Root cause of “pieces below the bowl”: the previous packing used a tall
 * volume ellipse (cy≈55, ry≈24 → bottoms near ~79%), which placed discs in
 * the stem/foot and empty padding under the art — not the visible interior.
 * Celebrating also shoved every piece +22% downward past the foot.
 *
 * This layout is a single shallow floor ellipse (looking into the bowl).
 * Centers are inset by PIECE_R so disc edges stay inside the rim. Clip-path
 * mirrors the floor; rimCy/rimRx define spill landings over the lip.
 */
const THEME_CAVITY = {
  light: {
    cy: 52,
    rx: 33,
    ry: 16,
    clip: 'ellipse(36% 20% at 50% 53%)',
    frontGlassMask:
      'linear-gradient(180deg, transparent 0%, transparent 34%, rgba(0,0,0,0.35) 42%, rgba(0,0,0,0.85) 49%, #000 58%, #000 100%)',
  },
  dark: {
    cy: 54,
    rx: 32,
    ry: 15,
    clip: 'ellipse(35% 19% at 50% 54%)',
    frontGlassMask:
      'linear-gradient(180deg, transparent 0%, transparent 35%, rgba(0,0,0,0.35) 43%, rgba(0,0,0,0.85) 50%, #000 60%, #000 100%)',
  },
} as const;

type CavityLayout = (typeof THEME_CAVITY)[keyof typeof THEME_CAVITY];

const BOWL_ASSETS = {
  morning: asAssetUrl(bowlMorning),
  night: asAssetUrl(bowlNight),
  pieceGreenDark: asAssetUrl(pieceGreenDark),
  pieceGreenLight: asAssetUrl(pieceGreenLight),
  pieceBlueDark: asAssetUrl(pieceBlueDark),
  pieceBlueLight: asAssetUrl(pieceBlueLight),
} as const;

function asAssetUrl(value: unknown): string {
  if (typeof value === 'string' && value.length > 0) return value;
  if (value && typeof value === 'object' && 'default' in (value as object)) {
    const nested = (value as { default: unknown }).default;
    if (typeof nested === 'string' && nested.length > 0) return nested;
  }
  return String(value ?? '');
}

interface AccumulationBowlProps {
  pieces: AccumulationPiece[];
  fillPercent: number;
  isOverflowing: boolean;
  isDark?: boolean;
  votes: number;
  capacity: number;
  cycleDays: number;
  onCycleDaysChange?: (days: CycleDays) => void;
  celebrating?: boolean;
  onCelebrationDone?: () => void;
  /** Piece ids currently flying card→bowl — omit from cavity until they land. */
  deferredPieceIds?: ReadonlySet<string>;
  /** Piece ids that just landed — short settle instead of full spawn drop. */
  settlePieceIds?: ReadonlySet<string>;
}

interface ParticleCoords {
  /** Horizontal center offset as % of bowl width from mid. */
  xPct: number;
  /** Vertical center as % of bowl height from top. */
  yPct: number;
  rotation: number;
  scale: number;
  entryXPct: number;
  spills: boolean;
}

interface LaidPiece {
  piece: AccumulationPiece;
  index: number;
  coords: ParticleCoords;
}

/** Stable pseudo-random in [-1, 1] from an integer seed. */
function hashUnit(seed: number): number {
  const n = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return (n - Math.floor(n)) * 2 - 1;
}

function resolveBowlSrc(isDark: boolean): string {
  const preferred = isDark ? BOWL_ASSETS.night : BOWL_ASSETS.morning;
  return preferred || BOWL_ASSETS.morning || BOWL_ASSETS.night || '';
}

/** Light → green gems; Dark → blue gems. Never returns undefined when assets bundle. */
function getPieceAsset(isDark: boolean, isFallback: boolean): string {
  if (isDark) {
    const primary = isFallback ? BOWL_ASSETS.pieceBlueLight : BOWL_ASSETS.pieceBlueDark;
    return (
      primary ||
      BOWL_ASSETS.pieceBlueDark ||
      BOWL_ASSETS.pieceBlueLight ||
      BOWL_ASSETS.pieceGreenDark ||
      BOWL_ASSETS.pieceGreenLight ||
      ''
    );
  }
  const primary = isFallback ? BOWL_ASSETS.pieceGreenLight : BOWL_ASSETS.pieceGreenDark;
  return (
    primary ||
    BOWL_ASSETS.pieceGreenDark ||
    BOWL_ASSETS.pieceGreenLight ||
    BOWL_ASSETS.pieceBlueDark ||
    BOWL_ASSETS.pieceBlueLight ||
    ''
  );
}

function pxToPct(x: number, y: number): { xPct: number; yPct: number } {
  return {
    xPct: ((x - BOWL_W / 2) / BOWL_W) * 100,
    yPct: (y / BOWL_H) * 100,
  };
}

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}

/**
 * Procedural random scatter algorithm inside the bounded bowl floor ellipse.
 * Eliminates artificial grid/line stacking at the top rim by computing
 * bounded elliptical scatter coordinates with organic deterministic jitter.
 *
 * Formula:
 *   x = centerX + (rand(-1, 1) * radiusX * 0.75)
 *   y = centerY + (rand(-1, 1) * radiusY * 0.5) + verticalBias
 *   rotation = rand(0, 360)
 *
 * Strict containment:
 *   (x / (rx * 0.82))^2 + ((y - cy) / (ry * 0.82))^2 <= 1
 */
function layoutPieces(
  pieces: AccumulationPiece[],
  isDark: boolean
): LaidPiece[] {
  const layout = isDark ? THEME_CAVITY.dark : THEME_CAVITY.light;
  const visible = pieces.slice(-MAX_VISIBLE_PIECES);
  const totalCount = visible.length;

  const centerX = 0; // xPct relative to 50% horizontal center
  const centerY = layout.cy;
  const radiusX = layout.rx;
  const radiusY = layout.ry;
  const maxRx = radiusX * 0.82;
  const maxRy = radiusY * 0.82;

  const laidPieces: LaidPiece[] = [];

  for (let index = 0; index < totalCount; index++) {
    const piece = visible[index];
    const seed = hashString(piece.id || `${piece.habitId}-${index}`);

    // Bounded pseudo-random values in [-1, 1]
    const randX = hashUnit(seed * 17 + index * 7 + 11);
    const randY = hashUnit(seed * 31 + index * 11 + 23);
    const randRot = Math.abs(seed * 179 + index * 41) % 360;
    const randScale = 0.94 + Math.abs(hashUnit(seed * 43 + index * 13 + 7)) * 0.12;

    // Spec formula:
    // x = centerX + (random(-1, 1) * radiusX * 0.75)
    // y = centerY + (random(-1, 1) * radiusY * 0.5)
    // Newer pieces cluster naturally inside the bottom container volume
    const depthProgression = totalCount > 1 ? index / (totalCount - 1) : 0;
    const verticalBias = (depthProgression - 0.5) * (radiusY * 0.25);

    let xPct = centerX + randX * radiusX * 0.75;
    let yPct = centerY + randY * radiusY * 0.5 + verticalBias;

    // Strict ellipse containment check: (x / maxRx)^2 + ((y - cy) / maxRy)^2 <= 1
    const dx = (xPct - centerX) / maxRx;
    const dy = (yPct - centerY) / maxRy;
    const distSq = dx * dx + dy * dy;

    if (distSq > 1) {
      const norm = Math.sqrt(distSq);
      xPct = centerX + (xPct - centerX) / norm;
      yPct = centerY + (yPct - centerY) / norm;
    }

    // Pairwise separation pass to prevent unnatural direct stacking
    for (let j = 0; j < laidPieces.length; j++) {
      const prev = laidPieces[j].coords;
      const sepX = xPct - prev.xPct;
      const sepY = (yPct - prev.yPct) * (radiusX / radiusY);
      const sepDistSq = sepX * sepX + sepY * sepY;
      const minDist = 5.2; // minimum separation threshold
      if (sepDistSq < minDist * minDist && sepDistSq > 0.001) {
        const sepDist = Math.sqrt(sepDistSq);
        const push = (minDist - sepDist) * 0.45;
        xPct += (sepX / sepDist) * push;
        yPct += ((sepY / sepDist) * push) * (radiusY / radiusX);
      }
    }

    // Final safety clamp to ellipse bounds
    const finalDx = (xPct - centerX) / maxRx;
    const finalDy = (yPct - centerY) / maxRy;
    const finalDistSq = finalDx * finalDx + finalDy * finalDy;
    if (finalDistSq > 1) {
      const norm = Math.sqrt(finalDistSq);
      xPct = centerX + (xPct - centerX) / norm;
      yPct = centerY + (yPct - centerY) / norm;
    }

    laidPieces.push({
      piece,
      index,
      coords: {
        xPct,
        yPct,
        rotation: randRot,
        scale: randScale,
        entryXPct: hashUnit(index * 17 + 9) * 6,
        spills: false,
      },
    });
  }

  return laidPieces;
}

/** Center-anchored box with DOM depth order. */
const pieceBoxStyle = (zIndex: number = 10): React.CSSProperties => ({
  width: PIECE_SIZE,
  height: PIECE_SIZE,
  minWidth: PIECE_SIZE,
  minHeight: PIECE_SIZE,
  maxWidth: PIECE_SIZE,
  maxHeight: PIECE_SIZE,
  aspectRatio: '1 / 1',
  position: 'absolute',
  marginLeft: -PIECE_R,
  marginTop: -PIECE_R,
  zIndex,
});

const MarblePiece: React.FC<{
  item: LaidPiece;
  isDark: boolean;
  settle?: boolean;
}> = React.memo(
  ({ item, isDark, settle }) => {
    const isFallback = item.piece.kind === 'fallback';
    const src = getPieceAsset(isDark, isFallback);
    const [broken, setBroken] = useState(false);
    const { coords } = item;

    const fallbackTone = isFallback
      ? isDark
        ? 'bg-blue-300'
        : 'bg-emerald-300'
      : isDark
        ? 'bg-blue-500'
        : 'bg-emerald-500';

    const xPct = Number.isFinite(coords?.xPct) ? coords.xPct : 0;
    const yPct = Number.isFinite(coords?.yPct) ? coords.yPct : 0;
    const rotation = Number.isFinite(coords?.rotation) ? coords.rotation : 0;
    const scale = Number.isFinite(coords?.scale) ? coords.scale : 1;

    const box = pieceBoxStyle(10 + item.index);

    return (
      <motion.div
        key={item.piece.id}
        initial={
          settle
            ? { scale: scale, opacity: 0, y: 0, rotate: rotation }
            : { scale: 0, opacity: 0, y: -10, rotate: -20 }
        }
        animate={{ scale: scale, opacity: 1, y: 0, rotate: rotation }}
        exit={{ scale: 0, opacity: 0, transition: { duration: 0.2, ease: 'easeOut' } }}
        transition={
          settle
            ? { type: 'spring', stiffness: 320, damping: 28, mass: 0.3 }
            : {
                type: 'spring',
                stiffness: 220,
                damping: 14,
                mass: 0.6,
              }
        }
        style={{
          ...box,
          left: `calc(50% + ${xPct}%)`,
          top: `${yPct}%`,
        }}
        className="pointer-events-none will-change-transform"
        aria-hidden="true"
      >
        {broken || !src ? (
          <div
            className={`h-full w-full rounded-full shadow-inner ${fallbackTone}`}
            aria-hidden="true"
          />
        ) : (
          <img
            src={src}
            alt=""
            draggable={false}
            onError={() => setBroken(true)}
            className="pointer-events-none h-full w-full rounded-full object-contain"
          />
        )}
      </motion.div>
    );
  },
  (prev, next) =>
    prev.isDark === next.isDark &&
    prev.settle === next.settle &&
    prev.item.piece.id === next.item.piece.id &&
    prev.item.piece.kind === next.item.piece.kind &&
    prev.item.coords.xPct === next.item.coords.xPct &&
    prev.item.coords.yPct === next.item.coords.yPct &&
    prev.item.coords.scale === next.item.coords.scale &&
    prev.item.coords.rotation === next.item.coords.rotation &&
    prev.item.coords.spills === next.item.coords.spills
);

const PieceLayer: React.FC<{
  items: LaidPiece[];
  isDark: boolean;
  settlePieceIds?: ReadonlySet<string>;
}> = ({ items, isDark, settlePieceIds }) => (
  <AnimatePresence>
    {(items || []).map((item) => (
      <MarblePiece
        key={item.piece.id}
        item={item}
        isDark={isDark}
        settle={settlePieceIds ? settlePieceIds.has(item.piece.id) : false}
      />
    ))}
  </AnimatePresence>
);

function BowlShellFallback({ isDark }: { isDark: boolean }) {
  return (
    <div
      className={`pointer-events-none absolute inset-x-[8%] bottom-[4%] top-[18%] z-[1] rounded-[50%] border-2 ${
        isDark ? 'border-blue-400/40 bg-slate-900/30' : 'border-emerald-400/50 bg-white/25'
      }`}
      aria-hidden="true"
    />
  );
}

export const AccumulationBowl: React.FC<AccumulationBowlProps> = React.memo(function AccumulationBowl({
  pieces,
  fillPercent,
  isOverflowing,
  isDark = false,
  votes,
  capacity,
  cycleDays,
  onCycleDaysChange,
  celebrating = false,
  onCelebrationDone,
  deferredPieceIds,
  settlePieceIds,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [bowlBroken, setBowlBroken] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  const selectedCycle = clampCycleDays(cycleDays);
  const celebrateDoneRef = useRef(onCelebrationDone);
  celebrateDoneRef.current = onCelebrationDone;

  const darkMode = Boolean(isDark);
  const bowlSrc = resolveBowlSrc(darkMode);
  const cavity = darkMode ? THEME_CAVITY.dark : THEME_CAVITY.light;

  useEffect(() => {
    setBowlBroken(false);
  }, [bowlSrc, darkMode]);

  const laid = useMemo(
    () =>
      layoutPieces(
        Array.isArray(pieces) ? pieces : [],
        darkMode
      ),
    [pieces, darkMode]
  );

  const visibleLaid = useMemo(() => {
    if (!deferredPieceIds || deferredPieceIds.size === 0) return laid;
    return laid.filter((item) => !deferredPieceIds.has(item.piece.id));
  }, [laid, deferredPieceIds]);

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
      aria-label={`${darkMode ? 'Night' : 'Morning'} accumulation bowl, ${votes} of ${capacity} votes in a ${selectedCycle}-day cycle, ${roundedFill} percent full${isOverflowing ? ', overflowing' : ''}${celebrating ? ', cycle complete' : ''}`}
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

      <div id="accumulation-bowl-frame" className="relative mx-auto h-24 w-[108px] overflow-visible">
        {/* Landing target for card→bowl flights (cavity floor). */}
        <div
          id="accumulation-bowl-target"
          className="pointer-events-none absolute left-1/2 top-[56%] h-0 w-0 -translate-x-1/2"
          aria-hidden="true"
        />

        {/* Layer 1 — Back Interior Glass (z-index: 10) */}
        {bowlBroken || !bowlSrc ? (
          <BowlShellFallback isDark={darkMode} />
        ) : (
          <img
            key={`bowl-back-${darkMode ? 'night' : 'morning'}`}
            src={bowlSrc}
            alt=""
            draggable={false}
            onError={() => setBowlBroken(true)}
            className="pointer-events-none absolute inset-0 z-10 h-full w-full object-contain"
          />
        )}

        {/* Layer 2 — Marble Pieces Container (z-index: 20, clipped strictly to inner rim contour) */}
        <div
          className="pointer-events-none absolute inset-0 z-20 overflow-hidden"
          style={{
            clipPath: cavity.clip,
            WebkitClipPath: cavity.clip,
          }}
        >
          <div className="relative h-full w-full">
            <PieceLayer items={visibleLaid} isDark={darkMode} settlePieceIds={settlePieceIds} />
          </div>
        </div>

        {/* Layer 3 — Front Glass Lip & Reflection Overlay (z-index: 30, pointer-events: none) */}
        {!bowlBroken && bowlSrc ? (
          <img
            key={`bowl-front-${darkMode ? 'night' : 'morning'}`}
            src={bowlSrc}
            alt=""
            draggable={false}
            onError={() => setBowlBroken(true)}
            className="pointer-events-none absolute inset-0 z-30 h-full w-full object-contain"
            style={{
              WebkitMaskImage: cavity.frontGlassMask,
              maskImage: cavity.frontGlassMask,
              opacity: 1,
            }}
          />
        ) : null}

        {/* Front specular glass reflection & rim highlights (z-index: 30) */}
        <div
          className="pointer-events-none absolute inset-0 z-30 mix-blend-overlay"
          style={{
            background:
              'radial-gradient(ellipse 65% 35% at 50% 60%, rgba(255,255,255,0.35) 0%, rgba(255,255,255,0.08) 50%, transparent 80%)',
          }}
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute inset-0 z-30"
          style={{
            background:
              'linear-gradient(180deg, transparent 40%, rgba(255,255,255,0.22) 48%, rgba(255,255,255,0.06) 56%, transparent 66%)',
            WebkitMaskImage: cavity.frontGlassMask,
            maskImage: cavity.frontGlassMask,
          }}
          aria-hidden="true"
        />

        {/* Cycle-complete celebration flash */}
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
                    className={`flex w-full cursor-pointer items-center justify-between rounded-xl px-3 py-1.5 text-left text-[12px] font-semibold transition-colors ${
                      active
                        ? darkMode
                          ? 'bg-slate-700 text-white'
                          : 'bg-slate-100 text-slate-900'
                        : darkMode
                          ? 'text-slate-300 hover:bg-slate-800 hover:text-white'
                          : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                    }`}
                  >
                    <span>{days} Days</span>
                    {active ? <span aria-hidden="true">✓</span> : null}
                  </button>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </section>
  );
});
