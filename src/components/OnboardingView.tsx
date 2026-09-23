import React, { useState, useCallback, useRef } from 'react';

export interface OnboardingViewProps {
  onComplete?: () => void;
  isOpen?: boolean;
  onClose?: () => void;
  onStepChange?: (step: 1 | 2 | 3) => void;
}

/** Memoized Step 1 Slide: Habit Tracking & Gestures */
const SlideOne = React.memo<{ onNext: () => void }>(({ onNext }) => (
  <div className="onboarding-slide px-1">
    <div className="space-y-4 max-w-sm mx-auto w-full">
      <div className="w-12 h-12 rounded-2xl bg-emerald-100/80 dark:bg-blue-950/80 border border-emerald-200 dark:border-blue-800 flex items-center justify-center text-2xl shadow-xs">
        🎯
      </div>

      <div>
        <div className="text-[11px] font-bold text-emerald-700 dark:text-blue-400 uppercase tracking-wider">
          Step 1 of 3
        </div>
        <h2 className="text-[21px] font-black tracking-tight text-slate-900 dark:text-white leading-snug mt-0.5">
          Identity-Based Habit Tracking
        </h2>
        <p className="text-[12.5px] text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
          Swipe gestures engineered for psychological ease rather than all-or-nothing friction.
        </p>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-2xl p-3.5 border border-slate-200/90 dark:border-slate-800 shadow-sm space-y-2.5">
        <div className="p-2.5 rounded-xl bg-emerald-50/80 dark:bg-blue-950/50 border border-emerald-200 dark:border-blue-800 text-[12px] flex items-start space-x-2.5">
          <span className="text-base leading-none mt-0.5">👉</span>
          <div>
            <div className="font-bold text-emerald-900 dark:text-blue-200">Swipe Right · 100% Full Execution</div>
            <div className="text-[11px] text-emerald-800/80 dark:text-blue-300/80 mt-0.5">
              Standard completion. Drops a vibrant primary marble into the bowl and awards maximum momentum.
            </div>
          </div>
        </div>

        <div className="p-2.5 rounded-xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-[12px] flex items-start space-x-2.5">
          <span className="text-base leading-none mt-0.5">👈</span>
          <div>
            <div className="font-bold text-amber-900 dark:text-amber-200">Swipe Left · 50% Fallback Micro-Habit</div>
            <div className="text-[11px] text-amber-800/80 dark:text-amber-300/80 mt-0.5">
              Exhausted or short on time? Execute a 2-minute fallback to protect your daily identity vote.
            </div>
          </div>
        </div>

        <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 text-[12px] flex items-start space-x-2.5">
          <span className="text-base leading-none mt-0.5">👆</span>
          <div>
            <div className="font-bold text-slate-800 dark:text-slate-200">Single Tap · Flip Card</div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              Tap any habit card to flip it and read your personal Purpose Anchor statement.
            </div>
          </div>
        </div>
      </div>

      <button
        type="button"
        id="onboarding-step1-next"
        onClick={onNext}
        className="w-full py-3 bg-[#23C15D] dark:bg-blue-600 text-white rounded-xl font-bold text-[13.5px] shadow-sm hover:bg-emerald-600 dark:hover:bg-blue-500 active:scale-[0.99] transition cursor-pointer"
      >
        Continue to Step 2 →
      </button>
    </div>
  </div>
));
SlideOne.displayName = 'SlideOne';

/** Memoized Step 2 Slide: Momentum Engine & Decay */
const SlideTwo = React.memo<{ onBack: () => void; onNext: () => void }>(({ onBack, onNext }) => (
  <div className="onboarding-slide px-1">
    <div className="space-y-4 max-w-sm mx-auto w-full">
      <div className="w-12 h-12 rounded-2xl bg-emerald-100/80 dark:bg-blue-950/80 border border-emerald-200 dark:border-blue-800 flex items-center justify-center text-2xl shadow-xs">
        🛡️
      </div>

      <div>
        <div className="text-[11px] font-bold text-emerald-700 dark:text-blue-400 uppercase tracking-wider">
          Step 2 of 3
        </div>
        <h2 className="text-[21px] font-black tracking-tight text-slate-900 dark:text-white leading-snug mt-0.5">
          The Continuous Momentum Philosophy
        </h2>
        <p className="text-[12.5px] text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
          Traditional trackers shame you with zero resets. Ascend replaces guilt with a continuous <strong>Momentum Engine (0–100)</strong>.
        </p>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-2xl p-3.5 border border-slate-200/90 dark:border-slate-800 shadow-sm space-y-2.5">
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
            Missed a day? Momentum decays gently, never to zero.
            Exhausted? Execute your <strong>Fallback Micro-Habit</strong> for 50% credit.
          </p>
        </div>

        <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-800/50 text-[11px] text-slate-600 dark:text-slate-300 flex items-center space-x-2">
          <span className="text-sm">🌱</span>
          <span><strong>Monotonic Evidence:</strong> Completed identity votes never expire or reset.</span>
        </div>
      </div>

      <div className="flex space-x-2.5 pt-1">
        <button
          type="button"
          onClick={onBack}
          className="px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-[12.5px] hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer"
        >
          ← Back
        </button>
        <button
          type="button"
          id="onboarding-step2-next"
          onClick={onNext}
          className="flex-1 py-2.5 bg-[#23C15D] dark:bg-blue-600 text-white rounded-xl font-bold text-[12.5px] shadow-sm hover:bg-emerald-600 dark:hover:bg-blue-500 cursor-pointer"
        >
          Next: 3D Bowl &amp; App →
        </button>
      </div>
    </div>
  </div>
));
SlideTwo.displayName = 'SlideTwo';

