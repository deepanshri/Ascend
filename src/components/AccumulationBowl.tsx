import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import bowlSrc from '../assets/bowl/bowl.png';
import pieceGreenDark from '../assets/bowl/piece-green-dark.png';
import pieceGreenLight from '../assets/bowl/piece-green-light.png';
import pieceBlueDark from '../assets/bowl/piece-blue-dark.png';
import pieceBlueLight from '../assets/bowl/piece-blue-light.png';
import { CYCLE_DAY_OPTIONS, clampCycleDays, type AccumulationPiece, type CycleDays } from '../services/reportService';
import { tapPress } from '../lib/motionPresets';

const SPRING = { type: 'spring' as const, stiffness: 250, damping: 18, mass: 0.8 };
const MAX_VISIBLE_PIECES = 28;
const BOWL_WIDTH = 170;
/** ~35% of the compact bowl width so gems fill the base curve. */
const PIECE_SIZE = Math.round(BOWL_WIDTH * 0.35);
const SPILL_ROW = 3;

const CAVITY_CLIP = 'ellipse(38% 30% at 50% 48%)';
const RIM_MASK =
  'radial-gradient(ellipse 39% 31% at 50% 47%, transparent 64%, #000 67%)';

interface AccumulationBowlProps {
  pieces: AccumulationPiece[];
  fillPercent: number;
  isOverflowing: boolean;
  isDark?: boolean;
  votes: number;
  capacity: number;
  cycleDays: number;
  onCycleDaysChange?: (days: CycleDays) => void;
}

interface LaidPiece {
  piece: AccumulationPiece;
  index: number;
  x: number;
  yPercent: number;
  tilt: number;
  entryX: number;
  spills: boolean;
}

function pieceSrc(kind: AccumulationPiece['kind'], isDark: boolean): string {
  if (isDark) return kind === 'full' ? pieceBlueDark : pieceBlueLight;
  return kind === 'full' ? pieceGreenDark : pieceGreenLight;
}

function unitJitter(seed: string): number {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
}

function rangeJitter(seed: string, min: number, max: number): number {
  return min + unitJitter(seed) * (max - min);
}

function restForPiece(index: number, isOverflowing: boolean, id: string) {
  const settleX = rangeJitter(`${id}:x`, -12, 12);
  const entryX = rangeJitter(`${id}:entry`, -20, 20);
  const tilt = rangeJitter(`${id}:tilt`, -10, 10);

  const rows = [3, 4, 3, 3, 2];
  let cursor = index;
  let row = 0;
  while (row < rows.length && cursor >= rows[row]) {
    cursor -= rows[row];
    row += 1;
  }
  const cols = rows[Math.min(row, rows.length - 1)] || 2;
  const col = Math.min(cursor, cols - 1);
  const x = (col - (cols - 1) / 2) * 18 + settleX * 0.35;
  let yPercent = 71 - row * 7.5;
  const spills = isOverflowing && row >= SPILL_ROW;
  if (spills) yPercent -= 8;
  if (isOverflowing && row >= SPILL_ROW + 1) yPercent -= 6;
  return { x, yPercent, tilt, entryX, spills };
}

const PieceLayer: React.FC<{
  items: LaidPiece[];
  isDark: boolean;
  isOverflowing: boolean;
}> = ({ items, isDark, isOverflowing }) => {
  return (
    <AnimatePresence initial={false}>
      {items.map((item) => (
        <motion.img
          key={item.piece.id}
          src={pieceSrc(item.piece.kind, isDark)}
          alt=""
          draggable={false}
          className="pointer-events-none absolute left-1/2 object-contain transform-gpu will-change-transform"
          style={{
            width: PIECE_SIZE,
            height: PIECE_SIZE,
            top: `${item.yPercent}%`,
            marginLeft: -PIECE_SIZE / 2,
            marginTop: -PIECE_SIZE / 2,
          }}
          initial={{
            x: item.x + item.entryX,
            y: -56,
            rotate: item.tilt * 0.25,
            opacity: 0.9,
            scale: 0.88,
          }}
          animate={{
            x: item.x,
            y: 0,
            rotate: item.tilt,
            opacity: 1,
            scale: isOverflowing && item.spills ? 1.04 : 1,
          }}
          exit={{
            y: -28,
            opacity: 0,
            scale: 0.55,
            rotate: item.tilt * 1.4,
          }}
          transition={SPRING}
        />
      ))}
    </AnimatePresence>
  );
};

