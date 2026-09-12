import React, { useState } from 'react';
import { Habit, HabitCategory, HabitPriority } from '../types';

interface HabitDetailModalProps {
  habit: Habit | null;
  isOpen: boolean;
  onClose: () => void;
  onDeleteHabit: (habitId: string) => void;
  onUpdateHabit: (updated: Habit) => void;
  onArchiveHabit?: (habitId: string) => void;
  todayIndex?: number;
}

export const HabitDetailModal: React.FC<HabitDetailModalProps> = ({
  habit,
  isOpen,
  onClose,
  onDeleteHabit,
  onUpdateHabit,
}) => {
  if (!isOpen || !habit) return null;

  const initialCategory: HabitCategory =
    habit.category === 'work' ? 'work' : 'self_improvement';

  const [name, setName] = useState(habit.name);
  const [priority, setPriority] = useState<HabitPriority>(habit.priority || 'mid');
  const [purpose, setPurpose] = useState(habit.purposeAnchor || '');
  const [fallback, setFallback] = useState(habit.fallbackMicroHabit || '');
  const [category, setCategory] = useState<HabitCategory>(initialCategory);

  const handleSave = () => {
    onUpdateHabit({
      ...habit,
      name: name.trim() || habit.name,
      priority,
      purposeAnchor: purpose.trim(),
      fallbackMicroHabit: fallback.trim(),
      tags: [category === 'work' ? 'W' : 'SI'],
      category,
    });
    onClose();
  };

  const handleDelete = () => {
    onDeleteHabit(habit.id);
    onClose();
  };

  return (
    <div
      id="habit-detail-modal-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in duration-200"
    >
      <div
        id="habit-detail-modal-card"
        className="relative w-full max-w-[380px] bg-white dark:bg-slate-900 rounded-3xl p-5 shadow-2xl border border-slate-100 dark:border-slate-800 flex flex-col animate-in zoom-in-95 duration-200"
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h2 className="text-[16.5px] font-bold text-slate-900 dark:text-white leading-tight">Edit Habit</h2>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">Name, purpose, fallback & category</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="w-7 h-7 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white transition cursor-pointer"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content Fields */}
        <div className="mt-3.5 space-y-3 text-[12.5px]">
          {/* Name */}
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1">
              Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Habit name..."
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:bg-white dark:focus:bg-slate-800 focus:outline-emerald-500 dark:focus:outline-blue-500 font-semibold text-[13px]"
            />
          </div>

          {/* Priority */}
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1">
              Priority
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setPriority('high')}
                className={`py-1.5 px-2 rounded-xl border text-center transition font-semibold text-[11.5px] flex items-center justify-center space-x-1.5 cursor-pointer ${
                  priority === 'high'
                    ? 'border-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200 font-bold ring-1 ring-emerald-500'
                    : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                }`}
              >
                <span className="w-2.5 h-2.5 rounded-full bg-[#16a34a] shrink-0" />
                <span>High</span>
              </button>

              <button
                type="button"
                onClick={() => setPriority('mid')}
                className={`py-1.5 px-2 rounded-xl border text-center transition font-semibold text-[11.5px] flex items-center justify-center space-x-1.5 cursor-pointer ${
                  priority === 'mid'
                    ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-900 dark:text-emerald-200 font-bold ring-1 ring-emerald-400'
                    : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                }`}
              >
                <span className="w-2.5 h-2.5 rounded-full bg-[#86efac] shrink-0" />
                <span>Mid</span>
              </button>

              <button
                type="button"
                onClick={() => setPriority('low')}
                className={`py-1.5 px-2 rounded-xl border text-center transition font-semibold text-[11.5px] flex items-center justify-center space-x-1.5 cursor-pointer ${
                  priority === 'low'
                    ? 'border-slate-400 bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-slate-100 font-bold ring-1 ring-slate-400'
                    : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                }`}
              >
                <span className="w-2.5 h-2.5 rounded-full bg-[#94a3b8] shrink-0" />
                <span>Low</span>
              </button>
            </div>
          </div>

          {/* Purpose */}
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1">
              Purpose
            </label>
            <input
              type="text"
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              placeholder="Why I built this..."
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:bg-white dark:focus:bg-slate-800 focus:outline-emerald-500 dark:focus:outline-blue-500 text-[12.5px]"
            />
          </div>

          {/* Fallback */}
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1">
              Fallback
            </label>
            <input
              type="text"
              value={fallback}
              onChange={(e) => setFallback(e.target.value)}
              placeholder="e.g. 2 min version / 1 single page"
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:bg-white dark:focus:bg-slate-800 focus:outline-emerald-500 dark:focus:outline-blue-500 text-[12.5px]"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1.5">
              Category
            </label>
            <div className="flex rounded-full bg-slate-100 dark:bg-slate-800 p-1">
              <button
                type="button"
                onClick={() => setCategory('work')}
                className={`flex-1 py-1.5 px-3 rounded-full text-[11.5px] font-bold transition cursor-pointer ${
                  category === 'work'
                    ? 'bg-white dark:bg-slate-700 text-green-700 dark:text-green-300 shadow-sm'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                Work
              </button>
              <button
                type="button"
                onClick={() => setCategory('self_improvement')}
                className={`flex-1 py-1.5 px-3 rounded-full text-[11.5px] font-bold transition cursor-pointer ${
                  category === 'self_improvement'
                    ? 'bg-white dark:bg-slate-700 text-teal-800 dark:text-teal-300 shadow-sm'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                Self Improvement
              </button>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <button
            type="button"
            onClick={handleDelete}
            className="text-rose-600 hover:text-rose-700 font-semibold text-[11.5px] px-2 py-1 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/40 transition cursor-pointer"
          >
            Delete Habit
          </button>

          <div className="flex space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium text-[11.5px] rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="px-4 py-1.5 bg-[#23C15D] hover:bg-emerald-600 dark:bg-blue-600 dark:hover:bg-blue-500 text-white font-semibold text-[11.5px] rounded-xl shadow-xs cursor-pointer"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
