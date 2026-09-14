import React from 'react';
import { motion } from 'motion/react';
import { Moon, Sun } from 'lucide-react';
import { tapPress } from '../lib/motionPresets';
import type { TimeOfDay } from '../types/habit';

interface TimeOfDayToggleProps {
  value: TimeOfDay;
  onChange: (mode: TimeOfDay) => void;
  size?: 'sm' | 'md';
  id?: string;
}

export const TimeOfDayToggle: React.FC<TimeOfDayToggleProps> = ({
  value,
  onChange,
  size = 'md',
  id,
}) => {
  const compact = size === 'sm';
  return (
    <div
      id={id}
      role="radiogroup"
      aria-label="Morning or night bowl"
      className={`flex rounded-full p-0.5 ${
        compact
          ? 'bg-slate-800/70 border border-slate-700/50'
          : 'bg-slate-100 dark:bg-slate-800'
      }`}
    >
      {(['morning', 'night'] as const).map((mode) => {
        const active = value === mode;
        return (
          <motion.button
            key={mode}
            type="button"
            role="radio"
            aria-checked={active}
            whileTap={tapPress}
            onClick={() => onChange(mode)}
            className={`flex flex-1 items-center justify-center gap-1 rounded-full font-semibold cursor-pointer transition ${
              compact
                ? `px-2.5 py-1 text-[10px] ${
                    active ? 'bg-slate-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
                  }`
                : `py-2 px-3 text-[12px] ${
                    active
                      ? 'bg-white dark:bg-slate-700 text-[#22C55E] dark:text-[#3B82F6] shadow-sm'
                      : 'text-slate-500 dark:text-slate-400'
                  }`
            }`}
          >
            {mode === 'morning' ? (
              <Sun className={compact ? 'w-3 h-3' : 'w-3.5 h-3.5'} strokeWidth={2.4} />
            ) : (
              <Moon className={compact ? 'w-3 h-3' : 'w-3.5 h-3.5'} strokeWidth={2.4} />
            )}
            <span>{mode === 'morning' ? 'Morning' : 'Night'}</span>
          </motion.button>
        );
      })}
    </div>
  );
};
