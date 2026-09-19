import React from 'react';

/** Brand-compliant suspense fallback for lazy tab views (green/blue via CSS vars). */
export const TabLoadingFallback: React.FC = () => (
  <div
    className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-canvas"
    role="status"
    aria-live="polite"
    aria-label="Loading"
  >
    <div className="flex items-center gap-1.5" aria-hidden>
      <span className="h-2 w-2 rounded-full bg-accent animate-pulse [animation-delay:0ms]" />
      <span className="h-2 w-2 rounded-full bg-accent animate-pulse [animation-delay:150ms]" />
      <span className="h-2 w-2 rounded-full bg-accent animate-pulse [animation-delay:300ms]" />
    </div>
    <p className="text-[12px] font-semibold tracking-wide text-ink-muted">Loading…</p>
  </div>
);
