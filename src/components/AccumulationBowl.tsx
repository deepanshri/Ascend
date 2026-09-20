import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import bowlMorning from '../assets/bowl/bowl-morning.webp';
import bowlNight from '../assets/bowl/bowl-night.webp';
import pieceGreenDark from '../assets/bowl/piece-green-dark.webp';
import pieceGreenLight from '../assets/bowl/piece-green-light.webp';
import pieceBlueDark from '../assets/bowl/piece-blue-dark.webp';
import pieceBlueLight from '../assets/bowl/piece-blue-light.webp';
import { CYCLE_DAY_OPTIONS, clampCycleDays, type AccumulationPiece, type CycleDays } from '../services/reportService';
import { tapPress } from '../lib/motionPresets';

const DROP_SPRING = { type: 'spring' as const, stiffness: 220, damping: 26, mass: 0.75, restDelta: 0.4 };
/** Spawn above the rim as a % of bowl height so drops scale with the container. */
const SPAWN_Y_PCT = -42;
const MAX_VISIBLE_PIECES = 28;
/** Marble diameter in px — large enough for baked specular to read. */
const PIECE_SIZE = 20;
const SPILL_ROW = 5;
/** Min center distance as % of bowl width (~0.72× marble diameter at 140px wide). */
const MIN_SEP_X_PCT = 11.4;
const MIN_SEP_Y_PCT = 8.8;
const ROW_RISE_Y_PCT = 6.8;
const COL_STEP_X_PCT = 12.4;

/**
 * Inner-cavity map (percent of bowl image). Floor sits in the lower ~60% of
 * the frame so marbles rest in the glass base — not across the lip.
 *
 * Ellipse half-width grows from floor → rim; parabolic floor lifts edges:
 *   y_floor(x) = floorY − k · (x / rxFloor)²
 */
const THEME_LAYOUT = {
  light: {
    floorYPct: 72,
    ceilingYPct: 44,
    rxFloor: 15.5,
    rxRim: 26,
    parabolaK: 5.5,
    /** Mask keeps front rim/lip; transparent hole reveals marbles in cavity. */
    rimMask: 'radial-gradient(ellipse 44% 40% at 50% 52%, transparent 52%, #000 64%)',
  },
  dark: {
    floorYPct: 73.5,
    ceilingYPct: 45,
    rxFloor: 15,
    rxRim: 25.5,
    parabolaK: 5.5,
    rimMask: 'radial-gradient(ellipse 42% 38% at 50% 53%, transparent 50%, #000 62%)',
  },
} as const;

type CavityLayout = (typeof THEME_LAYOUT)[keyof typeof THEME_LAYOUT];

/** Ellipse half-width at a given depth (narrower on the floor, wider near rim). */
function halfWidthAt(yPct: number, layout: CavityLayout): number {
  const span = Math.max(1, layout.floorYPct - layout.ceilingYPct);
  const t = Math.max(0, Math.min(1, (layout.floorYPct - yPct) / span));
  return layout.rxFloor + t * (layout.rxRim - layout.rxFloor);
}

/** Parabolic glass floor — center deepest, edges rise toward the walls. */
function floorCurveY(xPct: number, layout: CavityLayout): number {
  const nx = xPct / Math.max(1, layout.rxFloor);
  return layout.floorYPct - layout.parabolaK * nx * nx;
}

/** Project a point into the elliptical cavity (lower 60% of the bowl frame). */
function clampToCavity(xPct: number, yPct: number, layout: CavityLayout): { xPct: number; yPct: number } {
  let x = xPct;
  let y = yPct;
  for (let i = 0; i < 3; i++) {
    y = Math.max(layout.ceilingYPct, Math.min(layout.floorYPct, y));
    const rx = halfWidthAt(y, layout);
    if (Math.abs(x) > rx) x = Math.sign(x || 1) * rx;
    const floorY = floorCurveY(x, layout);
    y = Math.min(y, floorY);
    y = Math.max(layout.ceilingYPct, y);
  }
  return { xPct: x, yPct: y };
}

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
}

