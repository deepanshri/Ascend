import React from 'react';
import { AccumulationBowl } from './AccumulationBowl';
import type { AccumulationPiece, BowlFill, CycleDays } from '../services/reportService';

interface HomeViewProps {
  pieces: AccumulationPiece[];
  bowlFill: BowlFill;
  isDark?: boolean;
  momentumScore: number;
  onCycleDaysChange: (days: CycleDays) => void;
  celebrating?: boolean;
  onCelebrationDone?: () => void;
  children: React.ReactNode;
}

export const HomeView: React.FC<HomeViewProps> = ({
  pieces,
  bowlFill,
  isDark = false,
  momentumScore,
  onCycleDaysChange,
  celebrating = false,
  onCelebrationDone,
  children,
}) => {
  const roundedMomentum = Math.round(Number.isFinite(momentumScore) ? momentumScore : 0);
  // Stable theme flag — never remount the bowl on light/dark toggle.
  const darkMode = Boolean(isDark);
  const safePieces = Array.isArray(pieces) ? pieces : [];
  const fillPercent = Number.isFinite(bowlFill?.fillPercent) ? bowlFill.fillPercent : 0;
  const votes = Number.isFinite(bowlFill?.votes) ? bowlFill.votes : 0;
  const capacity = Number.isFinite(bowlFill?.capacity) ? Math.max(0, bowlFill.capacity) : 0;
  const cycleDays = Number.isFinite(bowlFill?.cycleDays) ? bowlFill.cycleDays : 7;

  return (
    <div className="mt-2 flex w-full flex-col items-center gap-3 pt-4">
      <div className="flex w-full justify-center">
        <div
          id="home-momentum-badge"
          data-tour="home-momentum-badge"
          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-bold tabular-nums shadow-xs ${
            darkMode
              ? 'bg-slate-900/90 border-blue-500/40 text-blue-200'
              : 'bg-white/95 border-emerald-200 text-emerald-800'
          }`}
          title="Live momentum score"
        >
          <span className={darkMode ? 'text-blue-400' : 'text-emerald-600'}>Momentum</span>
          <span>{roundedMomentum}</span>
        </div>
      </div>

      {/* No theme-keyed remount — AccumulationBowl stays mounted across light/dark. */}
      <div className="mx-auto flex w-full flex-col items-center justify-center">
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
        />
      </div>

      <div className="mt-4 flex w-full flex-col space-y-3">{children}</div>
    </div>
  );
};
