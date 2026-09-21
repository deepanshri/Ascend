import React from 'react';
import { AccumulationBowl } from './AccumulationBowl';
import { MomentumPill } from './MomentumPill';
import type { AccumulationPiece, BowlFill, CycleDays } from '../services/reportService';

interface HomeViewProps {
  pieces: AccumulationPiece[];
  bowlFill: BowlFill;
  isDark?: boolean;
  momentumScore: number;
  /** Increments on each habit completion / miss so the island always pulses. */
  momentumPulse?: number;
  onCycleDaysChange: (days: CycleDays) => void;
  celebrating?: boolean;
  onCelebrationDone?: () => void;
  deferredPieceIds?: ReadonlySet<string>;
  settlePieceIds?: ReadonlySet<string>;
  children: React.ReactNode;
}

export const HomeView: React.FC<HomeViewProps> = ({
  pieces,
  bowlFill,
  isDark = false,
  momentumScore,
  momentumPulse = 0,
  onCycleDaysChange,
  celebrating = false,
  onCelebrationDone,
  deferredPieceIds,
  settlePieceIds,
  children,
}) => {
  const darkMode = Boolean(isDark);
  const safePieces = Array.isArray(pieces) ? pieces : [];
  const fillPercent = Number.isFinite(bowlFill?.fillPercent) ? bowlFill.fillPercent : 0;
  const votes = Number.isFinite(bowlFill?.votes) ? bowlFill.votes : 0;
  const capacity = Number.isFinite(bowlFill?.capacity) ? Math.max(0, bowlFill.capacity) : 0;
  const cycleDays = Number.isFinite(bowlFill?.cycleDays) ? bowlFill.cycleDays : 7;

  return (
    <div className="mt-0 flex w-full flex-col items-center pt-1">
      <div className="relative z-10 mb-1 flex w-full justify-center">
        <MomentumPill
          momentumScore={momentumScore}
          momentumPulse={momentumPulse}
          isDark={darkMode}
        />
      </div>

      <div className="mx-auto mt-0 flex w-full flex-col items-center justify-center">
        <AccumulationBowl
          pieces={safePieces}
          fillPercent={fillPercent}
          isOverflowing={Boolean(bowlFill?.isOverflowing)}
          isDark={darkMode}
          votes={votes}
          capacity={capacity}
          cycleDays={cycleDays}
          onCycleDaysChange={onCycleDaysChange}
          celebrating={celebrating}
          onCelebrationDone={onCelebrationDone}
          deferredPieceIds={deferredPieceIds}
          settlePieceIds={settlePieceIds}
        />
      </div>

      <div className="mt-1.5 flex w-full flex-col gap-2">{children}</div>
    </div>
  );
};
