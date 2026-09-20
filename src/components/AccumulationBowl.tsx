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
/** Flat-plane disc diameter (px) — matches the 108×96 bowl frame. */
const PIECE_SIZE = 14;
const BOWL_W = 108;
const BOWL_H = 96;
const PIECE_R = PIECE_SIZE / 2;

/**
 * Visible interior ellipse of the bowl art (percent of the 108×96 frame).
 * Tuned to the glass cavity — NOT the full image bbox — so pieces never sit
 * in the empty corners or below the foot.
 *
 * Centers are packed inside this ellipse shrunk by the piece radius so the
 * full disc stays inside the rim. Clip-path below mirrors the same oval.
 */
const THEME_CAVITY = {
  light: {
    cy: 55,
    rx: 38,
    ry: 24,
    /** Outer clip (piece edges) — slightly larger than center ellipse. */
    clip: 'ellipse(44% 30% at 50% 55%)',
    rimMask: 'radial-gradient(ellipse 44% 40% at 50% 52%, transparent 52%, #000 64%)',
  },
  dark: {
    cy: 56,
    rx: 37,
    ry: 23,
    clip: 'ellipse(43% 29% at 50% 56%)',
    rimMask: 'radial-gradient(ellipse 42% 38% at 50% 53%, transparent 50%, #000 62%)',
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

/**
 * Flat hex lattice of non-overlapping discs whose centers lie inside the
 * cavity ellipse (shrunk by piece radius). Edges touch (sep = diameter).
 * No stacking / z-piling — single plane only.
 */
function buildFlatSlots(layout: CavityLayout): { xPct: number; yPct: number }[] {
  const cx = BOWL_W / 2;
  const cy = (layout.cy / 100) * BOWL_H;
  const rx = Math.max(1, (layout.rx / 100) * BOWL_W - PIECE_R);
  const ry = Math.max(1, (layout.ry / 100) * BOWL_H - PIECE_R);
  const sep = PIECE_SIZE; // edge-to-edge contact
  const rowH = sep * (Math.sqrt(3) / 2);

  const centers: { x: number; y: number }[] = [];
  let row = 0;
  // Bottom → top so the bowl fills from the floor upward.
  for (let y = cy + ry; y >= cy - ry - 0.01; y -= rowH) {
    const dy = (y - cy) / ry;
    const halfW = rx * Math.sqrt(Math.max(0, 1 - dy * dy));
    const nest = (row % 2) * (sep / 2);
    const xMin = cx - halfW;
    const xMax = cx + halfW;
    for (let x = xMin + nest; x <= xMax + 0.01; x += sep) {
      const nx = (x - cx) / rx;
      const ny = (y - cy) / ry;
      if (nx * nx + ny * ny <= 1.002) {
        centers.push({ x, y });
      }
    }
    row += 1;
  }

  centers.sort((a, b) => b.y - a.y || Math.abs(a.x - cx) - Math.abs(b.x - cx));
  return centers.map((c) => pxToPct(c.x, c.y));
}

/**
 * Spill landing spots just outside / over the rim — used when fill ≥ 80%
 * (`isOverflowing`) for pieces that no longer fit in the flat cavity.
 */
function buildSpillSlots(layout: CavityLayout, count: number): { xPct: number; yPct: number }[] {
  const cx = BOWL_W / 2;
  const cy = (layout.cy / 100) * BOWL_H;
  const rx = (layout.rx / 100) * BOWL_W;
  const ry = (layout.ry / 100) * BOWL_H;
  const slots: { xPct: number; yPct: number }[] = [];

  for (let i = 0; i < count; i++) {
    const ring = Math.floor(i / 6);
    const slot = i % 6;
    // Fan across the top rim, then cascade slightly outward/down the shoulders.
    const t = (slot - 2.5) / 2.5; // -1 … +1
    const rimY = cy - ry - PIECE_R - 2 - ring * (PIECE_SIZE * 0.72);
    const rimX = cx + t * (rx + PIECE_R + 2 + ring * 3) + hashUnit(i * 3) * 2;
    // A few pieces tumble past the outer lip (below rim sides).
    const tumble = slot === 0 || slot === 5;
    const y = tumble ? cy + ry * 0.15 + ring * (PIECE_SIZE * 0.55) : rimY;
    const x = tumble
      ? cx + Math.sign(t || 1) * (rx + PIECE_R + 6 + ring * 4)
      : rimX;
    slots.push(pxToPct(x, y));
  }
  return slots;
}

function layoutPieces(
  pieces: AccumulationPiece[],
  isOverflowing: boolean,
  isDark: boolean,
  celebrating: boolean,
  capacity: number
): LaidPiece[] {
  const layout = isDark ? THEME_CAVITY.dark : THEME_CAVITY.light;
  const visible = pieces.slice(-MAX_VISIBLE_PIECES);
  const flatSlots = buildFlatSlots(layout);
  const maxInside = flatSlots.length;

  // Soft cap mirrors reportService OVERFLOW_FILL_RATIO (80% of C = habits × cycleDays).
  // When overflowing, pieces past that count spill over the rim even if the cavity
  // still has empty hex slots — so spill is the ≥80% signal (glow removed).
  const softCap = Math.max(0, Math.floor(Math.max(0, capacity) * OVERFLOW_FILL_RATIO));
  let insideBudget: number;
  if (celebrating) {
    insideBudget = Math.min(maxInside, visible.length);
  } else if (isOverflowing) {
    insideBudget = Math.min(maxInside, softCap, visible.length);
  } else {
    insideBudget = Math.min(maxInside, visible.length);
  }

  const spillCount = Math.max(0, visible.length - insideBudget);
  const spillSlots = buildSpillSlots(layout, spillCount);

  return visible.map((piece, index) => {
    const spills = index >= insideBudget;
    const slot = spills
      ? spillSlots[index - insideBudget] ?? { xPct: 0, yPct: layout.cy - layout.ry - 12 }
      : flatSlots[index] ?? { xPct: 0, yPct: layout.cy };

    let { xPct, yPct } = slot;
    if (celebrating) {
      yPct = yPct + 22 + Math.abs(hashUnit(index + 8)) * 10;
      xPct = xPct + hashUnit(index * 5) * 14;
    }

    return {
      piece,
      index,
      coords: {
        xPct,
        yPct,
        rotation: hashUnit(index * 7 + 11) * (spills || celebrating ? 48 : 14),
        scale: 1,
        entryXPct: hashUnit(index * 17 + 9) * 8,
        spills: spills || celebrating,
      },
    };
  });
}

/** Center-anchored box — fixes the old top-left `top`/`left` offset bug. */
const pieceBoxStyle = (): React.CSSProperties => ({
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
  zIndex: 10,
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

  const motionProps = {
    initial: {
      left: `calc(50% + ${coords.xPct + coords.entryXPct * 0.35}%)`,
      top: `${Math.min(SPAWN_Y_PCT, coords.yPct - 30)}%`,
      rotate: coords.rotation * 0.15,
      opacity: 0,
      scale: 0.86,
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
      left: { ...DROP_SPRING, stiffness: coords.spills ? 180 : 260, damping: 28 },
      top: { ...DROP_SPRING, stiffness: coords.spills ? 160 : 220, damping: coords.spills ? 22 : 26 },
      rotate: { ...DROP_SPRING, stiffness: 180, damping: 24 },
      opacity: { duration: 0.22, ease: 'easeOut' as const },
      scale: { type: 'spring' as const, stiffness: 280, damping: 24 },
    },
  };

  const box = pieceBoxStyle();

  if (broken || !src) {
    return (
      <motion.div
        key={item.piece.id}
        aria-hidden="true"
        className="pointer-events-none absolute block shrink-0 rounded-full"
        style={box}
        {...motionProps}
      >
        <span className={`absolute inset-0 rounded-full ${fallbackTone}`} />
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
      <img
        src={src}
        alt=""
        draggable={false}
        onError={() => setBroken(true)}
        className="pointer-events-none absolute inset-0 h-full w-full rounded-full object-contain object-center"
      />
    </motion.div>
  );
};

const PieceLayer: React.FC<{
  items: LaidPiece[];
  isDark: boolean;
}> = ({ items, isDark }) => (
  <AnimatePresence initial={false}>
    {items.map((item) => (
      <MarblePiece key={item.piece.id} item={item} isDark={isDark} />
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
        isOverflowing,
        darkMode,
        celebrating,
        capacity
      ),
    [pieces, isOverflowing, darkMode, celebrating, capacity]
  );

  const insidePieces = laid.filter((item) => !item.coords.spills);
  const spillPieces = laid.filter((item) => item.coords.spills);
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

      <div className="relative mx-auto h-24 w-[108px] overflow-visible">
        {/* Layer 1 — back glass */}
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

        {/* Layer 2 — flat packed pieces inside the cavity (clipped to rim oval) */}
        <div
          className="pointer-events-none absolute inset-0 z-[2] overflow-hidden"
          style={{
            clipPath: cavity.clip,
            WebkitClipPath: cavity.clip,
          }}
        >
          <div className="relative h-full w-full">
            <PieceLayer items={insidePieces} isDark={darkMode} />
          </div>
        </div>

        {/* Layer 3 — front rim overlay */}
        {!bowlBroken && bowlSrc ? (
          <img
            key={`bowl-rim-${darkMode ? 'night' : 'morning'}`}
            src={bowlSrc}
            alt=""
            draggable={false}
            onError={() => setBowlBroken(true)}
            className="pointer-events-none absolute inset-0 z-[3] h-full w-full object-contain"
            style={{
              WebkitMaskImage: cavity.rimMask,
              maskImage: cavity.rimMask,
              opacity: 0.97,
            }}
          />
        ) : null}

        <div
          className="pointer-events-none absolute inset-0 z-[3] mix-blend-overlay"
          style={{
            background:
              'linear-gradient(180deg, transparent 38%, rgba(255,255,255,0.14) 52%, transparent 68%)',
            WebkitMaskImage: cavity.rimMask,
            maskImage: cavity.rimMask,
          }}
          aria-hidden="true"
        />

        {/* Spill layer — above the rim; hooks the same isOverflowing (≥80%) flag */}
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
