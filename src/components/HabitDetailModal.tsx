import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { MotionModal } from './MotionModal';
import { tapPress } from '../lib/motionPresets';
import { Habit, HabitCategory, HabitPriority } from '../types';
import { MAX_KEYSTONE_HABITS } from '../lib/keystone';
import { normalizeScheduledDays, scheduleTypeFromDays } from '../utils/schedule';
import { WeekdayScheduleChips } from './WeekdayScheduleChips';
import { resolveHabitTimeOfDay } from '../utils/timeOfDay';
import { formatTargetTimeDisplay } from '../utils/timeFormat';

interface HabitDetailModalProps {
  habit: Habit | null;
  isOpen: boolean;
  onClose: () => void;
  onDeleteHabit: (habitId: string) => void;
  onUpdateHabit: (updated: Habit) => void;
  onArchiveHabit?: (habitId: string) => void;
  todayIndex?: number;
  activeKeystoneCount?: number;
}

export const HabitDetailModal: React.FC<HabitDetailModalProps> = ({
  habit,
  isOpen,
  onClose,
  onDeleteHabit,
  onUpdateHabit,
  activeKeystoneCount = 0,
}) => {
  const [name, setName] = useState('');
  const [priority, setPriority] = useState<HabitPriority>('mid');
  const [purpose, setPurpose] = useState('');
  const [fallback, setFallback] = useState('');
  const [targetTime, setTargetTime] = useState('');
  const [category, setCategory] = useState<HabitCategory>('self_improvement');
  const [isKeystone, setIsKeystone] = useState(false);
  const [keystoneWarning, setKeystoneWarning] = useState(false);
  const [scheduledWeekdays, setScheduledWeekdays] = useState<number[]>([]);

  useEffect(() => {
    if (!habit || !isOpen) return;
    setName(habit.name);
    setPriority(habit.priority || 'mid');
    setPurpose(habit.purposeAnchor || '');
    setFallback(habit.fallbackMicroHabit || '');
    setTargetTime(habit.targetTime || '');
    setCategory(habit.category === 'work' ? 'work' : 'self_improvement');
    setIsKeystone(Boolean(habit.isKeystone));
    setKeystoneWarning(false);
    setScheduledWeekdays(normalizeScheduledDays(habit.scheduledDays));
  }, [habit, isOpen]);

  const othersAtCap = Boolean(habit && !habit.isKeystone && activeKeystoneCount >= MAX_KEYSTONE_HABITS);

  const handleKeystoneToggle = () => {
    if (!isKeystone && othersAtCap) {
      setKeystoneWarning(true);
      return;
    }
    setKeystoneWarning(false);
    setIsKeystone((prev) => !prev);
  };

  const handleSave = () => {
    if (!habit) return;
    const days = normalizeScheduledDays(scheduledWeekdays);
    onUpdateHabit({
      ...habit,
      name: name.trim() || habit.name,
      priority,
      purposeAnchor: purpose.trim(),
      fallbackMicroHabit: fallback.trim(),
      tags: [category === 'work' ? 'W' : 'SI'],
      category,
      isKeystone: isKeystone && !othersAtCap,
      scheduledDays: days,
      scheduleType: scheduleTypeFromDays(days),
      targetDaysPerWeek: days.length,
      timeOfDay: resolveHabitTimeOfDay(habit),
      targetTime: targetTime ? targetTime : undefined,
    });
    onClose();
  };

  const handleDelete = () => {
    if (!habit) return;
    onDeleteHabit(habit.id);
    onClose();
  };

  return (
    <MotionModal
      isOpen={Boolean(isOpen && habit)}
      onClose={onClose}
      overlayId="habit-detail-modal-overlay"
      cardId="habit-detail-modal-card"
      overlayClassName="bg-slate-900/40 dark:bg-slate-950/60 backdrop-blur-xs"
      cardClassName="p-5 max-w-[380px]"
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
            className="w-7 h-7 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white transition cursor-pointer"
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
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:bg-white dark:focus:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-[#22C55E]/25 dark:focus:ring-[#3B82F6]/25 focus:border-[#22C55E] dark:focus:border-[#3B82F6] font-semibold text-[13px]"
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
                    ? 'border-emerald-600 dark:border-blue-500 bg-emerald-50 dark:bg-blue-950/40 text-emerald-900 dark:text-blue-200 font-bold ring-1 ring-emerald-500 dark:ring-blue-500'
                    : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                }`}
              >
                <span className="w-2.5 h-2.5 rounded-full bg-[#16a34a] dark:bg-blue-600 shrink-0" />
                <span>High</span>
              </button>

              <button
                type="button"
                onClick={() => setPriority('mid')}
                className={`py-1.5 px-2 rounded-xl border text-center transition font-semibold text-[11.5px] flex items-center justify-center space-x-1.5 cursor-pointer ${
                  priority === 'mid'
                    ? 'border-emerald-400 dark:border-blue-400 bg-emerald-50 dark:bg-blue-950/30 text-emerald-900 dark:text-blue-200 font-bold ring-1 ring-emerald-400 dark:ring-blue-400'
                    : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                }`}
              >
                <span className="w-2.5 h-2.5 rounded-full bg-[#86efac] dark:bg-blue-400 shrink-0" />
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
                <span className="w-2.5 h-2.5 rounded-full bg-[#94a3b8] dark:bg-blue-800 shrink-0" />
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
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:bg-white dark:focus:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-[#22C55E]/25 dark:focus:ring-[#3B82F6]/25 focus:border-[#22C55E] dark:focus:border-[#3B82F6] text-[12.5px]"
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
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:bg-white dark:focus:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-[#22C55E]/25 dark:focus:ring-[#3B82F6]/25 focus:border-[#22C55E] dark:focus:border-[#3B82F6] text-[12.5px]"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1.5">
              Category
            </label>
            <div className="flex rounded-xl bg-slate-100 dark:bg-slate-800 p-1">
              <button
                type="button"
                onClick={() => setCategory('work')}
                className={`flex-1 py-1.5 px-3 rounded-xl text-[11.5px] font-bold transition cursor-pointer ${
                  category === 'work'
                    ? 'bg-white dark:bg-slate-700 text-[#22C55E] dark:text-[#3B82F6] shadow-sm'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                Work
              </button>
              <button
                type="button"
                onClick={() => setCategory('self_improvement')}
                className={`flex-1 py-1.5 px-3 rounded-xl text-[11.5px] font-bold transition cursor-pointer ${
                  category === 'self_improvement'
                    ? 'bg-white dark:bg-slate-700 text-[#22C55E] dark:text-[#3B82F6] shadow-sm'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                Self Improvement
              </button>
            </div>
          </div>

          <WeekdayScheduleChips selected={scheduledWeekdays} onChange={setScheduledWeekdays} hint="" />

          {/* Target Time */}
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1">
              <span className="flex items-center justify-between">
                <span>Target Time</span>
                {targetTime ? (
                  <button
                    type="button"
                    onClick={() => setTargetTime('')}
                    className="text-[10px] text-rose-600 dark:text-rose-400 font-semibold cursor-pointer hover:underline normal-case tracking-normal"
                  >
                    Clear
                  </button>
                ) : (
                  <span className="text-[10px] font-normal text-slate-400 normal-case tracking-normal">optional</span>
                )}
              </span>
            </label>
            <input
              id="edit-habit-target-time-input"
              type="time"
              value={targetTime}
              onChange={(e) => setTargetTime(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:bg-white dark:focus:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-[#22C55E]/25 dark:focus:ring-[#3B82F6]/25 focus:border-[#22C55E] dark:focus:border-[#3B82F6] text-[12.5px]"
            />
            {targetTime && (
              <div className="mt-1.5 p-2 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/80 text-[11px] text-slate-600 dark:text-slate-300">
                <div className="flex items-center space-x-1 font-semibold text-emerald-800 dark:text-blue-300">
                  <span>Target Time Reached</span>
                  <span>•</span>
                  <span>{formatTargetTimeDisplay(targetTime)}</span>
                </div>
                <p className="text-[11px] font-medium text-slate-700 dark:text-slate-200 mt-0.5">
                  {name.trim() || 'Habit'} — time to execute.
                </p>
                <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
                  Auto-silences upon completion today
                </p>
              </div>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between">
              <label htmlFor="edit-keystone-toggle" className="text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                Is Keystone Habit?
              </label>
              <button
                id="edit-keystone-toggle"
                type="button"
                role="switch"
                aria-checked={isKeystone}
                onClick={handleKeystoneToggle}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border transition ${
                  isKeystone
                    ? 'bg-emerald-500 dark:bg-blue-500 border-emerald-500 dark:border-blue-500'
                    : 'bg-slate-200 dark:bg-slate-700 border-slate-200 dark:border-slate-600'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition ${
                    isKeystone ? 'translate-x-5' : 'translate-x-0.5'
                  } mt-px`}
                />
              </button>
            </div>
            {keystoneWarning && (
              <p role="alert" className="mt-1.5 text-[11.5px] font-semibold text-orange-700 dark:text-orange-300">
                You already have {MAX_KEYSTONE_HABITS} keystone habits. Unflag one before adding another.
              </p>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <button
            type="button"
            onClick={handleDelete}
            className="text-rose-600 hover:text-rose-700 font-semibold text-[11.5px] px-2 py-1 rounded-xl hover:bg-rose-50 dark:hover:bg-rose-950/40 transition cursor-pointer"
          >
            Delete Habit
          </button>

          <div className="flex space-x-2">
            <motion.button
              type="button"
              whileTap={tapPress}
              onClick={onClose}
              className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium text-[11.5px] rounded-2xl hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer"
            >
              Cancel
            </motion.button>
            <motion.button
              type="button"
              whileTap={tapPress}
              onClick={handleSave}
              className="px-4 py-1.5 bg-[#22C55E] hover:bg-emerald-600 dark:bg-[#3B82F6] dark:hover:bg-blue-500 text-white font-semibold text-[11.5px] rounded-2xl shadow-xs cursor-pointer"
            >
              Save
            </motion.button>
          </div>
        </div>
    </MotionModal>
  );
};
