import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion, type PanInfo } from 'motion/react';
import { ChevronLeft, ChevronRight, Check, X } from 'lucide-react';
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
  const [activePage, setActivePage] = useState<1 | 2 | 3>(1);
  const [direction, setDirection] = useState<1 | -1>(1);
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
    setActivePage(1);
    setDirection(1);
  }, [isOpen, todayIso]);

  const handleSave = async () => {
    const trimmedPhase1 = phase1.trim();
    const trimmedPhase2 = phase2.trim();
    const trimmedPhase3 = phase3.trim();
    const entry: ChronicleEntry = {
      isoDate: todayIso,
      phase1: trimmedPhase1,
      phase2: trimmedPhase2,
      phase3: trimmedPhase3,
      updatedAt: new Date().toISOString(),
    };
    void saveChronicleEntry(todayIso, trimmedPhase1, trimmedPhase2, trimmedPhase3);
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

  const goNextPage = () => {
    if (activePage < 3) {
      setDirection(1);
      setActivePage((prev) => (prev + 1) as 1 | 2 | 3);
    } else {
      handleSave();
    }
  };

  const goPrevPage = () => {
    if (activePage > 1) {
      setDirection(-1);
      setActivePage((prev) => (prev - 1) as 1 | 2 | 3);
    }
  };

  const handleDragEnd = (_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    const deltaX = info.offset.x;
    const velocityX = info.velocity.x;
    const SWIPE_PX = 40;
    if (deltaX < -SWIPE_PX || velocityX < -200) {
      goNextPage();
    } else if (deltaX > SWIPE_PX || velocityX > 200) {
      goPrevPage();
    }
  };

  const pageVariants = {
    enter: (dir: number) => ({
      x: dir > 0 ? 60 : -60,
      opacity: 0,
    }),
    center: {
      x: 0,
      opacity: 1,
    },
    exit: (dir: number) => ({
      x: dir < 0 ? 60 : -60,
      opacity: 0,
    }),
  };

  return (
    <MotionModal
      isOpen={isOpen}
      onClose={onClose}
      overlayId="chronicle-modal-overlay"
      cardId="chronicle-modal-card"
      cardClassName="p-5 max-w-lg h-[90dvh] flex flex-col overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3 shrink-0">
        <div>
          <div className="flex items-center gap-1.5 text-emerald-600 dark:text-blue-400 font-bold text-[11px] uppercase tracking-wider">
            <span aria-hidden="true">📖</span>
            <span>Daily Chronicle</span>
          </div>
          <h2 className="mt-0.5 text-[18px] font-black text-slate-900 dark:text-white">
            3-Phase Intentional Chronicle
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
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* 3-Step Pill Progress Bar */}
      <div className="mt-3.5 flex items-center justify-between gap-1.5 px-0.5 shrink-0">
        {[
          { page: 1, label: 'Page 1 · Done' },
          { page: 2, label: 'Page 2 · Unfinished' },
          { page: 3, label: 'Page 3 · Strategy' },
        ].map((item) => {
          const isActive = activePage === item.page;
          const isDone = activePage > item.page;
          return (
            <button
              key={item.page}
              type="button"
              onClick={() => {
                setDirection(item.page > activePage ? 1 : -1);
                setActivePage(item.page as 1 | 2 | 3);
              }}
              className={`flex-1 py-1 px-2 rounded-lg text-[10.5px] font-bold transition cursor-pointer border ${
                isActive
                  ? 'bg-emerald-50 dark:bg-blue-950/80 text-emerald-800 dark:text-blue-300 border-emerald-400/80 dark:border-blue-500'
                  : isDone
                  ? 'bg-slate-100 dark:bg-slate-800/80 text-emerald-700 dark:text-blue-400 border-transparent'
                  : 'bg-slate-50 dark:bg-slate-900/60 text-slate-400 dark:text-slate-500 border-transparent'
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </div>

      {/* Paginated Content Area */}
      <div className="mt-3.5 relative flex-1 min-h-0 flex flex-col">
        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={activePage}
            custom={direction}
            variants={pageVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            drag="x"
            dragDirectionLock
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.2}
            onDragEnd={handleDragEnd}
            layout={false}
            className="touch-pan-y gpu-layer flex-1 min-h-0 flex flex-col"
          >
            {activePage === 1 && (
              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 p-4 bg-slate-50/70 dark:bg-slate-900/60 flex-1 min-h-0 flex flex-col space-y-3">
                <div className="flex items-center justify-between shrink-0">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-blue-400">
                    Phase 1 · Accomplishments
                  </span>
                  <span className="text-[10px] font-medium text-slate-400">Page 1 of 3</span>
                </div>

                <label
                  htmlFor="chronicle-phase1"
                  className="block text-[14px] font-bold text-slate-900 dark:text-white leading-snug shrink-0"
                >
                  What all you did today
                </label>

                {yesterdayPlan && !phase1.trim() && (
                  <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-blue-950/60 border border-emerald-200 dark:border-blue-800 flex items-center justify-between gap-2 shrink-0">
                    <span className="text-[11px] text-emerald-900 dark:text-blue-200 truncate italic">
                      &ldquo;{yesterdayPlan}&rdquo;
                    </span>
                    <button
                      type="button"
                      onClick={handleApplyYesterdayPlanToFocus}
                      className="text-[10.5px] font-bold text-emerald-700 dark:text-blue-300 shrink-0 hover:underline cursor-pointer"
                    >
                      Use →
                    </button>
                  </div>
                )}

                <textarea
                  id="chronicle-phase1"
                  value={phase1}
                  onChange={(e) => setPhase1(e.target.value)}
                  placeholder=""
                  className="w-full flex-1 min-h-[200px] p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-medium resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            )}

            {activePage === 2 && (
              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 p-4 bg-slate-50/70 dark:bg-slate-900/60 flex-1 min-h-0 flex flex-col space-y-3">
                <div className="flex items-center justify-between shrink-0">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">
                    Phase 2 · Reflection
                  </span>
                  <span className="text-[10px] font-medium text-slate-400">Page 2 of 3</span>
                </div>

                <label
                  htmlFor="chronicle-phase2"
                  className="block text-[14px] font-bold text-slate-900 dark:text-white leading-snug shrink-0"
                >
                  No problem, there will be some you couldn&apos;t complete and what are they
                </label>

                <textarea
                  id="chronicle-phase2"
                  value={phase2}
                  onChange={(e) => setPhase2(e.target.value)}
                  placeholder=""
                  className="w-full flex-1 min-h-[200px] p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-medium resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            )}

            {activePage === 3 && (
              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 p-4 bg-slate-50/70 dark:bg-slate-900/60 flex-1 min-h-0 flex flex-col space-y-3">
                <div className="flex items-center justify-between shrink-0">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-purple-700 dark:text-purple-400">
                    Phase 3 · Tomorrow&apos;s Plan
                  </span>
                  <span className="text-[10px] font-medium text-slate-400">Page 3 of 3</span>
                </div>

                <label
                  htmlFor="chronicle-phase3"
                  className="block text-[14px] font-bold text-slate-900 dark:text-white leading-snug shrink-0"
                >
                  To save time, Prepare the strategy now
                </label>

                <textarea
                  id="chronicle-phase3"
                  value={phase3}
                  onChange={(e) => setPhase3(e.target.value)}
                  placeholder=""
                  className="w-full flex-1 min-h-[120px] p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-medium resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Navigation & Action Controls */}
      <div className="mt-4 flex items-center justify-between gap-3 pt-3 border-t border-slate-100 dark:border-slate-800 shrink-0">
        {/* Prev Chevron Button */}
        <motion.button
          type="button"
          whileTap={tapPress}
          onClick={goPrevPage}
          disabled={activePage === 1}
          className={`px-3 py-2 rounded-xl text-[12px] font-bold flex items-center gap-1 transition cursor-pointer ${
            activePage === 1
              ? 'opacity-40 cursor-not-allowed text-slate-400 bg-slate-100 dark:bg-slate-800'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700'
          }`}
        >
          <ChevronLeft className="w-4 h-4" />
          <span>Prev</span>
        </motion.button>

        {/* Center Dots */}
        <div className="flex items-center space-x-1.5">
          {[1, 2, 3].map((p) => (
            <span
              key={p}
              className={`block rounded-full transition-all duration-300 ${
                activePage === p
                  ? 'w-5 h-2 bg-emerald-600 dark:bg-blue-500'
                  : 'w-2 h-2 bg-slate-300 dark:bg-slate-700'
              }`}
            />
          ))}
        </div>

        {/* Next / Save Chevron Button */}
        <motion.button
          type="button"
          whileTap={tapPress}
          onClick={activePage === 3 ? handleSave : goNextPage}
          className={`px-3.5 py-2 rounded-xl text-[12px] font-bold flex items-center gap-1 transition shadow-xs cursor-pointer ${
            activePage === 3
              ? 'bg-[#23C15D] dark:bg-blue-600 text-white hover:bg-emerald-600 dark:hover:bg-blue-500'
              : 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-white'
          }`}
        >
          {activePage === 3 ? (
            <>
              {isSavedRecently ? 'Saved ✓' : 'Save Chronicle'}
              <Check className="w-4 h-4 ml-0.5" />
            </>
          ) : (
            <>
              <span>Next</span>
              <ChevronRight className="w-4 h-4" />
            </>
          )}
        </motion.button>
      </div>
    </MotionModal>
  );
};
