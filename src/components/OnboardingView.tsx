import React, { useState } from 'react';
import { Habit, HabitCategory } from '../types';

interface OnboardingViewProps {
  onComplete: (firstHabit?: Habit) => void;
}

export const OnboardingView: React.FC<OnboardingViewProps> = ({ onComplete }) => {
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Step 2 state: Core habit and purpose anchor
  const [habitName, setHabitName] = useState('Deep Work & Flow');
  const [identityStatement, setIdentityStatement] = useState('I am a focused builder');
  const [purposeAnchor, setPurposeAnchor] = useState(
    'To build meaningful creations with clarity instead of constant reactivity.'
  );
  const [fallbackMicroHabit, setFallbackMicroHabit] = useState(
    'Sit at desk, open editor, and write 1 line.'
  );
  const [category, setCategory] = useState<HabitCategory>('work');

  // Step 3 state: Notifications
  const [notificationGranted, setNotificationGranted] = useState<boolean | null>(null);

  const requestNotificationPermission = async () => {
    if ('Notification' in window) {
      try {
        const perm = await Notification.requestPermission();
        setNotificationGranted(perm === 'granted');
      } catch {
        setNotificationGranted(false);
      }
    } else {
      setNotificationGranted(false);
    }
  };

  const handleFinish = () => {
    const firstHabit: Habit = {
      id: 'habit-onboarding-' + Date.now(),
      name: habitName.trim() || 'Core Routine',
      category,
      timestamp: '08:30 AM',
      days: [false, false, false, false, false, false, false],
      microDays: [false, false, false, false, false, false, false],
      fallbackMicroHabit: fallbackMicroHabit.trim() || '2-minute minimum action',
      purposeAnchor: purposeAnchor.trim() || 'To align daily actions with who I want to become.',
      identityStatement: identityStatement.trim() || 'I am consistent and self-directed.',
      targetDaysPerWeek: 5,
      scheduleType: 'daily',
    };

    onComplete(firstHabit);
  };

  return (
    <div
      id="onboarding-screen"
      className="relative flex flex-col justify-between min-h-screen px-6 pt-[max(2rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))] text-slate-900 dark:text-white bg-[#F8FAF9] dark:bg-slate-950 select-none overflow-y-auto"
    >
      {/* Background ambient accents */}
      <div className="absolute top-0 right-0 w-80 h-80 bg-emerald-100/60 dark:bg-blue-900/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-72 h-72 bg-emerald-100/40 dark:bg-blue-950/20 rounded-full blur-3xl pointer-events-none" />

      {/* Top Header & Step Indicator */}
      <div className="relative z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span className="text-[12px] font-bold text-emerald-800 dark:text-blue-400 tracking-wider uppercase">
              Ascend Onboarding
            </span>
          </div>
          <div className="flex items-center space-x-1.5">
            {[1, 2, 3].map((s) => (
              <div
                key={s}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  s === step
                    ? 'w-6 bg-emerald-600 dark:bg-blue-500'
                    : s < step
                    ? 'w-2.5 bg-emerald-400 dark:bg-blue-400'
                    : 'w-2 bg-slate-200 dark:bg-slate-800'
                }`}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Main Content by Step */}
      <div className="relative z-10 my-auto py-6 max-w-sm mx-auto w-full">
        {step === 1 && (
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

            {/* Comparison Visual Card */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200/90 dark:border-slate-800 shadow-sm space-y-3">
              {/* Traditional Trackers */}
              <div className="p-2.5 rounded-xl bg-slate-100/80 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-[12px]">
                <div className="flex items-center justify-between font-bold text-slate-800 dark:text-slate-300">
                  <span>❌ All-or-Nothing Trackers</span>
                  <span>1 Miss = Reset to 0</span>
                </div>
                <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-1">
                  Triggers the <em>Abstinence Violation Effect</em> (&quot;I missed one day, might as well quit&quot;).
                </p>
              </div>

              {/* Ascend Momentum */}
              <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-blue-950/60 border border-emerald-200 dark:border-blue-800 text-[12px]">
                <div className="flex items-center justify-between font-bold text-emerald-900 dark:text-blue-300">
                  <span>✅ Ascend Momentum</span>
                  <span>Non-Zero Saves</span>
                </div>
                <p className="text-[11px] text-emerald-800/90 dark:text-blue-200/90 mt-1">
                  Missed a day? Momentum decays gently by ~5%, never to zero.
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
              id="onboarding-step1-next"
              onClick={() => setStep(2)}
              className="w-full py-3 bg-[#23C15D] dark:bg-blue-600 text-white rounded-xl font-bold text-[13.5px] shadow-sm hover:bg-emerald-600 dark:hover:bg-blue-500 active:scale-[0.99] transition cursor-pointer"
            >
              Continue to Step 2 →
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-200">
            <div className="w-12 h-12 rounded-2xl bg-emerald-100/80 dark:bg-blue-950/80 border border-emerald-200 dark:border-blue-800 flex items-center justify-center text-2xl shadow-xs">
              ⚓
            </div>

            <div>
              <h2 className="text-[22px] font-black tracking-tight text-slate-900 dark:text-white leading-snug">
                Your First Purpose Anchor
              </h2>
              <p className="text-[13px] text-slate-500 dark:text-slate-400 mt-1">
                Attach this habit to who you choose to be, and set a safety fallback.
              </p>
            </div>

            <div className="space-y-3 bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200/90 dark:border-slate-800 shadow-sm">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                  Core Habit Name
                </label>
                <input
                  type="text"
                  value={habitName}
                  onChange={(e) => setHabitName(e.target.value)}
                  placeholder="e.g. Daily Reflection / 20m Workout"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-[13px] text-slate-900 dark:text-white focus:bg-white dark:focus:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                  Identity Statement
                </label>
                <input
                  type="text"
                  value={identityStatement}
                  onChange={(e) => setIdentityStatement(e.target.value)}
                  placeholder="e.g. I am a focused creator"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-[13px] text-slate-900 dark:text-white focus:bg-white dark:focus:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                  Purpose Anchor (&quot;Why is this important?&quot;)
                </label>
                <textarea
                  rows={2}
                  value={purposeAnchor}
                  onChange={(e) => setPurposeAnchor(e.target.value)}
                  placeholder="Double-tap any habit card later to see this reminder."
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-[12px] text-slate-900 dark:text-white focus:bg-white dark:focus:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:focus:ring-blue-500 resize-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-emerald-800 dark:text-blue-400 uppercase tracking-wider mb-1">
                  Fallback Micro-Habit (50% Momentum Save)
                </label>
                <input
                  type="text"
                  value={fallbackMicroHabit}
                  onChange={(e) => setFallbackMicroHabit(e.target.value)}
                  placeholder="e.g. Read 2 pages / 1 minute breathing"
                  className="w-full px-3 py-2 bg-emerald-50/50 dark:bg-blue-950/40 border border-emerald-200 dark:border-blue-800 rounded-xl text-[12px] text-slate-900 dark:text-white focus:bg-white dark:focus:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="flex space-x-2 pt-1">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-[12.5px] hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer"
              >
                ← Back
              </button>
              <button
                type="button"
                id="onboarding-step2-next"
                onClick={() => setStep(3)}
                className="flex-1 py-2.5 bg-[#23C15D] dark:bg-blue-600 text-white rounded-xl font-bold text-[12.5px] shadow-sm hover:bg-emerald-600 dark:hover:bg-blue-500 cursor-pointer"
              >
                Next: Reminders →
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-5 animate-in fade-in slide-in-from-right-4 duration-200">
            <div className="w-12 h-12 rounded-2xl bg-emerald-100/80 dark:bg-blue-950/80 border border-emerald-200 dark:border-blue-800 flex items-center justify-center text-2xl shadow-xs">
              ⏰
            </div>

            <div>
              <h2 className="text-[22px] font-black tracking-tight text-slate-900 dark:text-white leading-snug">
                Dual-Trigger Reminders
              </h2>
              <p className="text-[13px] text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed">
                Ascend prepares you <strong>10 minutes before</strong> to wrap up current tasks, then triggers an exact-time alert when it’s go-time.
              </p>
            </div>

            {/* Notification preview */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200/90 dark:border-slate-800 shadow-sm space-y-3">
              <div className="p-2.5 rounded-xl bg-emerald-50/50 dark:bg-blue-950/40 border border-emerald-200/70 dark:border-blue-800/70 text-[12px] flex items-center space-x-2">
                <span className="text-base">⏰</span>
                <div>
                  <div className="font-bold text-emerald-900 dark:text-blue-300">10m Transition Alert</div>
                  <div className="text-[11px] text-emerald-800 dark:text-blue-400">Clear your desk and prepare your mindset.</div>
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-emerald-50/80 dark:bg-blue-950/80 border border-emerald-200 dark:border-blue-800 text-[12px] flex items-center space-x-2">
                <span className="text-base">🔔</span>
                <div>
                  <div className="font-bold text-emerald-900 dark:text-blue-300">Due Now Alert</div>
                  <div className="text-[11px] text-emerald-800 dark:text-blue-400">Execute your routine or fallback micro-habit.</div>
                </div>
              </div>

              {notificationGranted !== null && (
                <div
                  className={`p-2 rounded-xl text-[11.5px] font-semibold text-center ${
                    notificationGranted
                      ? 'bg-emerald-100 dark:bg-blue-950 text-emerald-900 dark:text-blue-300 border border-emerald-300 dark:border-blue-800'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {notificationGranted
                    ? '✓ OS Notifications Enabled!'
                    : 'Notifications skipped or not supported.'}
                </div>
              )}
            </div>

            <div className="space-y-2 pt-1">
              <button
                type="button"
                id="onboarding-allow-notifications"
                onClick={requestNotificationPermission}
                className="w-full py-3 bg-[#23C15D] dark:bg-blue-600 hover:bg-emerald-600 dark:hover:bg-blue-500 text-white rounded-xl font-bold text-[13px] shadow-sm active:scale-[0.99] transition cursor-pointer flex items-center justify-center space-x-2"
              >
                <span>🔔</span>
                <span>Enable Dual-Trigger Notifications</span>
              </button>

              <button
                type="button"
                id="onboarding-finish-btn"
                onClick={handleFinish}
                className="w-full py-2.5 bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 dark:hover:bg-slate-700 text-white rounded-xl font-bold text-[13px] transition cursor-pointer"
              >
                Enter Ascend Dashboard →
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Bottom info */}
      <div className="relative z-10 text-center text-[11px] text-slate-400">
        You can customize all settings, categories, and reminders anytime.
      </div>
    </div>
  );
};
