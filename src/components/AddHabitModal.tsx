import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { MotionModal } from './MotionModal';
import { tapPress } from '../lib/motionPresets';
import { Habit, HabitCategory, HabitPriority, TimeOfDay } from '../types';
import { insertHabitToSupabase, toDbCategory } from '../lib/habitsApi';
import { MAX_ACTIVE_HABITS } from '../lib/protection';
import { MAX_KEYSTONE_HABITS } from '../lib/keystone';
import { normalizeScheduledDays, scheduleTypeFromDays } from '../utils/schedule';
import { WeekdayScheduleChips } from './WeekdayScheduleChips';
import { TimeOfDayToggle } from './TimeOfDayToggle';
import { inferBowlModeFromClock } from '../utils/timeOfDay';

interface AddHabitModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddHabit: (habit: Omit<Habit, 'id' | 'days'>) => Habit | null;
  userId?: string | null;
  isGuest?: boolean;
  activeHabitCount?: number;
  activeKeystoneCount?: number;
}

export const AddHabitModal: React.FC<AddHabitModalProps> = ({
  isOpen,
  onClose,
  onAddHabit,
  userId = null,
  isGuest = true,
  activeHabitCount = 0,
  activeKeystoneCount = 0,
}) => {
  const [name, setName] = useState('');
  const [category, setCategory] = useState<HabitCategory>('work');
  const [priority, setPriority] = useState<HabitPriority>('mid');
  const [purposeAnchor, setPurposeAnchor] = useState('');
  const [fallbackMicro, setFallbackMicro] = useState('');
  const [isKeystone, setIsKeystone] = useState(false);
  const [keystoneWarning, setKeystoneWarning] = useState(false);
  const [scheduledWeekdays, setScheduledWeekdays] = useState<number[]>([]);
  const [timeOfDay, setTimeOfDay] = useState<TimeOfDay>(() => inferBowlModeFromClock());
  const atCap = activeHabitCount >= MAX_ACTIVE_HABITS;
  const keystoneCapReached = activeKeystoneCount >= MAX_KEYSTONE_HABITS;

  useEffect(() => {
    if (!isOpen) return;
    setIsKeystone(false);
    setKeystoneWarning(false);
    setScheduledWeekdays([]);
    setTimeOfDay(inferBowlModeFromClock());
  }, [isOpen]);

  const handleKeystoneToggle = () => {
    if (!isKeystone && keystoneCapReached) {
      setKeystoneWarning(true);
      return;
    }
    setKeystoneWarning(false);
    setIsKeystone((prev) => !prev);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || atCap) return;

    const dbCategory = toDbCategory(category);
    const days = normalizeScheduledDays(scheduledWeekdays);
    const created = onAddHabit({
      name: name.trim(),
      category,
      timestamp: 'Daily',
      priority,
      purposeAnchor: purposeAnchor.trim() || `To reinforce my continuous momentum in ${name.trim()}.`,
      identityStatement: `I consistently practice ${name.trim()}.`,
      fallbackMicroHabit: fallbackMicro.trim(),
      targetDaysPerWeek: days.length,
      scheduleType: scheduleTypeFromDays(days),
      scheduledDays: days,
      tags: [dbCategory],
      archived: false,
      isKeystone: isKeystone && !keystoneCapReached,
      timeOfDay,
    });

    if (!created) return;

    if (!isGuest) {
      void insertHabitToSupabase(userId, created).then((ok) => {
        if (!ok) {
          console.error('Habit was not written to public.habits');
        }
      });
    }

    setName('');
    setPurposeAnchor('');
    setFallbackMicro('');
    setPriority('mid');
    setCategory('work');
    setIsKeystone(false);
    setKeystoneWarning(false);
    setScheduledWeekdays([]);
    setTimeOfDay(inferBowlModeFromClock());
    onClose();
  };

  return (
    <MotionModal
      isOpen={isOpen}
      onClose={onClose}
      overlayId="add-habit-modal-overlay"
      cardId="add-habit-modal-card"
      cardClassName="p-6"
    >
            {/* Modal Header */}
            <div className="flex justify-between items-center pb-3 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h2 className="text-[17px] font-bold text-slate-900 dark:text-white leading-tight">Create Habit</h2>
                <p className="text-[11.5px] text-slate-500 dark:text-slate-400">Add purpose, fallback & category</p>
              </div>
              <motion.button
                type="button"
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.88 }}
                onClick={onClose}
                aria-label="Close"
                className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white transition cursor-pointer"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </motion.button>
            </div>

            <form onSubmit={handleSubmit} className="mt-4 space-y-3.5 text-[13px]">
              {atCap && (
                <div
                  role="alert"
                  className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200/80 dark:border-amber-900 text-[12px] font-semibold text-amber-900 dark:text-amber-200"
                >
                  Maximum limit of 20 active habits reached.
                </div>
              )}
              {/* Habit Name */}
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1 text-[12px]">Habit Name</label>
                <input
                  type="text"
                  placeholder="e.g. Strength Training, Deep Reading"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 focus:bg-white dark:focus:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-[#22C55E]/25 dark:focus:ring-[#3B82F6]/25 focus:border-[#22C55E] dark:focus:border-[#3B82F6] text-slate-900 dark:text-white text-[12.5px] transition-colors"
                />
              </div>

              {/* Priority */}
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1 text-[12px]">
                  Priority
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <motion.button
                    type="button"
                    whileTap={{ scale: 0.94 }}
                    onClick={() => setPriority('high')}
                    className={`py-2 px-2 rounded-xl border text-center transition font-semibold text-[12px] flex items-center justify-center space-x-1.5 cursor-pointer ${
                      priority === 'high'
                        ? 'border-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200 font-bold shadow-xs ring-1 ring-emerald-500'
                        : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700'
                    }`}
                  >
                    <span className="w-2.5 h-2.5 rounded-full bg-[#16a34a] shrink-0" />
                    <span>High</span>
                  </motion.button>

                  <motion.button
                    type="button"
                    whileTap={{ scale: 0.94 }}
                    onClick={() => setPriority('mid')}
                    className={`py-2 px-2 rounded-xl border text-center transition font-semibold text-[12px] flex items-center justify-center space-x-1.5 cursor-pointer ${
                      priority === 'mid'
                        ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-900 dark:text-emerald-200 font-bold shadow-xs ring-1 ring-emerald-400'
                        : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700'
                    }`}
                  >
                    <span className="w-2.5 h-2.5 rounded-full bg-[#86efac] shrink-0" />
                    <span>Mid</span>
                  </motion.button>

                  <motion.button
                    type="button"
                    whileTap={{ scale: 0.94 }}
                    onClick={() => setPriority('low')}
                    className={`py-2 px-2 rounded-xl border text-center transition font-semibold text-[12px] flex items-center justify-center space-x-1.5 cursor-pointer ${
                      priority === 'low'
                        ? 'border-slate-400 bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-slate-100 font-bold shadow-xs ring-1 ring-slate-400'
                        : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700'
                    }`}
                  >
                    <span className="w-2.5 h-2.5 rounded-full bg-[#94a3b8] shrink-0" />
                    <span>Low</span>
                  </motion.button>
                </div>
              </div>

              {/* Category: Work vs Self Improvement */}
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1.5 text-[12px]">
                  Category
                </label>
                <div className="flex rounded-xl bg-slate-100 dark:bg-slate-800 p-1">
                  <button
                    type="button"
                    onClick={() => setCategory('work')}
                    className={`flex-1 py-2 px-3 rounded-xl text-[12px] font-bold transition cursor-pointer ${
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
                    className={`flex-1 py-2 px-3 rounded-xl text-[12px] font-bold transition cursor-pointer ${
                      category === 'self_improvement'
                        ? 'bg-white dark:bg-slate-700 text-[#22C55E] dark:text-[#3B82F6] shadow-sm'
                        : 'text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    Self Improvement
                  </button>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1.5 text-[12px]">
                  Bowl
                </label>
                <TimeOfDayToggle value={timeOfDay} onChange={setTimeOfDay} />
                <p className="text-[10.5px] text-slate-400 mt-1">
                  Completions drop into the morning or night bowl.
                </p>
              </div>

              <WeekdayScheduleChips selected={scheduledWeekdays} onChange={setScheduledWeekdays} />

              {/* Purpose */}
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1 text-[12px]">
                  Purpose <span className="text-slate-400 font-normal">("Why I built this")</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Protect cognitive stamina and energy cycles"
                  value={purposeAnchor}
                  onChange={(e) => setPurposeAnchor(e.target.value)}
                  className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 focus:bg-white dark:focus:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-[#22C55E]/25 dark:focus:ring-[#3B82F6]/25 focus:border-[#22C55E] dark:focus:border-[#3B82F6] text-slate-900 dark:text-white text-[12.5px] transition-colors"
                />
              </div>

              {/* Typing Fallback */}
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1 text-[12px]">
                  Fallback Micro-Habit <span className="text-slate-400 font-normal">(typing fallback)</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. 5 min warmup, read 1 single page"
                  value={fallbackMicro}
                  onChange={(e) => setFallbackMicro(e.target.value)}
                  className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 focus:bg-white dark:focus:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-[#22C55E]/25 dark:focus:ring-[#3B82F6]/25 focus:border-[#22C55E] dark:focus:border-[#3B82F6] text-slate-900 dark:text-white text-[12.5px] transition-colors"
                />
                <p className="text-[10.5px] text-slate-400 mt-1">
                  Triggered automatically when swiping left on the habit card.
                </p>
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <label htmlFor="add-keystone-toggle" className="font-semibold text-slate-700 dark:text-slate-200 text-[12px]">
                    Is Keystone Habit?
                  </label>
                  <button
                    id="add-keystone-toggle"
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
                <p className="text-[10.5px] text-slate-400 mt-1">
                  At most {MAX_KEYSTONE_HABITS} active keystones. These drive correlation on Report.
                </p>
                {keystoneWarning && (
                  <p role="alert" className="mt-1.5 text-[11.5px] font-semibold text-amber-700 dark:text-amber-300">
                    You already have {MAX_KEYSTONE_HABITS} keystone habits. Unflag one before adding another.
                  </p>
                )}
              </div>

              {/* Actions */}
              <div className="pt-2 flex space-x-2.5">
                <motion.button
                  type="button"
                  whileTap={tapPress}
                  onClick={onClose}
                  className="flex-1 py-2.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold rounded-2xl hover:bg-slate-200 dark:hover:bg-slate-700 transition cursor-pointer"
                >
                  Cancel
                </motion.button>
                <motion.button
                  type="submit"
                  disabled={atCap}
                  whileTap={atCap ? undefined : tapPress}
                  className={`flex-1 py-2.5 font-semibold rounded-2xl shadow-md transition ${
                    atCap
                      ? 'bg-slate-200 dark:bg-slate-700 text-slate-400 dark:text-slate-500 cursor-not-allowed'
                      : 'bg-[#22C55E] hover:bg-emerald-600 dark:bg-[#3B82F6] dark:hover:bg-blue-500 text-white cursor-pointer'
                  }`}
                >
                  {atCap ? 'Limit reached' : 'Create Habit'}
                </motion.button>
              </div>
            </form>
    </MotionModal>
  );
};
