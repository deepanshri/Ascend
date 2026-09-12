import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Habit, HabitCategory, HabitPriority } from '../types';

interface AddHabitModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddHabit: (habit: Omit<Habit, 'id' | 'days'>) => void;
}

export const AddHabitModal: React.FC<AddHabitModalProps> = ({
  isOpen,
  onClose,
  onAddHabit,
}) => {
  const [name, setName] = useState('');
  const [tag, setTag] = useState<'Work' | 'Self' | null>('Work');
  const [priority, setPriority] = useState<HabitPriority>('mid');
  const [purposeAnchor, setPurposeAnchor] = useState('');
  const [fallbackMicro, setFallbackMicro] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const selectedCategory: HabitCategory = tag ? (tag.toLowerCase() as HabitCategory) : 'self';

    onAddHabit({
      name: name.trim(),
      category: selectedCategory,
      timestamp: 'Daily',
      priority,
      purposeAnchor: purposeAnchor.trim() || `To reinforce my continuous momentum in ${name.trim()}.`,
      identityStatement: `I consistently practice ${name.trim()}.`,
      fallbackMicroHabit: fallbackMicro.trim(), // typing fallback (can be empty string)
      targetDaysPerWeek: 7,
      scheduleType: 'daily',
      tags: tag ? [tag] : [],
      archived: false,
    });

    setName('');
    setPurposeAnchor('');
    setFallbackMicro('');
    setPriority('mid');
    setTag('Work');
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          id="add-habit-modal-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
          onClick={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs"
        >
          <motion.div
            id="add-habit-modal-card"
            initial={{ opacity: 0, scale: 0.92, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 12 }}
            transition={{ type: 'spring', damping: 25, stiffness: 350 }}
            className="relative w-full max-w-[390px] bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-2xl border border-slate-100 dark:border-slate-800 flex flex-col overflow-hidden"
          >
            {/* Modal Header */}
            <div className="flex justify-between items-center pb-3 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h2 className="text-[17px] font-bold text-slate-900 dark:text-white leading-tight">Create Habit</h2>
                <p className="text-[11.5px] text-slate-500 dark:text-slate-400">Add purpose, fallback & tags</p>
              </div>
              <motion.button
                type="button"
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.88 }}
                onClick={onClose}
                aria-label="Close"
                className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white transition cursor-pointer"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </motion.button>
            </div>

            <form onSubmit={handleSubmit} className="mt-4 space-y-3.5 text-[13px]">
              {/* Habit Name */}
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1 text-[12px]">Habit Name</label>
                <input
                  type="text"
                  placeholder="e.g. Strength Training, Deep Reading"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 focus:bg-white dark:focus:bg-slate-800 focus:outline-emerald-500 dark:focus:outline-blue-500 text-slate-900 dark:text-white text-[12.5px] transition-colors"
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

              {/* Tags (replaces category with Work / Self) */}
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1 text-[12px]">
                  Tag <span className="text-slate-400 font-normal">(Option: Work / Self)</span>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <motion.button
                    type="button"
                    whileTap={{ scale: 0.94 }}
                    onClick={() => setTag(tag === 'Work' ? null : 'Work')}
                    className={`py-2 px-3 rounded-xl border text-center transition font-semibold text-[12px] flex items-center justify-center space-x-1.5 cursor-pointer ${
                      tag === 'Work'
                        ? 'border-emerald-500 dark:border-blue-500 bg-emerald-50 dark:bg-blue-950 text-emerald-900 dark:text-blue-200 font-bold shadow-xs'
                        : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700'
                    }`}
                  >
                    <span>💼</span>
                    <span>Work</span>
                  </motion.button>

                  <motion.button
                    type="button"
                    whileTap={{ scale: 0.94 }}
                    onClick={() => setTag(tag === 'Self' ? null : 'Self')}
                    className={`py-2 px-3 rounded-xl border text-center transition font-semibold text-[12px] flex items-center justify-center space-x-1.5 cursor-pointer ${
                      tag === 'Self'
                        ? 'border-emerald-500 dark:border-blue-500 bg-emerald-50 dark:bg-blue-950 text-emerald-900 dark:text-blue-200 font-bold shadow-xs'
                        : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700'
                    }`}
                  >
                    <span>🌱</span>
                    <span>Self</span>
                  </motion.button>
                </div>
              </div>

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
                  className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 focus:bg-white dark:focus:bg-slate-800 text-slate-900 dark:text-white text-[12.5px] transition-colors"
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
                  className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 focus:bg-white dark:focus:bg-slate-800 text-slate-900 dark:text-white text-[12.5px] transition-colors"
                />
                <p className="text-[10.5px] text-slate-400 mt-1">
                  Triggered automatically when swiping left on the habit card.
                </p>
              </div>

              {/* Actions */}
              <div className="pt-2 flex space-x-2.5">
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.95 }}
                  onClick={onClose}
                  className="flex-1 py-2.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold rounded-2xl hover:bg-slate-200 dark:hover:bg-slate-700 transition cursor-pointer"
                >
                  Cancel
                </motion.button>
                <motion.button
                  type="submit"
                  whileTap={{ scale: 0.95 }}
                  className="flex-1 py-2.5 bg-[#23C15D] hover:bg-emerald-600 dark:bg-blue-600 dark:hover:bg-blue-500 text-white font-semibold rounded-2xl shadow-md transition cursor-pointer"
                >
                  Create Habit
                </motion.button>
              </div>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
