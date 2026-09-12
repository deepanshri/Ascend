import React, { useState } from 'react';
import { IdentityEvidence, HabitCategory } from '../types';

interface IdentityLedgerModalProps {
  isOpen: boolean;
  onClose: () => void;
  evidenceList: IdentityEvidence[];
  onAddVote?: (habitName: string, identityStatement: string, category: HabitCategory) => void;
}

export const IdentityLedgerModal: React.FC<IdentityLedgerModalProps> = ({
  isOpen,
  onClose,
  evidenceList,
  onAddVote,
}) => {
  const [selectedFilter, setSelectedFilter] = useState<string>('all');
  const [newIdentity, setNewIdentity] = useState('');
  const [newHabit, setNewHabit] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  if (!isOpen) return null;

  const filteredEvidence = evidenceList.filter((item) => {
    if (selectedFilter === 'all') return true;
    return item.category === selectedFilter;
  });

  const handleAddManualVote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newIdentity.trim() || !newHabit.trim() || !onAddVote) return;
    onAddVote(newHabit, newIdentity, 'self');
    setNewIdentity('');
    setNewHabit('');
    setIsAdding(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-[390px] max-h-[85vh] bg-white dark:bg-slate-900 rounded-[32px] p-5 shadow-2xl border border-slate-100 dark:border-slate-800 flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex justify-between items-start pb-3 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center space-x-2.5">
            <div className="w-10 h-10 rounded-2xl bg-emerald-50 dark:bg-blue-950/60 border border-emerald-100 dark:border-blue-900 flex items-center justify-center">
              <svg className="w-5 h-5 text-emerald-700 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <rect height="18" rx="2" width="16" x="4" y="3" strokeWidth="2" />
                <path d="M8 7h8M8 11h8M8 15h5" strokeLinecap="round" strokeWidth="2" />
              </svg>
            </div>
            <div>
              <h2 className="text-[18px] font-bold text-slate-900 dark:text-white leading-tight">
                Identity Evidence Ledger
              </h2>
              <p className="text-[12px] text-slate-400 dark:text-slate-400">Atomic Habits Proof System</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close ledger"
            className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 dark:text-slate-300 hover:text-slate-800 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-700 transition cursor-pointer"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Philosophy Quote Box */}
        <div className="mt-3 p-3 bg-emerald-50/60 dark:bg-blue-950/40 rounded-2xl border border-emerald-100/70 dark:border-blue-900 text-[12px] text-emerald-900 dark:text-blue-200 leading-relaxed">
          <span className="font-semibold block mb-0.5">“Every action you take is a vote for who you want to become.”</span>
          <span className="text-emerald-700 dark:text-blue-400 text-[11px]">James Clear, Atomic Habits</span>
        </div>

        {/* Filters */}
        <div className="flex items-center space-x-1.5 py-2.5 overflow-x-auto text-[11px] font-medium text-slate-600">
          {['all', 'work', 'sleep', 'self', 'health'].map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setSelectedFilter(cat)}
              className={`px-3 py-1 rounded-full transition capitalize whitespace-nowrap cursor-pointer ${
                selectedFilter === cat
                  ? 'bg-emerald-700 dark:bg-blue-600 text-white font-semibold'
                  : 'bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Evidence List */}
        <div className="flex-1 overflow-y-auto space-y-2.5 pr-1 py-1">
          {filteredEvidence.length === 0 ? (
            <div className="text-center py-8 text-slate-400 text-[13px]">
              No evidence logged yet. Complete habits to cast votes!
            </div>
          ) : (
            filteredEvidence.map((item) => (
              <div
                key={item.id}
                className="p-3 bg-slate-50/80 dark:bg-slate-800/80 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl border border-slate-100/90 dark:border-slate-700 flex flex-col space-y-1 transition"
              >
                <div className="flex justify-between items-center text-[11px]">
                  <span className="font-bold text-slate-900 dark:text-white">{item.habitName}</span>
                  <span className="px-2 py-0.5 rounded-full text-[9.5px] font-semibold uppercase tracking-wider bg-emerald-100 dark:bg-blue-950 text-emerald-800 dark:text-blue-300">
                    Vote Cast ✓
                  </span>
                </div>
                <p className="text-[12px] text-slate-700 dark:text-slate-300 italic">
                  "{item.identityStatement}"
                </p>
                <span className="text-[10px] text-slate-400 dark:text-slate-500">{item.date}</span>
              </div>
            ))
          )}
        </div>

        {/* Add manual vote toggle */}
        {isAdding ? (
          <form onSubmit={handleAddManualVote} className="mt-3 p-3 bg-slate-100 dark:bg-slate-800 rounded-2xl space-y-2 text-[12px]">
            <input
              type="text"
              placeholder="Action taken (e.g. Read chapter 3)"
              value={newHabit}
              onChange={(e) => setNewHabit(e.target.value)}
              className="w-full px-3 py-1.5 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-white focus:outline-emerald-500 dark:focus:outline-blue-500"
              required
            />
            <input
              type="text"
              placeholder="Identity vote (e.g. I am a lifelong student)"
              value={newIdentity}
              onChange={(e) => setNewIdentity(e.target.value)}
              className="w-full px-3 py-1.5 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-white focus:outline-emerald-500 dark:focus:outline-blue-500"
              required
            />
            <div className="flex space-x-2 justify-end pt-1">
              <button
                type="button"
                onClick={() => setIsAdding(false)}
                className="px-3 py-1 rounded-xl text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-1 bg-emerald-700 dark:bg-blue-600 text-white font-semibold rounded-xl hover:bg-emerald-800 dark:hover:bg-blue-500 cursor-pointer"
              >
                Cast Vote
              </button>
            </div>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setIsAdding(true)}
            className="mt-3 w-full py-2.5 bg-emerald-50 dark:bg-blue-950/50 text-emerald-800 dark:text-blue-300 font-semibold text-[13px] rounded-2xl hover:bg-emerald-100 dark:hover:bg-blue-900/60 transition cursor-pointer flex items-center justify-center space-x-1.5 border border-emerald-200/60 dark:border-blue-800"
          >
            <span>+ Cast Manual Identity Vote</span>
          </button>
        )}
      </div>
    </div>
  );
};
