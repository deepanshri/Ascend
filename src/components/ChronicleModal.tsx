import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { MotionModal } from './MotionModal';
import { tapPress } from '../lib/motionPresets';
import {
  type ChronicleEntry,
  getChronicleEntry,
  getYesterdayPlanForToday,
  saveChronicleEntry,
} from '../lib/chronicle';
import { formatEvidenceDate } from '../utils/dates';

export interface ChronicleModalProps {
  isOpen: boolean;
  todayIso: string;
  onClose: () => void;
  onSave?: (entry: ChronicleEntry) => void;
}

export const ChronicleModal: React.FC<ChronicleModalProps> = ({
  isOpen,
  todayIso,
  onClose,
  onSave,
}) => {
  const [phase1, setPhase1] = useState('');
  const [phase2, setPhase2] = useState('');
  const [phase3, setPhase3] = useState('');
  const [yesterdayPlan, setYesterdayPlan] = useState<string | null>(null);
  const [isSavedRecently, setIsSavedRecently] = useState(false);

  // Sync state whenever modal opens or todayIso changes
  useEffect(() => {
    if (!isOpen) return;
    const existing = getChronicleEntry(todayIso);
    setPhase1(existing?.phase1 ?? '');
    setPhase2(existing?.phase2 ?? '');
    setPhase3(existing?.phase3 ?? '');
    setYesterdayPlan(getYesterdayPlanForToday());
    setIsSavedRecently(false);
  }, [isOpen, todayIso]);

  const handleSave = () => {
    const entry: ChronicleEntry = {
      isoDate: todayIso,
      phase1: phase1.trim(),
      phase2: phase2.trim(),
      phase3: phase3.trim(),
      updatedAt: new Date().toISOString(),
    };
    saveChronicleEntry(entry);
    onSave?.(entry);
    setIsSavedRecently(true);
    setTimeout(() => {
      onClose();
    }, 280);
  };

  const handleApplyYesterdayPlanToFocus = () => {
    if (!yesterdayPlan) return;
    setPhase1(yesterdayPlan);
  };

  return (
    <MotionModal
      isOpen={isOpen}
      onClose={onClose}
      overlayId="chronicle-modal-overlay"
      cardId="chronicle-modal-card"
      cardClassName="p-5 max-w-[420px]"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
        <div>
          <div className="flex items-center gap-1.5 text-emerald-600 dark:text-blue-400 font-bold text-[11px] uppercase tracking-wider">
            <span aria-hidden="true">📖</span>
            <span>Daily Chronicle</span>
          </div>
          <h2 className="mt-0.5 text-[18px] font-black text-slate-900 dark:text-white">
            3-Phase Intentional Journal
          </h2>
          <p className="text-[11.5px] text-slate-500 dark:text-slate-400 mt-0.5">
            {formatEvidenceDate(new Date())}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close chronicle"
          className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer text-sm"
        >
          ✕
        </button>
      </div>

      {/* Yesterday's Plan Anchor (if present) */}
      {yesterdayPlan && (
        <div className="mt-3.5 p-3 rounded-xl bg-emerald-50/80 dark:bg-blue-950/40 border border-emerald-200/90 dark:border-blue-800/80">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-800 dark:text-blue-300">
              <span>🎯</span>
              <span>Yesterday&apos;s Plan For Today</span>
            </div>
            {!phase1.trim() && (
              <button
                type="button"
                onClick={handleApplyYesterdayPlanToFocus}
                className="text-[10.5px] font-bold text-emerald-700 dark:text-blue-400 hover:underline cursor-pointer"
              >
                Use as Focus →
              </button>
            )}
          </div>
          <p className="mt-1 text-[12px] font-semibold text-slate-800 dark:text-slate-100 italic">
            &ldquo;{yesterdayPlan}&rdquo;
          </p>
        </div>
      )}

      {/* 3-Phase Entry Form */}
      <div className="mt-4 space-y-4 max-h-[55vh] overflow-y-auto pr-1">
        {/* Phase 1 */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-3 bg-slate-50/60 dark:bg-slate-900/50 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-blue-400">
              Phase 1 · Morning Focus
            </span>
          </div>
          <label htmlFor="chronicle-phase1" className="block text-[12.5px] font-bold text-slate-900 dark:text-white">
            What&apos;s your primary focus today?
          </label>
          <textarea
            id="chronicle-phase1"
            rows={2}
            value={phase1}
            onChange={(e) => setPhase1(e.target.value)}
            placeholder="e.g. Deep work on feature design, stay patient and present"
            className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-[12.5px] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 dark:focus:border-blue-500 resize-none"
          />
        </div>

        {/* Phase 2 */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-3 bg-slate-50/60 dark:bg-slate-900/50 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">
              Phase 2 · Daily Reflection
            </span>
          </div>
          <label htmlFor="chronicle-phase2" className="block text-[12.5px] font-bold text-slate-900 dark:text-white">
            Enter what all you did today
          </label>
          <textarea
            id="chronicle-phase2"
            rows={2}
            value={phase2}
            onChange={(e) => setPhase2(e.target.value)}
            placeholder="e.g. Shipped the modal updates, went for a 20m walk, read 15 pages"
            className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-[12.5px] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 dark:focus:border-blue-500 resize-none"
          />
        </div>

        {/* Phase 3 */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-3 bg-slate-50/60 dark:bg-slate-900/50 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-purple-700 dark:text-purple-400">
              Phase 3 · Tomorrow&apos;s Strategy
            </span>
          </div>
          <label htmlFor="chronicle-phase3" className="block text-[12.5px] font-bold text-slate-900 dark:text-white">
            Plan your strategy for tomorrow
          </label>
          <textarea
            id="chronicle-phase3"
            rows={2}
            value={phase3}
            onChange={(e) => setPhase3(e.target.value)}
            placeholder="e.g. Put gym clothes out, start with a 30m review at 8:30am"
            className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-[12.5px] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 dark:focus:border-blue-500 resize-none"
          />
          <p className="text-[10px] text-slate-400 dark:text-slate-500 italic">
            This will appear as &ldquo;See the plan of today by you&rdquo; tomorrow morning.
          </p>
        </div>
      </div>

      {/* Actions */}
      <div className="mt-4 flex gap-2.5 pt-2 border-t border-slate-100 dark:border-slate-800">
        <motion.button
          type="button"
          whileTap={tapPress}
          onClick={onClose}
          className="flex-1 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold text-[12.5px] cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-700 transition"
        >
          Cancel
        </motion.button>
        <motion.button
          type="button"
          whileTap={tapPress}
          onClick={handleSave}
          className="flex-1 py-2.5 rounded-xl bg-[#23C15D] dark:bg-blue-600 text-white font-bold text-[12.5px] shadow-sm hover:bg-emerald-600 dark:hover:bg-blue-500 active:scale-[0.99] transition cursor-pointer"
        >
          {isSavedRecently ? 'Saved ✓' : 'Save Chronicle'}
        </motion.button>
      </div>
    </MotionModal>
  );
};