/** Memoized Step 3 Slide: 3D Visualization & APK Download */
const SlideThree = React.memo<{
  onBack: () => void;
  onFinish: () => void;
  downloadStatus: 'idle' | 'downloading' | 'downloaded';
  onDownloadApk: () => void;
}>(({ onBack, onFinish, downloadStatus, onDownloadApk }) => (
  <div className="onboarding-slide px-1">
    <div className="space-y-4 max-w-sm mx-auto w-full">
      <div className="w-12 h-12 rounded-2xl bg-emerald-100/80 dark:bg-blue-950/80 border border-emerald-200 dark:border-blue-800 flex items-center justify-center text-2xl shadow-xs">
        🔮
      </div>

      <div>
        <div className="text-[11px] font-bold text-emerald-700 dark:text-blue-400 uppercase tracking-wider">
          Step 3 of 3
        </div>
        <h2 className="text-[21px] font-black tracking-tight text-slate-900 dark:text-white leading-snug mt-0.5">
          3D Bowl &amp; Native Experience
        </h2>
        <p className="text-[12.5px] text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
          Watch completions stack physically inside your 3D glass bowl. Install the native Android app for the best experience.
        </p>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-2xl p-3.5 border border-slate-200/90 dark:border-slate-800 shadow-sm space-y-2.5">
        <div className="p-2.5 rounded-xl bg-emerald-50/70 dark:bg-blue-950/40 border border-emerald-200 dark:border-blue-800 text-[12px] flex items-start space-x-2.5">
          <span className="text-base leading-none mt-0.5">🏺</span>
          <div>
            <div className="font-bold text-emerald-900 dark:text-blue-200">3D Glass Accumulation Bowl</div>
            <div className="text-[11px] text-emerald-800/80 dark:text-blue-300/80 mt-0.5">
              Marbles stack under physics from the bottom up. Morning bowl shows green gems; Night bowl shows blue gems.
            </div>
          </div>
        </div>

        {/* Native APK Download Card */}
        <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 space-y-2">
          <button
            type="button"
            id="onboarding-download-apk-btn"
            onClick={onDownloadApk}
            className="w-full py-2.5 px-3 rounded-xl bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 font-semibold text-[12.5px] transition cursor-pointer flex items-center justify-between shadow-xs active:scale-[0.99]"
          >
            <div className="flex items-center space-x-2 text-left">
              <span className="text-lg">🤖</span>
              <div>
                <div className="font-bold text-[12px] leading-tight text-slate-900 dark:text-white">
                  Download Android App (.APK)
                </div>
                <div className="text-[10px] text-slate-500 dark:text-slate-400">
                  Direct install with widgets &amp; dual alerts
                </div>
              </div>
            </div>
            <span className="text-[11px] font-bold text-emerald-600 dark:text-blue-400">
              {downloadStatus === 'downloading'
                ? 'Starting...'
                : downloadStatus === 'downloaded'
                ? 'Downloaded ✓'
                : 'Download ↓'}
            </span>
          </button>
        </div>
      </div>

      <div className="space-y-2 pt-1">
        <button
          type="button"
          id="onboarding-finish-btn"
          onClick={onFinish}
          className="w-full py-3 bg-[#23C15D] dark:bg-blue-600 text-white rounded-xl font-bold text-[13.5px] shadow-sm hover:bg-emerald-600 dark:hover:bg-blue-500 active:scale-[0.99] transition cursor-pointer"
        >
          Enter Ascend →
        </button>

        <button
          type="button"
          onClick={onBack}
          className="w-full py-2 text-slate-500 dark:text-slate-400 font-semibold text-[12px] hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
        >
          ← Back to Step 2
        </button>
      </div>
    </div>
  </div>
));
SlideThree.displayName = 'SlideThree';

