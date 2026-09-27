import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import type { FrictionAudit, Habit } from '../types';
import type { EveningJournalEntry } from '../lib/eveningJournal';
import { FRICTION_REASON_CHIPS } from '../lib/frictionAudit';
import { isHabitScheduledOnDayIndex } from '../utils/schedule';
import { MotionModal } from './MotionModal';
import { tapPress } from '../lib/motionPresets';

interface EveningJournalModalProps {
  isOpen: boolean;
  habits: Habit[];
  todayIndex: number;
  todayIso: string;
  frictionAudits: FrictionAudit[];
  onClose: () => void;
  onComplete: (entry: EveningJournalEntry) => void;
}

export const EveningJournalModal: React.FC<EveningJournalModalProps> = ({
  isOpen,
  habits,
  todayIndex,
  todayIso,
  frictionAudits,
  onClose,
  onComplete,
}) => {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [tomorrowAction, setTomorrowAction] = useState('');
  const [linkedHabitId, setLinkedHabitId] = useState('');

  const scheduled = useMemo(
    () => habits.filter((habit) => isHabitScheduledOnDayIndex(habit, todayIndex)),
    [habits, todayIndex]
  );
  const completed = useMemo(() => scheduled.filter((habit) => Boolean(habit.days?.[todayIndex])), [scheduled, todayIndex]);
  const missed = useMemo(
    () => scheduled.filter((habit) => !habit.days?.[todayIndex]),
    [scheduled, todayIndex]
  );
  const existingReasons = useMemo(() => {
    const result: Record<string, string> = {};
    frictionAudits.forEach((audit) => {
      if (audit.loggedDate !== todayIso || !audit.habitId) return;
      const reason = (audit.reason || audit.note || '').trim();
      if (reason) result[audit.habitId] = reason;
    });
    return result;
  }, [frictionAudits, todayIso]);

  useEffect(() => {
    if (!isOpen) return;
    setStep(1);
    setReasons(existingReasons);
    setTomorrowAction('');
    setLinkedHabitId('');
  }, [isOpen, todayIso, existingReasons]);

  const finish = () => {
    const entry: EveningJournalEntry = {
      date: todayIso,
      completedAt: Date.now(),
      completedHabitIds: completed.map((habit) => habit.id),
      missedReasons: Object.fromEntries(
        missed.map((habit) => [habit.id, (reasons[habit.id] || '').trim()]).filter(([, reason]) => Boolean(reason))
      ),
      tomorrowAction: tomorrowAction.trim(),
      linkedHabitId: linkedHabitId || undefined,
    };
    onComplete(entry);
  };

  return (
    <MotionModal
      isOpen={isOpen}
      onClose={onClose}
      overlayId="evening-journal-overlay"
      cardId="evening-journal-card"
      cardClassName="p-5 max-w-[360px]"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-1.5 text-accent font-bold text-[11px] uppercase tracking-wider">
            <span aria-hidden="true">☾</span>
            <span>Evening Journal</span>
          </div>
          <h2 className="mt-1 text-[18px] font-bold text-slate-900 dark:text-white">
            {step === 1 ? 'What moved forward?' : step === 2 ? 'What got in the way?' : 'Make tomorrow easier'}
          </h2>
        </div>
        <span className="text-[11px] font-bold text-slate-400">{step} / 3</span>
      </div>

      <div className="mt-3 h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
        <div className="h-full bg-accent transition-all duration-300" style={{ width: `${(step / 3) * 100}%` }} />
      </div>

      {step === 1 && (
        <div className="mt-4 space-y-3">
          <p className="text-[12px] text-slate-500 dark:text-slate-400">Today’s completions are filled from your actual habit log.</p>
          <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 p-3 space-y-2">
            {completed.length > 0 ? completed.map((habit) => (
              <div key={habit.id} className="flex items-center gap-2 text-[12.5px] font-semibold text-slate-800 dark:text-slate-100">
                <span className="w-5 h-5 rounded-full bg-accent text-accent-fg flex items-center justify-center text-[11px]">✓</span>
                <span>{habit.name}</span>
              </div>
            )) : (
              <p className="text-[12px] text-slate-500 dark:text-slate-400">No scheduled habits completed yet. An honest check-in still counts.</p>
            )}
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="mt-4 space-y-3 max-h-[430px] overflow-y-auto pr-0.5">
          {missed.length === 0 ? (
            <div className="rounded-2xl bg-accent-soft border border-accent/40 p-3 text-[12.5px] font-semibold text-ink">Nothing missed today.</div>
          ) : missed.map((habit) => {
            const existing = existingReasons[habit.id];
            return (
              <div key={habit.id} className="rounded-2xl border border-slate-200 dark:border-slate-700 p-3">
                <p className="text-[12.5px] font-bold text-slate-900 dark:text-white">{habit.name}</p>
                {existing ? (
                  <p className="mt-1.5 text-[11.5px] text-slate-500 dark:text-slate-400">Already captured: <span className="font-semibold text-ink">{existing}</span></p>
                ) : (
                  <>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {FRICTION_REASON_CHIPS.map((chip) => (
                        <button
                          key={chip}
                          type="button"
                          onClick={() => setReasons((current) => ({ ...current, [habit.id]: chip }))}
                          className={`px-2 py-1 rounded-lg text-[10.5px] font-bold border transition cursor-pointer ${reasons[habit.id] === chip ? 'bg-accent-soft border-accent text-ink' : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400'}`}
                        >
                          {chip}
                        </button>
                      ))}
                    </div>
                    <input
                      type="text"
                      value={reasons[habit.id] || ''}
                      onChange={(event) => setReasons((current) => ({ ...current, [habit.id]: event.target.value }))}
                      placeholder="Or write a quick reason…"
                      className="mt-2 w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-[12px] text-slate-900 dark:text-white focus:outline-none focus:border-accent"
                    />
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      {step === 3 && (
        <div className="mt-4 space-y-3">
          <label className="block">
            <span className="block text-[12px] font-semibold text-slate-700 dark:text-slate-200 mb-1.5">When I wake up, I will…</span>
            <input
              type="text"
              autoFocus
              value={tomorrowAction}
              onChange={(event) => setTomorrowAction(event.target.value)}
              placeholder="e.g. Put on my running shoes"
              className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-[13px] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent"
            />
          </label>
          <label className="block">
            <span className="block text-[11.5px] font-semibold text-slate-600 dark:text-slate-300 mb-1.5">Tie to a habit <span className="font-normal text-slate-400">(optional)</span></span>
            <select
              value={linkedHabitId}
              onChange={(event) => setLinkedHabitId(event.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-[12px] text-slate-900 dark:text-white focus:outline-none focus:border-accent"
            >
              <option value="">No specific habit</option>
              {habits.map((habit) => <option key={habit.id} value={habit.id}>{habit.name}</option>)}
            </select>
          </label>
          <p className="text-[11px] text-slate-400">Your intention will appear gently in the quote card tomorrow morning.</p>
        </div>
      )}

      <div className="mt-5 flex gap-2.5">
        <motion.button
          type="button"
          whileTap={tapPress}
          onClick={step === 1 ? onClose : () => setStep((current) => (current - 1) as 1 | 2)}
          className="flex-1 py-2.5 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold text-[12.5px] cursor-pointer"
        >
          {step === 1 ? 'Not now' : 'Back'}
        </motion.button>
        <motion.button
          type="button"
          whileTap={tapPress}
          onClick={step === 3 ? finish : () => setStep((current) => (current + 1) as 2 | 3)}
          className="flex-1 py-2.5 rounded-2xl bg-accent text-accent-fg font-bold text-[12.5px] cursor-pointer"
        >
          {step === 3 ? 'Finish Journal' : 'Continue'}
        </motion.button>
      </div>
    </MotionModal>
  );
};
