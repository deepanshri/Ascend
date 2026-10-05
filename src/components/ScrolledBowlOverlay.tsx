import React from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowUp } from 'lucide-react';

export interface ScrolledBowlOverlayProps {
  isVisible: boolean;
  votes: number;
  capacity: number;
  fillPercent?: number;
  hasActiveFlight?: boolean;
  isPulsing?: boolean;
  identityStatement?: string | null;
  onScrollToTop: () => void;
}

export const ScrolledBowlOverlay: React.FC<ScrolledBowlOverlayProps> = ({
  isVisible,
  votes,
  capacity,
  fillPercent = 0,
  hasActiveFlight = false,
  isPulsing = false,
  identityStatement,
  onScrollToTop,
}) => {
  const roundedFill = Math.round(fillPercent);
  const [showIdentityVote, setShowIdentityVote] = React.useState(false);

  React.useEffect(() => {
    if (!isPulsing || !identityStatement) return;
    setShowIdentityVote(true);
    const timer = window.setTimeout(() => setShowIdentityVote(false), 1200);
    return () => window.clearTimeout(timer);
  }, [isPulsing, identityStatement]);

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          id="scrolled-bowl-overlay"
          role="button"
          tabIndex={0}
          aria-label={`Scroll back to top. 3D bowl is ${votes} of ${capacity} votes (${roundedFill} percent full)`}
          title="Tap to scroll back to 3D bowl"
          onClick={onScrollToTop}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onScrollToTop();
            }
          }}
          initial={{ opacity: 0, y: -20, scale: 0.92 }}
          animate={{
            opacity: 1,
            y: 0,
            scale: isPulsing ? 1.06 : 1,
            boxShadow: isPulsing
              ? '0 10px 25px -3px rgba(35, 193, 93, 0.35), 0 4px 6px -4px rgba(35, 193, 93, 0.2)'
              : '0 10px 20px -5px rgba(0, 0, 0, 0.08), 0 4px 6px -2px rgba(0, 0, 0, 0.04)',
          }}
          exit={{ opacity: 0, y: -16, scale: 0.94 }}
          transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
          whileTap={{ scale: 0.94 }}
          whileHover={{ scale: 1.02 }}
          className="fixed right-4 z-40 flex items-center gap-2.5 px-3 py-1.5 rounded-2xl bg-white/50 dark:bg-slate-900/50 backdrop-blur-md border border-white/20 dark:border-white/10 shadow-lg cursor-pointer select-none transition-colors hover:bg-white/65 dark:hover:bg-slate-900/65 active:bg-white/75 dark:active:bg-slate-900/75 group"
          style={{
            top: 'max(1rem, env(safe-area-inset-top, 1rem))',
          }}
        >
          {/* Target aperture for 3D marble flight trajectory */}
          <div
            id="scrolled-bowl-target"
            className="relative flex items-center justify-center w-7 h-7 rounded-xl bg-emerald-500/15 dark:bg-emerald-400/20 border border-emerald-500/30 dark:border-emerald-400/30 transition-all duration-300"
          >
            {/* Miniature Bowl Icon Silhouette */}
            <svg
              className="w-4 h-4 text-emerald-600 dark:text-emerald-400 transition-transform group-hover:scale-110"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M4 11h16a8 8 0 0 1-8 8 8 8 0 0 1-8-8z" />
              <path d="M4 11a4 4 0 0 1 8-2 4 4 0 0 1 8 2" opacity="0.4" />
            </svg>

            {/* Ripple ring on active flight / marble landing */}
            {(hasActiveFlight || isPulsing) && (
              <span className="absolute inset-0 rounded-xl bg-emerald-400/30 animate-ping pointer-events-none" />
            )}
          </div>

          {/* Progress / Votes details */}
          <div className="flex flex-col text-left leading-tight min-w-0 max-w-[160px]">
            {showIdentityVote && identityStatement ? (
              <>
                <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 truncate">
                  +1 Vote!
                </span>
                <span className="text-[9px] font-medium text-slate-600 dark:text-slate-300 italic truncate">
                  &ldquo;{identityStatement}&rdquo;
                </span>
              </>
            ) : (
              <>
                <span className="text-[11px] font-bold tabular-nums text-slate-800 dark:text-slate-100 flex items-center gap-1">
                  {votes}/{capacity}
                  <span className="text-[9px] font-medium text-slate-500 dark:text-slate-400">
                    ({roundedFill}%)
                  </span>
                </span>
                <span className="text-[9px] font-medium text-emerald-600 dark:text-emerald-400">
                  Bowl active
                </span>
              </>
            )}
          </div>

          {/* Quick scroll-to-top cue */}
          <div className="flex items-center justify-center w-5 h-5 rounded-full bg-slate-200/50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 transition-transform group-hover:-translate-y-0.5">
            <ArrowUp className="w-3 h-3" />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
