import React from 'react';
import { ALL_WEEKDAYS, WEEKDAY_CHIP_LABELS } from '../utils/schedule';

interface WeekdayScheduleChipsProps {
  selected: number[];
  onChange: (next: number[]) => void;
  hint?: string;
}

export const WeekdayScheduleChips: React.FC<WeekdayScheduleChipsProps> = ({
  selected,
  onChange,
  hint = 'Grey days are off — they skip decay and never count as a miss. Leave all grey for every day.',
}) => {
  const selectedSet = new Set(selected);

  const toggle = (day: number) => {
    if (selectedSet.has(day)) {
      onChange(selected.filter((value) => value !== day));
      return;
    }
    onChange([...selected, day].sort((a, b) => a - b));
  };

  return (
    <div>
      <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1.5 text-[12px]">
        Scheduled days
      </label>
      <div className="grid grid-cols-7 gap-1">
        {ALL_WEEKDAYS.map((day) => {
          const isOn = selectedSet.has(day);
          return (
            <button
              key={day}
              type="button"
              aria-pressed={isOn}
              onClick={() => toggle(day)}
              className={`py-1.5 rounded-xl text-[10.5px] font-bold transition cursor-pointer border ${
                isOn
                  ? 'bg-accent text-accent-fg border-accent shadow-xs'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 border-slate-200/80 dark:border-slate-700'
              }`}
            >
              {WEEKDAY_CHIP_LABELS[day]}
            </button>
          );
        })}
      </div>
      {hint && <p className="text-[10.5px] text-slate-400 mt-1">{hint}</p>}
    </div>
  );
};
