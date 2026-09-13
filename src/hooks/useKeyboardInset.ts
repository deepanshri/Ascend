import { useEffect, useState } from 'react';

const KEYBOARD_THRESHOLD = 48;

export function measureKeyboardInset(): number {
  if (typeof window === 'undefined' || !window.visualViewport) return 0;
  const vv = window.visualViewport;
  const overlap = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
  return overlap >= KEYBOARD_THRESHOLD ? Math.round(overlap) : 0;
}

function applyKeyboardCssVar(inset: number): void {
  document.documentElement.style.setProperty('--keyboard-inset', `${inset}px`);
}

/** Keeps `--keyboard-inset` in sync so sheets can pad above the native keyboard. */
export function useKeyboardInset(enabled = true): number {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') {
      setInset(0);
      applyKeyboardCssVar(0);
      return;
    }

    const update = () => {
      const next = measureKeyboardInset();
      setInset(next);
      applyKeyboardCssVar(next);
    };

    update();
    const vv = window.visualViewport;
    vv?.addEventListener('resize', update);
    vv?.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    return () => {
      vv?.removeEventListener('resize', update);
      vv?.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    const onFocusIn = (event: FocusEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      if (!/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      window.setTimeout(() => {
        target.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
      }, 90);
    };
    document.addEventListener('focusin', onFocusIn);
    return () => document.removeEventListener('focusin', onFocusIn);
  }, [enabled]);

  return enabled ? inset : 0;
}
