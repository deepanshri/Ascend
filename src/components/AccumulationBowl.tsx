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
    rimCy: 26,
    rimRx: 41,
    // Clip tight to the actual bowl interior floor (not the front glass rim)
    clip: 'ellipse(38% 21% at 50% 52%)',
    // Strong rim mask — covers the front glass overlay aggressively so pieces stay BEHIND it
    rimMask: 'radial-gradient(ellipse 44% 40% at 50% 48%, transparent 44%, rgba(0,0,0,0.5) 55%, #000 65%)',
  },
  dark: {
    cy: 54,
    rx: 32,
    ry: 15,
    rimCy: 28,
    rimRx: 40,
    clip: 'ellipse(36% 20% at 50% 54%)',
    rimMask: 'radial-gradient(ellipse 42% 38% at 50% 49%, transparent 42%, rgba(0,0,0,0.5) 53%, #000 63%)',
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
 * Procedural organic slot generation inside the bowl floor ellipse.
 * Un-aligned, casually packed with procedural jitter while strictly
 * bounded within the inner perimeter.
 */
function buildOrganicSlots(layout: CavityLayout, count: number = 60): { xPct: number; yPct: number }[] {
  const cx = BOWL_W / 2;
  const cy = (layout.cy / 100) * BOWL_H;
  const rx = Math.max(1, (layout.rx / 100) * BOWL_W - PIECE_R * 0.9);
  const ry = Math.max(1, (layout.ry / 100) * BOWL_H - PIECE_R * 0.9);

  const slots: { x: number; y: number }[] = [];
  const minDistSq = (PIECE_SIZE * 0.78) * (PIECE_SIZE * 0.78);

  // Center cluster first, then spiral outwards organically with phyllotaxis + jitter
  slots.push({ x: cx, y: cy });

  for (let i = 1; slots.length < count && i < 220; i++) {
    // Golden angle spiral (~137.5 degrees) for natural organic packing
    const phi = i * 2.3999632;
    const rNorm = Math.sqrt((i + 0.5) / 130);
    if (rNorm > 0.92) continue;

    const jitterX = hashUnit(i * 17 + 3) * (PIECE_R * 0.45);
    const jitterY = hashUnit(i * 29 + 11) * (PIECE_R * 0.35);

    const x = cx + Math.cos(phi) * rx * rNorm + jitterX;
    const y = cy + Math.sin(phi) * ry * rNorm + jitterY;

    // Strict ellipse containment check
    const nx = (x - cx) / rx;
    const ny = (y - cy) / ry;
    if (nx * nx + ny * ny > 0.92) continue;

    // Avoid unnatural overlapping
    let ok = true;
    for (let j = 0; j < slots.length; j++) {
      const dx = x - slots[j].x;
      const dy = y - slots[j].y;
      if (dx * dx + dy * dy < minDistSq) {
        ok = false;
        break;
      }
    }
    if (ok) {
      slots.push({ x, y });
    }
  }

  // Fill order: bottom of the cavity first (physical gravity stacking)
  slots.sort((a, b) => b.y - a.y || Math.abs(a.x - cx) - Math.abs(b.x - cx));
  return slots.map((c) => pxToPct(c.x, c.y));
}

/**
 * Spill landings over / outside the rim — never into the foot or under the bowl.
 * Hooked from the same `isOverflowing` (≥80% of C) flag as the old glow.
 */
function buildSpillSlots(layout: CavityLayout, count: number): { xPct: number; yPct: number }[] {
  const cx = BOWL_W / 2;
  const rimCy = (layout.rimCy / 100) * BOWL_H;
  const rimRx = (layout.rimRx / 100) * BOWL_W;
  const slots: { xPct: number; yPct: number }[] = [];

  for (let i = 0; i < count; i++) {
    const ring = Math.floor(i / 7);
    const slot = i % 7;
    const t = (slot - 3) / 3; // -1 … +1 across the lip
    const jitter = hashUnit(i * 5 + 2) * 1.6;

    if (ring === 0) {
      // Rest on / just outside the rim crest.
      const x = cx + t * (rimRx + PIECE_R * 0.4) + jitter;
      const y = rimCy - PIECE_R * 0.35 + Math.abs(t) * 1.5 + hashUnit(i) * 1.2;
      slots.push(pxToPct(x, y));
      continue;
    }

    // Later rings cascade down the OUTER shoulders (clear of the stem).
    const side = t === 0 ? (i % 2 === 0 ? -1 : 1) : Math.sign(t);
    const x = cx + side * (rimRx + PIECE_R + 3 + (ring - 1) * (PIECE_SIZE * 0.65) + Math.abs(t) * 2) + jitter;
    const y = rimCy + ring * (PIECE_SIZE * 0.7) + Math.abs(t) * 2;
    slots.push(pxToPct(x, y));
  }
  return slots;
}

const STATIC_SLOTS_LIGHT = buildOrganicSlots(THEME_CAVITY.light, 60);
const STATIC_SLOTS_DARK = buildOrganicSlots(THEME_CAVITY.dark, 60);
const STATIC_SPILLS_LIGHT = buildSpillSlots(THEME_CAVITY.light, 35);
const STATIC_SPILLS_DARK = buildSpillSlots(THEME_CAVITY.dark, 35);

function layoutPieces(
  pieces: AccumulationPiece[],
  isOverflowing: boolean,
  isDark: boolean,
  celebrating: boolean,
  capacity: number
): LaidPiece[] {
  const layout = isDark ? THEME_CAVITY.dark : THEME_CAVITY.light;
  const visible = pieces.slice(-MAX_VISIBLE_PIECES);
  const organicSlots = isDark ? STATIC_SLOTS_DARK : STATIC_SLOTS_LIGHT;
  const maxInside = organicSlots.length;

  // Soft cap mirrors reportService OVERFLOW_FILL_RATIO (80% of C = habits × cycleDays).
  // Spill replaces the old overflow glow: at ≥80%, pieces past softCap tumble
  // over the rim even if hex slots remain. Floor-full also spills (physical cap).
  const softCap = Math.max(0, Math.floor(Math.max(0, capacity) * OVERFLOW_FILL_RATIO));
  let insideBudget: number;
  if (celebrating) {
    // Cycle complete → keep a small floor cluster; rest spill over the rim
    // (never the old +22% shove that dumped pieces under the foot).
    insideBudget = Math.min(maxInside, Math.max(0, Math.floor(visible.length * 0.35)));
  } else if (isOverflowing) {
    insideBudget = Math.min(maxInside, softCap, visible.length);
  } else {
    insideBudget = Math.min(maxInside, visible.length);
  }

  const spillSlots = isDark ? STATIC_SPILLS_DARK : STATIC_SPILLS_LIGHT;
  const spillFallback = { xPct: 0, yPct: layout.rimCy - 8 };

  return visible.map((piece, index) => {
    const spills = index >= insideBudget;
    const slot = spills
      ? spillSlots[index - insideBudget] ?? spillFallback
      : organicSlots[index] ?? { xPct: 0, yPct: layout.cy };

    const pieceSeed = hashString(piece.id || `${piece.habitId}-${index}`);
    // Random rotation across full 360 degrees (unaligned, casual)
    const rotation = Math.abs((pieceSeed * 179) % 360);
    // Natural scale variance: 0.95 - 1.05
    const scale = 0.95 + Math.abs(hashUnit(index * 23 + 7)) * 0.1;

    return {
      piece,
      index,
      coords: {
        xPct: slot.xPct,
        yPct: slot.yPct,
        rotation,
        scale,
        entryXPct: hashUnit(index * 17 + 9) * 8,
        spills,
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

    const box = pieceBoxStyle();

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
        isOverflowing,
        darkMode,
        celebrating,
        capacity
      ),
    [pieces, isOverflowing, darkMode, celebrating, capacity]
  );

  const visibleLaid = useMemo(() => {
    if (!deferredPieceIds || deferredPieceIds.size === 0) return laid;
    return laid.filter((item) => !deferredPieceIds.has(item.piece.id));
  }, [laid, deferredPieceIds]);

  const insidePieces = visibleLaid.filter((item) => !item.coords.spills);
  const spillPieces = visibleLaid.filter((item) => item.coords.spills);
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
            <PieceLayer items={insidePieces} isDark={darkMode} settlePieceIds={settlePieceIds} />
          </div>
        </div>

        {/* Layer 3 — front rim overlay: opacity boosted + stronger mask to visually place pieces INSIDE */}
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
              opacity: 1,
            }}
          />
        ) : null}

        <div
          className="pointer-events-none absolute inset-0 z-[3] mix-blend-overlay"
          style={{
            background:
              'linear-gradient(180deg, transparent 30%, rgba(255,255,255,0.18) 48%, transparent 62%)',
            WebkitMaskImage: cavity.rimMask,
            maskImage: cavity.rimMask,
          }}
          aria-hidden="true"
        />

        {/* Spill layer — above the rim; same isOverflowing (≥80%) trigger; replaces overflow glow */}
        <div className="pointer-events-none absolute inset-0 z-[4] overflow-visible">
          <PieceLayer items={spillPieces} isDark={darkMode} settlePieceIds={settlePieceIds} />
        </div>

        {/* Cycle-complete flash only — overflow feedback is the spill, not a persistent glow */}
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
