import React from 'react';
import { AccumulationBowl } from './AccumulationBowl';
import type { AccumulationPiece, BowlFill, CycleDays } from '../services/reportService';

interface HomeViewProps {
  pieces: AccumulationPiece[];
  bowlFill: BowlFill;
  isDark?: boolean;
  onCycleDaysChange: (days: CycleDays) => void;
  children: React.ReactNode;
}

export const HomeView: React.FC<HomeViewProps> = ({
  pieces,
  bowlFill,
  isDark = false,
  onCycleDaysChange,
  children,
}) => {
  return (
    <div className="mt-2 flex flex-col space-y-3 pt-12">
      <AccumulationBowl
        pieces={pieces}
        fillPercent={bowlFill.fillPercent}
        isOverflowing={bowlFill.isOverflowing}
        isDark={isDark}
        votes={bowlFill.votes}
        capacity={bowlFill.capacity}
        cycleDays={bowlFill.cycleDays}
        onCycleDaysChange={onCycleDaysChange}
      />
      {children}
    </div>
  );
};