export const AccumulationBowl: React.FC<AccumulationBowlProps> = ({
  pieces,
  fillPercent,
  isOverflowing,
  isDark = false,
  votes,
  capacity,
  cycleDays,
  onCycleDaysChange,
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  const selectedCycle = clampCycleDays(cycleDays);

  const laid = useMemo<LaidPiece[]>(() => {
    const visible = pieces.slice(-MAX_VISIBLE_PIECES);
    return visible.map((piece, index) => ({
      piece,
      index,
      ...restForPiece(index, isOverflowing, piece.id),
    }));
  }, [pieces, isOverflowing]);

  const insidePieces = laid.filter((item) => !item.spills);
  const spillPieces = laid.filter((item) => item.spills);
  const roundedFill = Math.round(fillPercent);
  const overflowGlow = isOverflowing
    ? isDark
      ? 'drop-shadow-[0_0_14px_rgba(59,130,246,0.5)]'
      : 'drop-shadow-[0_0_14px_rgba(34,197,94,0.45)]'
    : '';

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
      className="relative mx-auto flex w-full max-w-[170px] flex-col items-center select-none"
      aria-label={`Accumulation bowl, ${votes} of ${capacity} votes in a ${selectedCycle}-day cycle, ${roundedFill} percent full${isOverflowing ? ', overflowing' : ''}`}
    >
      <div className="relative h-[135px] w-[170px] overflow-visible">
        {isOverflowing && (
          <div
            className={`pointer-events-none absolute left-1/2 top-[24%] z-0 h-10 w-[78%] -translate-x-1/2 rounded-full blur-xl ${
              isDark ? 'bg-blue-500/35' : 'bg-emerald-400/40'
            }`}
            aria-hidden="true"
          />
        )}

        <img
          src={bowlSrc}
          alt=""
          draggable={false}
          className="pointer-events-none absolute inset-0 z-0 h-full w-full object-contain"
        />
        <div
          className={`pointer-events-none absolute inset-0 z-[1] ${
            isDark ? 'bg-slate-950/20' : 'bg-slate-600/10'
          }`}
          style={{ clipPath: CAVITY_CLIP }}
          aria-hidden="true"
        />

        <div className="absolute inset-0 z-10 overflow-visible" style={{ clipPath: CAVITY_CLIP }}>
          <PieceLayer items={insidePieces} isDark={isDark} isOverflowing={isOverflowing} />
        </div>

        <img
          src={bowlSrc}
          alt=""
          draggable={false}
          className={`pointer-events-none absolute inset-0 z-20 h-full w-full object-contain ${overflowGlow}`}
          style={{
            WebkitMaskImage: RIM_MASK,
            maskImage: RIM_MASK,
          }}
        />

        {isOverflowing && (
          <div
            className={`pointer-events-none absolute left-1/2 top-[16%] z-[25] h-7 w-[68%] -translate-x-1/2 rounded-full blur-md ${
              isDark ? 'bg-blue-400/25' : 'bg-emerald-300/30'
            }`}
            aria-hidden="true"
          />
        )}

        <div className="absolute inset-0 z-30 overflow-visible">
          <PieceLayer items={spillPieces} isDark={isDark} isOverflowing={isOverflowing} />
        </div>
      </div>

      <div ref={pickerRef} className="relative z-40 mt-1.5">
        <motion.button
          type="button"
          id="accumulation-cycle-pill"
          whileTap={tapPress}
          onClick={() => setMenuOpen((open) => !open)}
          aria-expanded={menuOpen}
          aria-haspopup="listbox"
          className="bg-slate-800/60 border border-slate-700/50 backdrop-blur-sm px-3 py-1 rounded-full text-xs text-slate-300 hover:text-white transition-colors cursor-pointer tabular-nums"
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
              className="absolute left-1/2 top-full z-50 mt-1.5 w-[148px] -translate-x-1/2 rounded-2xl border border-slate-700/50 bg-slate-800/95 p-1 shadow-xl backdrop-blur-md"
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
                        ? 'bg-slate-700 text-white'
                        : 'text-slate-300 hover:bg-slate-700/60 hover:text-white'
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
