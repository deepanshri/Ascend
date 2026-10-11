import { useCallback, useEffect, useRef } from 'react';
import { useAnyModalOpen, useKeyboardVisible } from '../hooks/useKeyboardVisible';
import { useBowlActions } from '../providers/BowlProvider';
import { useCalendarActions } from '../providers/CalendarProvider';
import { useUI } from '../providers/UIProvider';
import { toISODate } from '../utils/dates';

/** Scroll distance before the bottom nav hides or returns. */
const SCROLL_HYSTERESIS_PX = 8;
/** The bowl counts as scrolled away once its bottom passes this line. */
const BOWL_OFFSCREEN_TOP_PX = 60;

export interface NavChrome {
  /** Scroll handler for every tab's scroll container. */
  onScroll: (event: React.UIEvent<HTMLElement>) => void;
  /** Show the bottom nav again (e.g. before a tutorial points at it). */
  revealNav: () => void;
}

/**
 * The floating bottom nav hides while scrolling down and returns on scroll up,
 * at the top, and on tab change; it stays hidden while the keyboard or a modal
 * is open. Toggled through a DOM class, never React state, so scrolling never
 * re-renders the habit list.
 */
export function useNavChrome(): NavChrome {
  const isKeyboardOpen = useKeyboardVisible();
  const isAnyModalOpen = useAnyModalOpen();
  const { activeTab } = useUI();
  const { selectDate } = useCalendarActions();
  const { setBowlOffscreen } = useBowlActions();

  const visibleRef = useRef(true);
  const lastScrollYRef = useRef(0);
  const pendingScrollYRef = useRef(0);
  const rafRef = useRef(0);

  const syncNav = useCallback(() => {
    const el = document.getElementById('floating-bottom-nav');
    if (!el) return;
    const show = visibleRef.current && !isKeyboardOpen && !isAnyModalOpen;
    el.classList.toggle('nav-chrome-hidden', !show);
    el.setAttribute('aria-hidden', show ? 'false' : 'true');
  }, [isKeyboardOpen, isAnyModalOpen]);

  useEffect(() => {
    syncNav();
  }, [syncNav]);

  useEffect(() => {
    visibleRef.current = true;
    lastScrollYRef.current = 0;
    syncNav();
    // The report always opens on today.
    if (activeTab === 'report') selectDate(toISODate());
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset on tab change only
  }, [activeTab]);

  const onScroll = useCallback(
    (event: React.UIEvent<HTMLElement>) => {
      pendingScrollYRef.current = event.currentTarget.scrollTop;
      if (rafRef.current) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = 0;
        const scrollY = pendingScrollYRef.current;
        const delta = scrollY - lastScrollYRef.current;
        let nextVisible = visibleRef.current;
        if (scrollY <= SCROLL_HYSTERESIS_PX) nextVisible = true;
        else if (delta > SCROLL_HYSTERESIS_PX) nextVisible = false;
        else if (delta < -SCROLL_HYSTERESIS_PX) nextVisible = true;
        lastScrollYRef.current = scrollY;

        const frame = document.getElementById('accumulation-bowl-frame');
        if (frame) setBowlOffscreen(frame.getBoundingClientRect().bottom <= BOWL_OFFSCREEN_TOP_PX);

        if (nextVisible === visibleRef.current) return;
        visibleRef.current = nextVisible;
        syncNav();
      });
    },
    [syncNav, setBowlOffscreen]
  );

  const revealNav = useCallback(() => {
    visibleRef.current = true;
    syncNav();
  }, [syncNav]);

  return { onScroll, revealNav };
}