export const OnboardingView: React.FC<OnboardingViewProps> = ({
  onComplete,
  isOpen = true,
  onClose,
  onStepChange,
}) => {
  const [step, setStepState] = useState<1 | 2 | 3>(1);
  const [downloadStatus, setDownloadStatus] = useState<'idle' | 'downloading' | 'downloaded'>('idle');

  const setStep = useCallback((next: 1 | 2 | 3) => {
    setStepState(next);
    onStepChange?.(next);
  }, [onStepChange]);

  const touchStartXRef = useRef<number | null>(null);
  const touchStartYRef = useRef<number | null>(null);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    if (!touch) return;
    touchStartXRef.current = touch.clientX;
    touchStartYRef.current = touch.clientY;
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (touchStartXRef.current === null || touchStartYRef.current === null) return;
    const touch = e.changedTouches[0];
    if (!touch) return;
    const deltaX = touch.clientX - touchStartXRef.current;
    const deltaY = touch.clientY - touchStartYRef.current;
    touchStartXRef.current = null;
    touchStartYRef.current = null;

    // Minimum swipe threshold & ensure dominant horizontal axis
    if (Math.abs(deltaX) > 42 && Math.abs(deltaX) > Math.abs(deltaY) * 1.25) {
      if (deltaX < 0) {
        // Swipe Left -> Next slide
        setStepState((prev) => {
          const next = (prev === 1 ? 2 : prev === 2 ? 3 : 3) as 1 | 2 | 3;
          onStepChange?.(next);
          return next;
        });
      } else {
        // Swipe Right -> Previous slide
        setStepState((prev) => {
          const next = (prev === 3 ? 2 : prev === 2 ? 1 : 1) as 1 | 2 | 3;
          onStepChange?.(next);
          return next;
        });
      }
    }
  }, [onStepChange]);

  if (!isOpen) return null;

  const handleFinish = () => {
    onComplete?.();
    onClose?.();
  };

  const handleDownloadApk = () => {
    try {
      setDownloadStatus('downloading');
      const link = document.createElement('a');
      link.href = '/ascend-release.apk';
      link.download = 'ascend.apk';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setDownloadStatus('downloaded');
      setTimeout(() => setDownloadStatus('idle'), 3000);
    } catch (err) {
      console.error('Download error:', err);
      window.open('/ascend-release.apk', '_blank');
      setDownloadStatus('idle');
    }
  };

  return (
    <div
      id="onboarding-screen"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      className="relative flex flex-col justify-between h-full px-6 pt-[max(2rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))] text-slate-900 dark:text-white bg-[#F8FAF9] dark:bg-slate-950 select-none overflow-hidden touch-pan-y"
    >
      {/* Background ambient blurs */}
      <div className="absolute top-0 right-0 w-80 h-80 bg-emerald-100/60 dark:bg-blue-900/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-72 h-72 bg-emerald-100/40 dark:bg-blue-950/20 rounded-full blur-3xl pointer-events-none" />

      {/* Top Header & Step Indicator */}
      <div className="relative z-10 shrink-0">
        <div className="flex items-center justify-between">
          <span className="text-[12px] font-bold text-emerald-800 dark:text-blue-400 tracking-wider uppercase">
            Ascend Onboarding
          </span>
          <div className="flex items-center space-x-1.5" role="tablist" aria-label="Onboarding steps">
            {[1, 2, 3].map((s) => (
              <button
                key={s}
                type="button"
                role="tab"
                aria-selected={s === step}
                aria-label={`Step ${s} of 3`}
                onClick={() => setStep(s as 1 | 2 | 3)}
                className={`h-1.5 rounded-full transition-all duration-300 cursor-pointer ${
                  s === step
                    ? 'w-7 bg-emerald-600 dark:bg-blue-500'
                    : s < step
                    ? 'w-2 bg-emerald-400/60 dark:bg-blue-400/60 hover:w-3'
                    : 'w-2 bg-slate-300 dark:bg-slate-700 hover:w-3'
                }`}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Hardware-Accelerated Sliding Track Container */}
      <div className="relative z-10 my-auto py-5 w-full overflow-hidden onboarding-slide-container">
        <div
          className="onboarding-slide-track"
          style={{
            transform: `translate3d(-${(step - 1) * 33.333333}%, 0, 0)`,
            WebkitTransform: `translate3d(-${(step - 1) * 33.333333}%, 0, 0)`,
          }}
        >
          <SlideOne onNext={() => setStep(2)} />
          <SlideTwo onBack={() => setStep(1)} onNext={() => setStep(3)} />
          <SlideThree
            onBack={() => setStep(2)}
            onFinish={handleFinish}
            downloadStatus={downloadStatus}
            onDownloadApk={handleDownloadApk}
          />
        </div>
      </div>

      {/* Bottom Info */}
      <div className="relative z-10 shrink-0 text-center text-[11px] text-slate-400">
        You can customize all habits, cycle lengths, and reminders anytime.
      </div>
    </div>
  );
};
