import React from 'react';

interface OnboardingViewProps {
  onComplete: () => void;
}

export const OnboardingView: React.FC<OnboardingViewProps> = ({ onComplete }) => {
  return (
    <div
      id="onboarding-screen"
      className="relative flex flex-col justify-between h-full px-6 pt-[max(2rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))] text-slate-900 dark:text-white bg-[#F8FAF9] dark:bg-slate-950 select-none overflow-y-auto overscroll-y-contain"
    >
      <div className="absolute top-0 right-0 w-80 h-80 bg-emerald-100/60 dark:bg-blue-900/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-72 h-72 bg-emerald-100/40 dark:bg-blue-950/20 rounded-full blur-3xl pointer-events-none" />

      <div className="relative z-10">
        <div className="flex items-center justify-between">
          <span className="text-[12px] font-bold text-emerald-800 dark:text-blue-400 tracking-wider uppercase">
            Ascend Onboarding
          </span>
          <div className="h-1.5 w-6 rounded-full bg-emerald-600 dark:bg-blue-500" />
        </div>
      </div>

      <div className="relative z-10 my-auto py-6 max-w-sm mx-auto w-full">
        <div className="space-y-5 animate-in fade-in slide-in-from-right-4 duration-200">
          <div className="w-12 h-12 rounded-2xl bg-emerald-100/80 dark:bg-blue-950/80 border border-emerald-200 dark:border-blue-800 flex items-center justify-center text-2xl shadow-xs">
            🛡️
          </div>

          <div>
            <h2 className="text-[22px] font-black tracking-tight text-slate-900 dark:text-white leading-snug">
              The Continuous Momentum Philosophy
            </h2>
            <p className="text-[13px] text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed">
              Traditional trackers shame you with zero resets. Ascend replaces guilt with a continuous <strong>Momentum Engine (0–100)</strong>.
            </p>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200/90 dark:border-slate-800 shadow-sm space-y-3">
            <div className="p-2.5 rounded-xl bg-slate-100/80 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-[12px]">
              <div className="flex items-center justify-between font-bold text-slate-800 dark:text-slate-300">
                <span>❌ All-or-Nothing Trackers</span>
                <span>1 Miss = Reset to 0</span>
              </div>
              <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-1">
                Triggers the <em>Abstinence Violation Effect</em> (&quot;I missed one day, might as well quit&quot;).
              </p>
            </div>

            <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-blue-950/60 border border-emerald-200 dark:border-blue-800 text-[12px]">
              <div className="flex items-center justify-between font-bold text-emerald-900 dark:text-blue-300">
                <span>✅ Ascend Momentum</span>
                <span>Non-Zero Saves</span>
              </div>
              <p className="text-[11px] text-emerald-800/90 dark:text-blue-200/90 mt-1">
                Missed a day? Momentum decays by 12%, never to zero.
                Exhausted? Execute your <strong>Fallback Micro-Habit</strong> for 50% credit.
              </p>
            </div>
          </div>

          <div className="p-3 bg-slate-100/80 dark:bg-slate-800/80 rounded-2xl text-[11.5px] text-slate-600 dark:text-slate-300 flex items-start space-x-2">
            <span className="text-base leading-none">🌱</span>
            <p>
              <strong>Never zero:</strong> Every action casts a vote for your identity. Identity votes never expire or reset.
            </p>
          </div>

          <button
            type="button"
            id="onboarding-finish-btn"
            onClick={onComplete}
            className="w-full py-3 bg-[#23C15D] dark:bg-blue-600 text-white rounded-xl font-bold text-[13.5px] shadow-sm hover:bg-emerald-600 dark:hover:bg-blue-500 active:scale-[0.99] transition cursor-pointer"
          >
            Enter Ascend →
          </button>
        </div>
      </div>

      <div className="relative z-10 text-center text-[11px] text-slate-400">
        Add your first habit from Home with the + button. Notifications are requested when the app opens.
      </div>
    </div>
  );
};
