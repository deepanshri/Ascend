import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { useKeyboardInset } from '../hooks/useKeyboardInset';
import { bottomSheetMotion, overlayFade } from '../lib/motionPresets';
import { askTodaysRep, TodaysRepResult } from '../services/todaysRep';

const CHIPS = ['5 easy arrays, 20 min', 'Beginner full-body workout', '1 medium problem, 30 min'] as const;

const STAGES = ['Understanding', 'Searching', 'Reading sources', 'Building plan'] as const;

type Phase = 'ask' | 'progress' | 'plan' | 'error';

interface TodaysRepSheetProps {
  habitId: string;
  habitName: string;
  onClose: () => void;
}

export const TodaysRepSheet: React.FC<TodaysRepSheetProps> = ({ habitId, habitName, onClose }) => {
  const keyboardInset = useKeyboardInset(true);
  const [draft, setDraft] = useState('');
  const [phase, setPhase] = useState<Phase>('ask');
  const [stage, setStage] = useState(0);
  const [result, setResult] = useState<TodaysRepResult | null>(null);
  const [checked, setChecked] = useState<boolean[]>([]);
  const requestId = useRef(0);

  useEffect(() => {
    return () => {
      requestId.current += 1;
    };
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    if (phase !== 'progress') return;
    const timer = window.setInterval(() => {
      setStage((current) => Math.min(current + 1, STAGES.length - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [phase]);

  const send = async () => {
    const request = draft.trim();
    if (!request || phase === 'progress') return;
    const id = requestId.current + 1;
    requestId.current = id;
    setStage(0);
    setPhase('progress');
    try {
      const next = await askTodaysRep({ habitId, habitName, request });
      if (requestId.current !== id) return;
      setResult(next);
      setPhase('plan');
    } catch {
      if (requestId.current !== id) return;
      setPhase('error');
    }
  };

  const toggleTask = (index: number) => {
    setChecked((current) => {
      const next = current.slice();
      next[index] = !next[index];
      return next;
    });
  };

  const loading = phase === 'progress';
  const sendDisabled = draft.trim().length === 0 || loading;

  return createPortal(
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-900/40 dark:bg-slate-950/60 backdrop-blur-xs transform-gpu"
        initial={overlayFade.initial}
        animate={overlayFade.animate}
        exit={overlayFade.exit}
        transition={overlayFade.transition}
        onClick={onClose}
        role="presentation"
      >
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-labelledby="todays-rep-title"
          initial={bottomSheetMotion.initial}
          animate={bottomSheetMotion.animate}
          exit={bottomSheetMotion.exit}
          transition={bottomSheetMotion.transition}
          onClick={(event) => event.stopPropagation()}
          className="w-full max-w-[390px] max-h-[min(740px,100dvh)] overflow-y-auto overscroll-y-contain rounded-t-2xl bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800 shadow-2xl p-5"
          style={{
            marginBottom: keyboardInset,
            paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))',
          }}
        >
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
            <h2 id="todays-rep-title" className="text-[16.5px] font-bold text-slate-900 dark:text-white">
              Today's Rep
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="w-7 h-7 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 dark:text-slate-400 cursor-pointer"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {phase === 'ask' && (
            <div className="mt-3.5 space-y-3">
              <input
                type="text"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="Ask for today's plan, e.g. 5 easy array problems, 20 min"
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white text-[13px] focus:outline-none focus:ring-2 focus:ring-[#22C55E]/25 dark:focus:ring-[#3B82F6]/25"
              />
              <div className="flex flex-wrap gap-2">
                {CHIPS.map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => setDraft(chip)}
                    className="px-2.5 py-1.5 rounded-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-[11.5px] font-semibold cursor-pointer"
                  >
                    {chip}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => void send()}
                disabled={sendDisabled}
                className="w-full py-2.5 rounded-2xl bg-[#22C55E] hover:bg-emerald-600 dark:bg-[#3B82F6] dark:hover:bg-blue-500 text-white font-semibold text-[13px] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Send
              </button>
            </div>
          )}

          {phase === 'progress' && (
            <div className="mt-4" aria-live="polite">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Building today's plan
              </p>
              <p className="mt-2 text-[15px] font-bold text-slate-900 dark:text-white">{STAGES[stage]}</p>
            </div>
          )}

          {phase === 'plan' && result && (
            <div className="mt-3.5 space-y-3">
              <span
                className={`inline-flex px-2 py-1 rounded-lg text-[11px] font-bold ${
                  result.searched_live
                    ? 'bg-emerald-50 text-emerald-800 dark:bg-blue-950/50 dark:text-blue-200'
                    : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                }`}
              >
                {result.searched_live ? 'Searched live' : 'Not verified with live sources'}
              </span>
              <p className="text-[12.5px] text-slate-600 dark:text-slate-300">{result.why_this_plan}</p>
              <ul className="space-y-2">
                {result.tasks.map((task, index) => (
                  <li
                    key={`${task.title}-${index}`}
                    className="flex items-start gap-2.5 rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2"
                  >
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={Boolean(checked[index])}
                      aria-label={task.title}
                      onClick={() => toggleTask(index)}
                      className={`mt-0.5 w-4 h-4 shrink-0 rounded border flex items-center justify-center cursor-pointer ${
                        checked[index]
                          ? 'bg-[#22C55E] border-[#22C55E] dark:bg-[#3B82F6] dark:border-[#3B82F6]'
                          : 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-600'
                      }`}
                    >
                      {checked[index] ? (
                        <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
                        </svg>
                      ) : null}
                    </button>
                    <div className="min-w-0">
                      <p className="text-[13px] font-semibold text-slate-900 dark:text-white">{task.title}</p>
                      {(task.difficulty != null || task.est_minutes != null) && (
                        <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                          {task.difficulty != null ? task.difficulty : ''}
                          {task.difficulty != null && task.est_minutes != null ? ' · ' : ''}
                          {task.est_minutes != null ? `${task.est_minutes} min` : ''}
                        </p>
                      )}
                      {result.searched_live && task.source_url ? (
                        <a
                          href={task.source_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-1 inline-block text-[11.5px] font-semibold text-emerald-700 dark:text-blue-300 underline break-all"
                        >
                          {task.source_url}
                        </a>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {phase === 'error' && (
            <div className="mt-4 space-y-3">
              <p className="text-[13px] font-semibold text-slate-800 dark:text-slate-100">
                Couldn't build a plan. Try again.
              </p>
              <button
                type="button"
                onClick={() => void send()}
                className="w-full py-2.5 rounded-2xl bg-[#22C55E] hover:bg-emerald-600 dark:bg-[#3B82F6] dark:hover:bg-blue-500 text-white font-semibold text-[13px] cursor-pointer"
              >
                Retry
              </button>
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
};

export default TodaysRepSheet;