interface ParticleCoords {
  /** Horizontal offset as % of bowl width from center. */
  xPct: number;
  /** Vertical landing as % of bowl height from top. */
  yPct: number;
  rotation: number;
  /** Settled scale variance for an imperfect pile. */
  scale: number;
  entryXPct: number;
  spills: boolean;
  /** Organic blob radius so spheres aren't perfect clones. */
  radius: string;
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

/**
 * Bottom-up packing inside the elliptical cavity: earliest pieces rest on the
 * parabolic glass floor; later pieces stack toward the rim (smaller yPct).
 */
function getParticleCoords(
  index: number,
  _total: number,
  isOverflowing: boolean,
  isDark: boolean
): ParticleCoords {
  const layout = isDark ? THEME_LAYOUT.dark : THEME_LAYOUT.light;

  // Wider base rows; odd rows nest in the gaps (hex lattice).
  const rowCap = (row: number) => Math.max(2, 4 - Math.floor(row / 2));
  let remaining = index;
  let row = 0;
  while (remaining >= rowCap(row)) {
    remaining -= rowCap(row);
    row += 1;
  }
  const cols = rowCap(row);
  const col = remaining;

  const nest = row % 2 === 1 ? COL_STEP_X_PCT * 0.5 : 0;
  let xPct = (col - (cols - 1) / 2) * COL_STEP_X_PCT + nest;
  xPct += hashUnit(index * 3 + 1) * 1.8;

  // Rest on parabolic floor, then stack upward (decreasing y).
  let yPct = floorCurveY(xPct, layout) - row * ROW_RISE_Y_PCT;
  yPct += hashUnit(index * 5 + 2) * 0.9;

  const spills = isOverflowing && row >= SPILL_ROW;
  if (spills) {
    yPct = layout.ceilingYPct - 4 - (row - SPILL_ROW) * 3.2;
    xPct += hashUnit(index) * 4;
  } else {
    const clamped = clampToCavity(xPct, yPct, layout);
    xPct = clamped.xPct;
    yPct = clamped.yPct;
  }

  const rotation = hashUnit(index * 7 + 11) * 22 + (spills ? hashUnit(index + 40) * 18 : 0);
  const scale = 0.9 + (hashUnit(index * 13 + 4) * 0.5 + 0.5) * 0.14;
  const entryXPct = hashUnit(index * 17 + 9) * 9;
  const rA = 42 + Math.round((hashUnit(index + 21) * 0.5 + 0.5) * 14);
  const rB = 48 + Math.round((hashUnit(index + 27) * 0.5 + 0.5) * 10);
  const rC = 46 + Math.round((hashUnit(index + 33) * 0.5 + 0.5) * 12);
  const rD = 44 + Math.round((hashUnit(index + 39) * 0.5 + 0.5) * 12);

  return {
    xPct,
    yPct,
    rotation,
    scale,
    entryXPct,
    spills,
    radius: `${rA}% ${rB}% ${rC}% ${rD}% / ${rB}% ${rC}% ${rA}% ${rD}%`,
  };
}

/** Nudge centers apart, then re-project into the cavity ellipse. */
function resolvePileSeparation(items: LaidPiece[], isDark: boolean): LaidPiece[] {
  const layout = isDark ? THEME_LAYOUT.dark : THEME_LAYOUT.light;
  const resolved = items.map((item) => ({
    ...item,
    coords: { ...item.coords },
  }));

  for (let i = 0; i < resolved.length; i++) {
    const a = resolved[i].coords;
    if (a.spills) continue;
    for (let pass = 0; pass < 3; pass++) {
      for (let j = 0; j < i; j++) {
        const b = resolved[j].coords;
        if (b.spills) continue;
        const dx = a.xPct - b.xPct;
        const dy = (a.yPct - b.yPct) * (MIN_SEP_X_PCT / MIN_SEP_Y_PCT);
        const dist = Math.hypot(dx, dy);
        if (dist >= MIN_SEP_X_PCT || dist < 0.001) continue;
        const push = ((MIN_SEP_X_PCT - dist) / dist) * 0.55;
        a.xPct += dx * push;
        // Lift newer marble toward the rim (smaller yPct).
        a.yPct += Math.min(-0.4, dy * push * 0.35);
      }
      const clamped = clampToCavity(a.xPct, a.yPct, layout);
      a.xPct = clamped.xPct;
      a.yPct = clamped.yPct;
    }
  }

  return resolved;
}

/**
 * Depth order: deeper (higher yPct) behind; toward-rim + later drops in front.
 */
function depthZIndex(item: LaidPiece): number {
  const depthFromFloor = Math.round((90 - item.coords.yPct) * 3);
  return 10 + depthFromFloor + item.index;
}

const pieceBoxStyle = (zIndex: number): React.CSSProperties => ({
  width: PIECE_SIZE,
  height: PIECE_SIZE,
  minWidth: PIECE_SIZE,
  minHeight: PIECE_SIZE,
  maxWidth: PIECE_SIZE,
  maxHeight: PIECE_SIZE,
  aspectRatio: '1 / 1',
  position: 'absolute',
  marginLeft: -PIECE_SIZE / 2,
  zIndex,
});

const MarblePiece: React.FC<{
  item: LaidPiece;
  isDark: boolean;
}> = ({ item, isDark }) => {
  const isFallback = item.piece.kind === 'fallback';
  const src = getPieceAsset(isDark, isFallback);
  const [broken, setBroken] = useState(false);
  const { coords } = item;

  useEffect(() => {
    setBroken(false);
  }, [src, isDark]);

  const fallbackTone = isFallback
    ? isDark
      ? 'bg-blue-300'
      : 'bg-emerald-300'
    : isDark
      ? 'bg-blue-500'
      : 'bg-emerald-500';

  const specular = isDark
    ? 'radial-gradient(ellipse 48% 38% at 30% 26%, rgba(255,255,255,0.72) 0%, rgba(147,197,253,0.25) 38%, transparent 62%)'
    : 'radial-gradient(ellipse 48% 38% at 30% 26%, rgba(255,255,255,0.78) 0%, rgba(167,243,208,0.28) 38%, transparent 62%)';
  const coreShade =
    'radial-gradient(ellipse 70% 55% at 62% 78%, rgba(0,0,0,0.38) 0%, transparent 68%)';
  const rimLight = isDark
    ? 'inset 1px 1px 2px rgba(147,197,253,0.45), inset -2px -3px 4px rgba(15,23,42,0.45)'
    : 'inset 1px 1px 2px rgba(167,243,208,0.5), inset -2px -3px 4px rgba(6,78,59,0.35)';

  const motionProps = {
    initial: {
      left: `calc(50% + ${coords.xPct + coords.entryXPct * 0.35}%)`,
      top: `${Math.min(SPAWN_Y_PCT, coords.yPct - 28)}%`,
      rotate: coords.rotation * 0.2,
      opacity: 0,
      scale: coords.scale * 0.88,
    },
    animate: {
      left: `calc(50% + ${coords.xPct}%)`,
      top: `${coords.yPct}%`,
      rotate: coords.rotation,
      opacity: 1,
      scale: coords.scale,
    },
    exit: {
      scale: 0,
      opacity: 0,
    },
    transition: {
      left: { ...DROP_SPRING, stiffness: 260, damping: 28 },
      top: DROP_SPRING,
      rotate: { ...DROP_SPRING, stiffness: 180, damping: 24 },
      opacity: { duration: 0.22, ease: 'easeOut' as const },
      scale: { type: 'spring' as const, stiffness: 280, damping: 24 },
    },
  };

  const box = pieceBoxStyle(depthZIndex(item));

  if (broken || !src) {
    return (
      <motion.div
        key={item.piece.id}
        aria-hidden="true"
        className="pointer-events-none absolute block shrink-0"
        style={box}
        {...motionProps}
      >
        <span
          className={`absolute inset-0 ${fallbackTone}`}
          style={{
            borderRadius: coords.radius,
            boxShadow: `${rimLight}, 0 3px 5px rgba(0,0,0,0.35)`,
            backgroundImage: `${specular}, ${coreShade}`,
          }}
        />
        <span
          className="absolute left-1/2 top-[88%] h-[22%] w-[72%] -translate-x-1/2 rounded-full bg-black/40 blur-[2.5px]"
          aria-hidden
        />
      </motion.div>
    );
  }

  return (
    <motion.div
      key={item.piece.id}
      aria-hidden="true"
      className="pointer-events-none absolute block shrink-0"
      style={box}
      {...motionProps}
    >
      {/* Soft contact shadow — sits under the sphere where it meets the pile */}
      <span
        className="absolute left-1/2 top-[86%] z-0 h-[24%] w-[78%] -translate-x-1/2 rounded-full bg-black/45 blur-[3px]"
        aria-hidden
      />
      <span className="relative z-[1] block h-full w-full" style={{ filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.18))' }}>
        <img
          src={src}
          alt=""
          draggable={false}
          onError={() => setBroken(true)}
          className="pointer-events-none absolute inset-0 h-full w-full object-contain object-center"
          style={{ borderRadius: coords.radius }}
        />
        {/* Consistent top-left light source on top of baked asset shading */}
        <span
          className="pointer-events-none absolute inset-[8%]"
          style={{
            borderRadius: coords.radius,
            backgroundImage: specular,
            mixBlendMode: 'soft-light',
          }}
          aria-hidden
        />
        <span
          className="pointer-events-none absolute inset-[8%]"
          style={{
            borderRadius: coords.radius,
            backgroundImage: coreShade,
            mixBlendMode: 'multiply',
            opacity: 0.45,
          }}
          aria-hidden
        />
        <span
          className="pointer-events-none absolute inset-[8%]"
          style={{ borderRadius: coords.radius, boxShadow: rimLight }}
          aria-hidden
        />
      </span>
    </motion.div>
  );
};

const PieceLayer: React.FC<{
  items: LaidPiece[];
  isDark: boolean;
}> = ({ items, isDark }) => {
  const ordered = useMemo(
    () => [...items].sort((a, b) => depthZIndex(a) - depthZIndex(b)),
    [items]
  );
  return (
    <AnimatePresence initial={false}>
      {ordered.map((item) => (
        <MarblePiece key={item.piece.id} item={item} isDark={isDark} />
      ))}
    </AnimatePresence>
  );
};

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
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [bowlBroken, setBowlBroken] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  const selectedCycle = clampCycleDays(cycleDays);
  const celebrateDoneRef = useRef(onCelebrationDone);
  celebrateDoneRef.current = onCelebrationDone;

