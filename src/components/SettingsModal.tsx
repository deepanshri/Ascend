import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  USER_INTERESTS_STORAGE_KEY,
  getStoredUserInterests,
  normalizeCategoryKey,
} from '../utils/quotes';

export interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedInterests?: string[];
  onToggleInterest?: (interest: string) => void;
  onInterestsChange?: (interests: string[]) => void;
}

export const ALL_INTEREST_CATEGORIES: { name: string; icon: string; key: string }[] = [
  { name: 'Fitness & Gym', icon: '💪', key: 'Fitness/Gym' },
  { name: 'Coding & Tech', icon: '💻', key: 'Coding/Tech' },
  { name: 'Focus & Mindset', icon: '🧠', key: 'Focus/Mindset' },
  { name: 'Motion Design', icon: '✨', key: 'Motion Design' },
  { name: 'Language Learning', icon: '🗣️', key: 'Language Learning' },
  { name: 'Running', icon: '🏃', key: 'Running' },
  { name: 'Books', icon: '📚', key: 'Books' },
  { name: 'Movies', icon: '🎬', key: 'Movies' },
  { name: 'Anime', icon: '⚔️', key: 'Anime' },
  { name: 'Music', icon: '🎵', key: 'Music' },
  { name: 'Gaming', icon: '🎮', key: 'Gaming' },
];

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  selectedInterests: propSelectedInterests,
  onToggleInterest,
  onInterestsChange,
}) => {
  const [localInterests, setLocalInterests] = useState<string[]>(() =>
    Array.isArray(propSelectedInterests) ? propSelectedInterests : getStoredUserInterests()
  );

  useEffect(() => {
    if (Array.isArray(propSelectedInterests)) {
      setLocalInterests(propSelectedInterests);
    }
  }, [propSelectedInterests]);

  const activeInterests = Array.isArray(propSelectedInterests)
    ? propSelectedInterests
    : localInterests;

  const isSelected = (item: { name: string; key: string }) => {
    const itemKey = normalizeCategoryKey(item.key);
    return activeInterests.some((active) => {
      const activeKey = normalizeCategoryKey(active);
      return activeKey === itemKey || active.toLowerCase() === item.key.toLowerCase() || active.toLowerCase() === item.name.toLowerCase();
    });
  };

  const handleToggle = (item: { name: string; key: string }) => {
    const targetTag = item.key;
    if (onToggleInterest) {
      onToggleInterest(targetTag);
    } else {
      const exists = isSelected(item);
      const next = exists
        ? activeInterests.filter((a) => normalizeCategoryKey(a) !== normalizeCategoryKey(targetTag))
        : [...activeInterests, targetTag];
      setLocalInterests(next);
      try {
        localStorage.setItem(USER_INTERESTS_STORAGE_KEY, JSON.stringify(next));
      } catch {}
      onInterestsChange?.(next);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs select-none">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          className="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4 max-h-[90vh] flex flex-col"
        >
          {/* Header */}
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                Interest &amp; Wisdom Topics
              </h2>
              <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-0.5">
                Quotes from unchecked topics will never appear on your home screen.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              ✕
            </button>
          </div>

          {/* Tags list */}
          <div className="flex-1 overflow-y-auto space-y-2 py-1 pr-1">
            <div className="grid grid-cols-2 gap-2">
              {ALL_INTEREST_CATEGORIES.map((item) => {
                const selected = isSelected(item);
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => handleToggle(item)}
                    className={`flex items-center space-x-2 p-2.5 rounded-xl border text-left text-[12.5px] font-medium transition cursor-pointer active:scale-95 ${
                      selected
                        ? 'bg-emerald-50 dark:bg-blue-950/60 text-emerald-950 dark:text-blue-200 border-emerald-500/60 dark:border-blue-500/60 shadow-xs'
                        : 'bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-400 border-slate-200/80 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    <span className="text-base">{item.icon}</span>
                    <span className="flex-1 truncate">{item.name}</span>
                    {selected && (
                      <span className="text-emerald-700 dark:text-blue-400 font-bold text-xs">
                        ✓
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {activeInterests.length === 0 && (
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-center text-[11px] text-slate-500 dark:text-slate-400 mt-2">
                🌱 All topics unchecked. Defaulting to universal discipline and atomic habits wisdom.
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="w-full py-2.5 rounded-xl bg-emerald-600 dark:bg-blue-600 text-white font-bold text-[13px] shadow-sm hover:bg-emerald-700 dark:hover:bg-blue-500 cursor-pointer"
            >
              Done
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
