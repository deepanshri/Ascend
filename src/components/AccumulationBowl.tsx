import React, { useMemo } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import bowlSrc from '../assets/bowl/bowl.png';
import pieceGreenDark from '../assets/bowl/piece-green-dark.png';
import pieceGreenLight from '../assets/bowl/piece-green-light.png';
import pieceBlueDark from '../assets/bowl/piece-blue-dark.png';
import pieceBlueLight from '../assets/bowl/piece-blue-light.png';
import type { AccumulationPiece } from '../services/reportService';

const SPRING = { type: 'spring' as const, stiffness: 250, damping: 18, mass: 0.8 };
const MAX_VISIBLE_PIECES = 42;
const PIECE_SIZE = 34;
const SPILL_ROW = 4;

interface AccumulationBowlProps {
  pieces: AccumulationPiece[];
  fillPercent: number;
  isOverflowing: boolean;
  isDark?: boolean;
  votes: number;
  capacity: number;
  cycleDays: number;
}

interface LaidPiece {
  piece: AccumulationPiece;
  index: number;
  x: number;
  y: number;
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
  const settleX = rangeJitter(`${id}:x`, -20, 20);
  const entryX = rangeJitter(`${id}:entry`, -20, 20);
  const tilt = rangeJitter(`${id}:tilt`, -12, 12);

  const rows = [6, 7, 6, 7, 6, 5, 4];
  let cursor = index;
  let row = 0;
  while (row < rows.length && cursor >= rows[row]) {
    cursor -= rows[row];
    row += 1;
  }
  const cols = rows[Math.min(row, rows.length - 1)] || 4;
  const col = Math.min(cursor, cols - 1);
  const x = (col - (cols - 1) / 2) * 22 + settleX * 0.45;
  let y = 124 - row * 15;
  const spills = isOverflowing && row >= SPILL_ROW;
  if (spills) y -= 16;
  if (isOverflowing && row >= SPILL_ROW + 1) y -= 12;
  return { x, y, tilt, entryX, spills };
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
          className="pointer-events-none absolute top-0 left-1/2 object-contain transform-gpu will-change-transform"
          style={{
            width: PIECE_SIZE,
            height: PIECE_SIZE,
            marginLeft: -PIECE_SIZE / 2,
          }}
          initial={{
            x: item.x + item.entryX,
            y: -36,
            rotate: item.tilt * 0.25,
            opacity: 0.85,
            scale: 0.86,
          }}
          animate={{
            x: item.x,
            y: item.y,
            rotate: item.tilt,
            opacity: 1,
            scale: isOverflowing && item.spills ? 1.05 : 1,
          }}
          exit={{
            y: item.y - 48,
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
}) => {
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

  return (
    <section
      id="accumulation-bowl"
      data-tour="accumulation-bowl"
      className="relative w-full max-w-[360px] mx-auto select-none"
      aria-label={`Accumulation bowl, ${votes} of ${capacity} votes in a ${cycleDays}-day cycle, ${roundedFill} percent full${isOverflowing ? ', overflowing' : ''}`}
    >
      <div className="relative h-[176px] w-full overflow-visible">
        {isOverflowing && (
          <div
            className={`pointer-events-none absolute left-1/2 top-[18%] z-0 h-16 w-[78%] -translate-x-1/2 rounded-full blur-2xl ${
              isDark ? 'bg-blue-500/35' : 'bg-emerald-400/40'
            }`}
            aria-hidden="true"
          />
        )}

        <div className="absolute inset-0 z-10 overflow-visible">
          <PieceLayer items={insidePieces} isDark={isDark} isOverflowing={isOverflowing} />
        </div>

        <img
          src={bowlSrc}
          alt=""
          draggable={false}
          className={`pointer-events-none absolute inset-0 z-20 h-full w-full object-contain object-bottom ${
            isOverflowing
              ? isDark
                ? 'drop-shadow-[0_0_18px_rgba(59,130,246,0.55)]'
                : 'drop-shadow-[0_0_18px_rgba(34,197,94,0.5)]'
              : ''
          }`}
        />

        {isOverflowing && (
          <div
            className={`pointer-events-none absolute left-1/2 top-[14%] z-[25] h-10 w-[70%] -translate-x-1/2 rounded-full blur-md ${
              isDark ? 'bg-blue-400/25' : 'bg-emerald-300/30'
            }`}
            aria-hidden="true"
          />
        )}

        <div className="absolute inset-0 z-30 overflow-visible">
          <PieceLayer items={spillPieces} isDark={isDark} isOverflowing={isOverflowing} />
        </div>
      </div>

      <p className="mt-0.5 text-center text-[10.5px] font-semibold tabular-nums text-slate-400 dark:text-slate-500">
        {votes}/{capacity} · {cycleDays}-day cycle
        {isOverflowing ? ' · overflowing' : ''}
      </p>
    </section>
  );
};