  const darkMode = Boolean(isDark);
  const bowlSrc = resolveBowlSrc(darkMode);
  const layout = darkMode ? THEME_LAYOUT.dark : THEME_LAYOUT.light;

  useEffect(() => {
    setBowlBroken(false);
  }, [bowlSrc, darkMode]);

  const laid = useMemo<LaidPiece[]>(() => {
    const safePieces = Array.isArray(pieces) ? pieces : [];
    const visible = safePieces.slice(-MAX_VISIBLE_PIECES);
    const total = visible.length;
    const raw = visible.map((piece, index) => ({
      piece,
      index,
      coords: getParticleCoords(index, total, isOverflowing, darkMode),
    }));
    return resolvePileSeparation(raw, darkMode);
  }, [pieces, isOverflowing, darkMode]);

  const displayLaid = celebrating
    ? laid.map((item) => ({
        ...item,
        coords: {
          ...item.coords,
          yPct: item.coords.yPct + 28,
          spills: true,
        },
      }))
    : laid;
  const insidePieces = displayLaid.filter((item) => !item.coords.spills);
  const spillPieces = displayLaid.filter((item) => item.coords.spills);
  const roundedFill = Math.round(fillPercent);
  const overflowGlow = isOverflowing
    ? darkMode
      ? 'drop-shadow-[0_0_14px_rgba(59,130,246,0.5)]'
      : 'drop-shadow-[0_0_14px_rgba(34,197,94,0.45)]'
    : '';

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

