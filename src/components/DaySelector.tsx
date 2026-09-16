import React, { useEffect, useMemo, useRef } from 'react';
import { addDaysIso, parseIsoDateParts, toISODate } from '../utils/dates';

interface DaySelectorProps {
  selectedIso: string;
  onSelectIso: (iso: string) => void;
  days?: number;
  isDark?: boolean;
}

function dayLabel(iso: string): { weekday: string; day: string } {
  const parts = parseIsoDateParts(iso);
  if (!parts) return { weekday: '', day: '' };
  const date = new Date(parts.year, parts.month - 1, parts.day);
  return {
    weekday: date.toLocaleDateString('en-US', { weekday: 'narrow' }),
    day: String(parts.day),
  };
}

/** Compact horizontal calendar strip for inspecting any past day on Report. */
export const DaySelector: React.FC<DaySelectorProps> = ({
  selectedIso,
  onSelectIso,
  days = 14,
  isDark = false,
}) => {
  const todayIso = toISODate();
  const todayBtnRef = useRef<HTMLButtonElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);

  const dates = useMemo(() => {
    const list: string[] = [];
    for (let i = days - 1; i >= 0; i -= 1) {
      list.push(addDaysIso(todayIso, -i));
    }
    return list;
  }, [todayIso, days]);

  // Land on Today centered in the strip whenever the Report mounts / day rolls.
  useEffect(() => {
    const button = todayBtnRef.current;
    if (!button) return;
    const frame = window.requestAnimationFrame(() => {
      button.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'instant' as ScrollBehavior });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [todayIso, days]);

  return (
    <section
      id="report-day-selector"
      data-tour="report-day-selector"
      className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 p-3 space-y-2"
    >
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Day selector
        </span>
        <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 tabular-nums">
          {selectedIso}
        </span>
      </div>
      <div ref={scrollerRef} className="flex gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
        {dates.map((iso) => {
          const active = iso === selectedIso;
          const isToday = iso === todayIso;
          const { weekday, day } = dayLabel(iso);
          return (
            <button
              key={iso}
              ref={isToday ? todayBtnRef : undefined}
              type="button"
              onClick={() => onSelectIso(iso)}
              className={`shrink-0 w-10 py-1.5 rounded-xl flex flex-col items-center cursor-pointer transition ${
                active
                  ? isDark
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-emerald-600 text-white shadow-xs'
                  : isDark
                    ? 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
              aria-pressed={active}
              aria-current={isToday ? 'date' : undefined}
              title={isToday ? `Today · ${iso}` : iso}
            >
              <span className="text-[9px] font-semibold uppercase opacity-80">{weekday}</span>
              <span className="text-[13px] font-bold tabular-nums leading-tight">{day}</span>
              {isToday && !active && (
                <span className={`mt-0.5 w-1 h-1 rounded-full ${isDark ? 'bg-blue-400' : 'bg-emerald-500'}`} />
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
};
