import { useEffect } from 'react';
import { useBowlActions } from '../providers/BowlProvider';
import { useUI } from '../providers/UIProvider';

/** The bowl counts as scrolled away once it is this close to the top of Home. */
const OFFSCREEN_MARGIN_PX = 20;
/** Retry delay when Home has not rendered the bowl frame yet. */
const RETRY_MS = 150;

/** Track whether Home's bowl is scrolled out of view (flights then aim at the floating mini bowl). */
export function useBowlVisibility(): void {
  const { activeTab, viewResetKey } = useUI();
  const { setBowlOffscreen } = useBowlActions();
  const homeActive = activeTab === 'home';

  useEffect(() => {
    if (!homeActive) {
      setBowlOffscreen(false);
      return;
    }
    const check = () => {
      const frame = document.getElementById('accumulation-bowl-frame');
      const root = document.getElementById('app-main-content');
      if (!frame || !root) return;
      setBowlOffscreen(frame.getBoundingClientRect().bottom <= root.getBoundingClientRect().top + OFFSCREEN_MARGIN_PX);
    };
    const frame = document.getElementById('accumulation-bowl-frame');
    const root = document.getElementById('app-main-content');
    if (!frame || !root) {
      const timer = window.setTimeout(check, RETRY_MS);
      return () => window.clearTimeout(timer);
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return;
        const top = entry.rootBounds ? entry.rootBounds.top + OFFSCREEN_MARGIN_PX : 60;
        setBowlOffscreen(!entry.isIntersecting && entry.boundingClientRect.bottom <= top);
      },
      { root, threshold: [0, 0.1] }
    );
    observer.observe(frame);
    check();
    return () => observer.disconnect();
  }, [homeActive, viewResetKey, setBowlOffscreen]);
}