      <div className="relative mx-auto h-24 w-[108px] overflow-visible">
        {isOverflowing && !celebrating && (
          <div
            className={`pointer-events-none absolute left-1/2 top-[55%] z-[1] h-9 w-[70%] -translate-x-1/2 rounded-full blur-xl ${
              darkMode ? 'bg-blue-500/35' : 'bg-emerald-400/40'
            }`}
            aria-hidden="true"
          />
        )}

        {/* Layer 1 — back glass (full bowl plate) */}
        {bowlBroken || !bowlSrc ? (
          <BowlShellFallback isDark={darkMode} />
        ) : (
          <img
            key={`bowl-back-${darkMode ? 'night' : 'morning'}`}
            src={bowlSrc}
            alt=""
            draggable={false}
            onError={() => setBowlBroken(true)}
            className="pointer-events-none absolute inset-0 z-[1] h-full w-full object-contain"
          />
        )}

        {/* Layer 2 — marbles settle in the elliptical cavity, behind the front lip */}
        <div
          className="pointer-events-none absolute inset-0 z-[2] overflow-hidden"
          style={{
            // Soft clip to the inner cavity so pieces never paint across the outer lip.
            clipPath: 'ellipse(46% 38% at 50% 58%)',
            WebkitClipPath: 'ellipse(46% 38% at 50% 58%)',
          }}
        >
          <div className="relative h-full w-full">
            <PieceLayer items={insidePieces} isDark={darkMode} />
          </div>
        </div>

