import React from 'react';
import type { NotificationWindowKey, PsychologyNotificationWindows } from '../lib/notifications';

interface NotificationWindowTogglesProps {
  windows: PsychologyNotificationWindows;
  onToggle: (key: NotificationWindowKey) => void;
}

const ROWS: { key: NotificationWindowKey; title: string; subtitle: string }[] = [
  {
    key: 'morning',
    title: 'Morning Primer',
    subtitle: '8:00 AM identity reminder for active habits',
  },
  {
    key: 'afternoon',
    title: 'Afternoon Momentum Check',
    subtitle: '1:30 PM remaining actions for today’s score',
  },
  {
    key: 'night',
    title: 'Night Consistency Anchor',
    subtitle: '8:30 PM loss-aversion if habits are still open',
  },
];

export const NotificationWindowToggles: React.FC<NotificationWindowTogglesProps> = ({
  windows,
  onToggle,
}) => {
  return (
    <div className="space-y-3">
      {ROWS.map((row, index) => {
        const enabled = windows[row.key];
        return (
          <div
            key={row.key}
            className={`flex items-center justify-between gap-3 ${
              index > 0 ? 'border-t border-slate-100 dark:border-slate-800 pt-2.5' : ''
            }`}
          >
            <div className="flex flex-col min-w-0">
              <span className="text-[12.5px] font-medium text-slate-900 dark:text-white">{row.title}</span>
              <span className="text-[10.5px] text-slate-400 dark:text-slate-500 leading-snug">{row.subtitle}</span>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={enabled}
              aria-label={row.title}
              onClick={() => onToggle(row.key)}
              className={`w-10 h-5.5 flex items-center rounded-full p-0.5 transition duration-200 cursor-pointer shrink-0 ${
                enabled ? 'bg-emerald-600 dark:bg-blue-600' : 'bg-slate-300 dark:bg-slate-700'
              }`}
            >
              <div
                className={`bg-white w-4.5 h-4.5 rounded-full shadow-md transform transition duration-200 ${
                  enabled ? 'translate-x-4.5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        );
      })}
    </div>
  );
};
