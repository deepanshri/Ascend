import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import bowlMorning from '../assets/bowl/bowl-morning.png';
import bowlNight from '../assets/bowl/bowl-night.png';
import pieceGreenDark from '../assets/bowl/piece-green-dark.png';
import pieceGreenLight from '../assets/bowl/piece-green-light.png';
import pieceBlueDark from '../assets/bowl/piece-blue-dark.png';
import pieceBlueLight from '../assets/bowl/piece-blue-light.png';
import { CYCLE_DAY_OPTIONS, clampCycleDays, type AccumulationPiece, type CycleDays } from '../services/reportService';
import { tapPress } from '../lib/motionPresets';

const SPRING = { type: 'spring' as const, stiffness: 140, damping: 15, mass: 1.1 };
const SPAWN_Y = -280;
const MAX_VISIBLE_PIECES = 28;
/** Compact 24px (w-6 h-6) so marbles nest inside the base arc. */
const PIECE_SIZE = 24;
const SPILL_ROW = 4;
const SCATTER_COLS = 4;
const MAX_X = 28;

/**
 * Floor anchors sit inside the hollow glass base (not below the PNG foot).
 * Night asset is slightly shorter → nudge floor down a few px.
 */
const THEME_LAYOUT = {
  light: {
    floorAnchorY: 76,
    rimMask: 'radial-gradient(ellipse 50% 38% at 50% 50%, transparent 68%, #000 73%)',
  },
  dark: {
    floorAnchorY: 78,
    rimMask: 'radial-gradient(ellipse 48% 36% at 50% 52%, transparent 66%, #000 71%)',
  },
} as const;

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
  x: number;
  y: number;
  rotation: number;
  entryX: number;
  spills: boolean;
}

interface LaidPiece {
  piece: AccumulationPiece;
  index: number;
  coords: ParticleCoords;
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
 * Scatter inside the glass walls. Y offsets stay small so marbles rest on the
 * hollow interior floor instead of bleeding under the bowl base.
 */
function getParticleCoords(
  index: number,
  total: number,
  isOverflowing: boolean,
  isDark: boolean
): ParticleCoords {
  const layout = isDark ? THEME_LAYOUT.dark : THEME_LAYOUT.light;
  const cols = SCATTER_COLS;
  const row = Math.floor(index / cols);
  const col = index % cols;
  const topRowCount = Math.min(Math.max(total, 1), cols);

  let xOffset = (col - (topRowCount - 1) / 2) * 14 + (row % 2 ? 6 : 0);
  xOffset = Math.max(-MAX_X, Math.min(MAX_X, xOffset));

  // Relative floor offset (~-6…+8 for early rows) + shallow parabola
  const yOffset = -4 + row * 8 + Math.pow(xOffset / 22, 2);
  const rotation = (index * 35) % 360;
  const entryX = ((index * 31) % 17) - 8;
  const spills = isOverflowing && row >= SPILL_ROW;

  return {
    x: xOffset,
    y: layout.floorAnchorY + yOffset + (spills ? -10 : 0),
    rotation: spills ? rotation * 0.2 : rotation * 0.04,
    entryX,
    spills,
  };
}

const pieceBoxStyle = (zIndex: number): React.CSSProperties => ({
  width: PIECE_SIZE,
  height: PIECE_SIZE,
  minWidth: PIECE_SIZE,
  minHeight: PIECE_SIZE,
  maxWidth: PIECE_SIZE,
  maxHeight: PIECE_SIZE,
  aspectRatio: '1 / 1',
  top: 0,
  left: '50%',
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

  const depthShadow = 'drop-shadow-[0_1px_3px_rgba(0,0,0,0.35)]';
  const tintShadow = isDark
    ? 'drop-shadow-[0_0_5px_rgba(59,130,246,0.45)]'
    : 'drop-shadow-[0_0_4px_rgba(16,185,129,0.45)]';
  const fallbackTone = isFallback
    ? isDark
      ? 'bg-blue-300'
      : 'bg-emerald-300'
    : isDark
      ? 'bg-blue-500'
      : 'bg-emerald-500';

  const motionProps = {
    initial: {
      x: coords.x + coords.entryX,
      y: SPAWN_Y,
      rotate: coords.rotation * 0.2,
      opacity: 0,
      scale: 0.88,
    },
    animate: {
      x: coords.x,
      y: coords.y,
      rotate: coords.rotation,
      opacity: 1,
      scale: 1,
    },
    exit: {
      y: SPAWN_Y * 0.2,
      opacity: 0,
      scale: 0.55,
      rotate: coords.rotation * 1.4,
    },
    transition: {
      x: SPRING,
      y: SPRING,
      rotate: SPRING,
      opacity: { duration: 0.35, ease: 'easeOut' as const },
      scale: SPRING,
    },
  };

  const box = pieceBoxStyle(10 + item.index);

  if (broken || !src) {
    return (
      <motion.div
        key={item.piece.id}
        aria-hidden="true"
        className={`pointer-events-none absolute block h-6 w-6 shrink-0 aspect-square rounded-full ${fallbackTone} ${depthShadow} ${tintShadow} transform-gpu will-change-transform`}
        style={box}
        {...motionProps}
      />
    );
  }

  return (
    <motion.img
      key={item.piece.id}
      src={src}
      alt=""
      draggable={false}
      onError={() => setBroken(true)}
      className={`pointer-events-none absolute block h-6 w-6 shrink-0 aspect-square object-contain object-center overflow-visible transform-gpu will-change-transform ${depthShadow} ${tintShadow}`}
      style={{
        ...box,
        objectFit: 'contain',
      }}
      {...motionProps}
    />
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
      className={`pointer-events-none absolute inset-x-[8%] bottom-[4%] top-[18%] rounded-[50%] border-2 ${
        isDark ? 'border-blue-400/40 bg-slate-900/30' : 'border-emerald-400/50 bg-white/25'
      }`}
      aria-hidden="true"
    />
  );
}

export const AccumulationBowl: React.FC<AccumulationBowlProps> = ({
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
}) => {
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
    return visible.map((piece, index) => ({
      piece,
      index,
      coords: getParticleCoords(index, total, isOverflowing, darkMode),
    }));
  }, [pieces, isOverflowing, darkMode]);

