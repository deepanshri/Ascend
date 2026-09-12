import React, { useState } from 'react';

interface DailyCheckInBannerProps {
  selectedDay: number;
  isAllCompleted: boolean;
  completionCount: number;
  totalHabits: number;
  onToggleAllForDay: (dayIndex: number) => void;
}

export const DailyCheckInBanner: React.FC<DailyCheckInBannerProps> = ({
  selectedDay,
  isAllCompleted,
  completionCount,
  totalHabits,
  onToggleAllForDay,
}) => {
  const [justToggled, setJustToggled] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);

  const dayIndex = selectedDay - 1;

  const handleClick = () => {
    onToggleAllForDay(dayIndex);
    setJustToggled(true);

    if (!isAllCompleted) {
      setFeedbackMessage(`Day ${selectedDay} fully verified! All habits completed.`);
    } else {
      setFeedbackMessage(`Day ${selectedDay} check-in reverted to pending.`);
    }

    setTimeout(() => {
      setJustToggled(false);
    }, 400);

    setTimeout(() => {
      setFeedbackMessage(null);
    }, 3200);
  };

  // Hotlinked visual asset images for the check-in badge
  const pendingAssetImg =
    'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=120&q=80';
  const completedAssetImg =
    'https://images.unsplash.com/photo-1550684848-fac1c5b4e853?auto=format&fit=crop&w=120&q=80';

  return (
    <div className="relative w-full">
      {/* Toast Feedback Notification */}
      {feedbackMessage && (
        <div
          id="checkin-feedback-toast"
          role="status"
          aria-live="polite"
          className="absolute -top-10 left-1/2 -translate-x-1/2 z-30 px-3.5 py-1.5 rounded-full text-[11.5px] font-bold tracking-tight shadow-xl transition-all duration-300 flex items-center space-x-1.5 whitespace-nowrap animate-in fade-in slide-in-from-top-2 bg-white dark:bg-slate-900 text-slate-900 dark:text-white border-2 border-[#23C15D] dark:border-blue-500"
        >
          <span className="text-[#23C15D] dark:text-blue-400 font-bold">{isAllCompleted ? '↩' : '✓'}</span>
          <span>{feedbackMessage}</span>
        </div>
      )}

      {/* Main Interactive Check-in Card */}
      <section
        id="interactive-checkin-section"
        className={`neumorphic-card rounded-2xl p-3 px-3.5 flex items-center justify-between transition-all duration-300 select-none ${
          isAllCompleted
            ? 'bg-emerald-50/60 dark:bg-blue-950/40 border border-emerald-200/90 dark:border-blue-800 shadow-sm'
            : 'bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 hover:border-emerald-300 dark:hover:border-blue-400'
        }`}
      >
        {/* Left Side: Hotlinked Visual Asset & Day Status */}
        <div className="flex items-center space-x-3">
          <div className="relative">
            <img
              id="checkin-badge-img"
              src={isAllCompleted ? completedAssetImg : pendingAssetImg}
              alt={isAllCompleted ? 'Completed Day Badge' : 'Active Day Gem'}
              referrerPolicy="no-referrer"
              className={`w-10 h-10 rounded-xl object-cover shadow-xs transition-all duration-300 ${
                isAllCompleted
                  ? 'ring-2 ring-[#23C15D] dark:ring-blue-500 brightness-105 scale-105'
                  : 'ring-1 ring-slate-200 dark:ring-slate-700 opacity-90'
              }`}
            />
            {isAllCompleted && (
              <span className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-[#23C15D] dark:bg-blue-600 text-white text-[9px] flex items-center justify-center font-bold shadow-xs">
                ✓
              </span>
            )}
          </div>

          <div className="flex flex-col">
            <div className="flex items-center space-x-1.5">
              <h2 className="text-[13px] font-bold text-slate-900 dark:text-white leading-tight">
                Day {selectedDay} Check-in
              </h2>
              <span
                className={`w-2 h-2 rounded-full ${
                  isAllCompleted
                    ? 'bg-[#23C15D] dark:bg-blue-500 animate-pulse'
                    : 'bg-slate-300 dark:bg-slate-600'
                }`}
              />
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
              {isAllCompleted ? (
                <span className="text-emerald-700 dark:text-blue-400 font-semibold">
                  All {totalHabits} habits logged today
                </span>
              ) : (
                <span>
                  {completionCount} of {totalHabits} habits completed
                </span>
              )}
            </p>
          </div>
        </div>

        {/* Right Side: Interactive Action Button that visibly changes text and color */}
        <button
          id="interactive-checkin-btn"
          type="button"
          onClick={handleClick}
          aria-pressed={isAllCompleted}
          aria-label={
            isAllCompleted
              ? `Undo Day ${selectedDay} check-in`
              : `Complete all habits for Day ${selectedDay}`
          }
          className={`px-3.5 py-2 rounded-xl text-[12px] font-bold tracking-tight transition-all duration-200 cursor-pointer flex items-center space-x-1.5 active:scale-90 focus:outline-none focus:ring-2 focus:ring-emerald-400 dark:focus:ring-blue-400 ${
            justToggled ? 'scale-95' : ''
          } ${
            isAllCompleted
              ? 'bg-[#23C15D] dark:bg-blue-600 text-white border-2 border-[#23C15D] dark:border-blue-600 shadow-md shadow-emerald-500/25 dark:shadow-blue-500/25 hover:bg-emerald-600 dark:hover:bg-blue-500 hover:border-emerald-600 dark:hover:border-blue-500'
              : 'bg-white dark:bg-slate-800 text-emerald-800 dark:text-blue-300 border-2 border-[#23C15D] dark:border-blue-500 shadow-xs hover:bg-emerald-50/80 dark:hover:bg-blue-950/50 hover:shadow-sm'
          }`}
        >
          {isAllCompleted ? (
            <>
              <svg
                className="w-4 h-4 stroke-[3] text-white animate-in zoom-in-50 duration-150"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M4.5 12.75l6 6 9-13.5"
                />
              </svg>
              <span>Checked In!</span>
            </>
          ) : (
            <>
              <svg
                className="w-3.5 h-3.5 fill-emerald-600 dark:fill-blue-400 text-emerald-600 dark:text-blue-400"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z"
                  clipRule="evenodd"
                />
              </svg>
              <span>Quick Check-in</span>
            </>
          )}
        </button>
      </section>
    </div>
  );
};
