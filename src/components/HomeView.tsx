import React from 'react';
import { AccumulationBowl } from './AccumulationBowl';
import type { TimeOfDay } from '../types/habit';
import type { AccumulationPiece, BowlFill, CycleDays } from '../services/reportService';

interface HomeViewProps {
  pieces: AccumulationPiece[];
  bowlFill: BowlFill;
  isDark?: boolean;
  mode: TimeOfDay;
  onModeChange: (mode: TimeOfDay) => void;
  onCycleDaysChange: (days: CycleDays) => void;
  children: React.ReactNode;
}

export const HomeView: React.FC<HomeViewProps> = ({
  pieces,
  bowlFill,
  isDark = false,
  mode,
  onModeChange,
  onCycleDaysChange,
  children,
}) => {
  return (
    <div className="mt-2 flex flex-col space-y-3">
      <AccumulationBowl
        pieces={pieces}
        fillPercent={bowlFill.fillPercent}
        isOverflowing={bowlFill.isOverflowing}
        isDark={isDark}
        mode={mode}
        onModeChange={onModeChange}
        votes={bowlFill.votes}
        capacity={bowlFill.capacity}
        cycleDays={bowlFill.cycleDays}
        onCycleDaysChange={onCycleDaysChange}
      />
      {children}
    </div>
  );
};