  const displayLaid = celebrating
    ? laid.map((item) => ({
        ...item,
        coords: {
          ...item.coords,
          y: item.coords.y + 96,
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
      className="relative mx-auto flex w-full flex-col items-center justify-center select-none"
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

      <div className="relative mx-auto h-[135px] w-[170px] overflow-visible">
        {isOverflowing && !celebrating && (
          <div
            className={`pointer-events-none absolute left-1/2 top-[24%] z-0 h-10 w-[78%] -translate-x-1/2 rounded-full blur-xl ${
              darkMode ? 'bg-blue-500/35' : 'bg-emerald-400/40'
            }`}
            aria-hidden="true"
          />
        )}

        {/* z-0 — back glass */}
        {bowlBroken || !bowlSrc ? (
          <BowlShellFallback isDark={darkMode} />
        ) : (
          <img
            key={`bowl-back-${darkMode ? 'night' : 'morning'}`}
            src={bowlSrc}
            alt=""
            draggable={false}
            onError={() => setBowlBroken(true)}
            className="pointer-events-none absolute inset-0 z-0 h-full w-full object-contain"
          />
        )}

        {/* z-10 — marbles clipped so nothing bleeds under the glass base */}
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center overflow-hidden pb-4">
          <div className="relative h-full w-full">
            <PieceLayer items={insidePieces} isDark={darkMode} />
          </div>
        </div>

        {/* z-20 — front rim (masked hole so marbles show through the opening) */}
        {!bowlBroken && bowlSrc ? (
          <img
            key={`bowl-rim-${darkMode ? 'night' : 'morning'}`}
            src={bowlSrc}
            alt=""
            draggable={false}
            onError={() => setBowlBroken(true)}
            className={`pointer-events-none absolute inset-0 z-20 h-full w-full object-contain ${overflowGlow}`}
            style={{
              WebkitMaskImage: layout.rimMask,
              maskImage: layout.rimMask,
            }}
          />
        ) : null}

        {isOverflowing && !celebrating && (
          <div
            className={`pointer-events-none absolute left-1/2 top-[16%] z-[25] h-7 w-[68%] -translate-x-1/2 rounded-full blur-md ${
              darkMode ? 'bg-blue-400/25' : 'bg-emerald-300/30'
            }`}
            aria-hidden="true"
          />
        )}

        <div className="pointer-events-none absolute inset-0 z-30 overflow-hidden pb-4">
          <PieceLayer items={spillPieces} isDark={darkMode} />
        </div>

        {celebrating && (
          <motion.div
            className={`pointer-events-none absolute inset-x-4 bottom-2 z-40 h-8 rounded-full blur-md ${
              darkMode ? 'bg-blue-400/40' : 'bg-emerald-400/35'
            }`}
            initial={{ opacity: 0, scaleX: 0.4 }}
            animate={{ opacity: [0, 1, 0], scaleX: [0.4, 1.1, 1.2] }}
            transition={{ duration: 1.4, ease: 'easeOut' }}
            aria-hidden="true"
          />
        )}
      </div>

      <div ref={pickerRef} className="relative z-40 mt-3 flex w-full justify-center">
        <motion.button
          type="button"
          id="accumulation-cycle-pill"
          whileTap={tapPress}
          onClick={() => setMenuOpen((open) => !open)}
          aria-expanded={menuOpen}
          aria-haspopup="listbox"
          className={`backdrop-blur-sm px-3 py-1 rounded-full text-xs tabular-nums cursor-pointer transition-colors border ${
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
};