        {/* Layer 3 — front rim / glass overlay (masked hole; marbles show through cavity) */}
        {!bowlBroken && bowlSrc ? (
          <img
            key={`bowl-rim-${darkMode ? 'night' : 'morning'}`}
            src={bowlSrc}
            alt=""
            draggable={false}
            onError={() => setBowlBroken(true)}
            className={`pointer-events-none absolute inset-0 z-[3] h-full w-full object-contain ${overflowGlow}`}
            style={{
              WebkitMaskImage: layout.rimMask,
              maskImage: layout.rimMask,
              opacity: 0.97,
            }}
          />
        ) : null}

        {/* Light glass sheen over the front lip only */}
        <div
          className="pointer-events-none absolute inset-0 z-[3] mix-blend-overlay"
          style={{
            background:
              'linear-gradient(180deg, transparent 38%, rgba(255,255,255,0.14) 52%, transparent 68%)',
            WebkitMaskImage: layout.rimMask,
            maskImage: layout.rimMask,
          }}
          aria-hidden="true"
        />

        {isOverflowing && !celebrating && (
          <div
            className={`pointer-events-none absolute left-1/2 top-[38%] z-[4] h-6 w-[62%] -translate-x-1/2 rounded-full blur-md ${
              darkMode ? 'bg-blue-400/25' : 'bg-emerald-300/30'
            }`}
            aria-hidden="true"
          />
        )}

        {/* Spill layer sits above the rim so overflow reads over the lip */}
        <div className="pointer-events-none absolute inset-0 z-[4] overflow-visible">
          <PieceLayer items={spillPieces} isDark={darkMode} />
        </div>

        {celebrating && (
          <motion.div
            className={`pointer-events-none absolute inset-x-4 bottom-2 z-[5] h-8 rounded-full blur-md ${
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
