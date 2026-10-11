import { useCallback } from 'react';
import { BottomNav } from '../components/BottomNav';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { HomeIndicator } from '../components/HomeIndicator';
import { ScrolledBowlOverlay } from '../components/ScrolledBowlOverlay';
import { useCompleteHabit } from '../hooks/useCompleteHabit';
import { useAnyModalOpen } from '../hooks/useKeyboardVisible';
import { useWidgetBridge } from '../hooks/useWidgetBridge';
import { useBowl } from '../providers/BowlProvider';
import { useReminders } from '../providers/RemindersProvider';
import { useUI, useUIActions } from '../providers/UIProvider';
import { findModal } from '../providers/uiReducer';
import { FlightLayer } from './FlightLayer';
import { ModalLayer } from './ModalLayer';
import { TabHost } from './TabHost';
import { useAppTutorials } from './useAppTutorials';
import { useBowlVisibility } from './useBowlVisibility';
import { useNavChrome } from './useNavChrome';
import { useVisionReminder } from './useVisionReminder';

/** The signed-in, onboarded app: tabs, bowl overlays, bottom nav and modals. */
export function AppShell() {
  const { activeTab, viewResetKey, modalStack } = useUI();
  const { setTab, resetView } = useUIActions();
  const { pendingCount } = useReminders();
  const bowl = useBowl();
  const isAnyModalOpen = useAnyModalOpen();
  const nav = useNavChrome();
  useWidgetBridge(useCompleteHabit());
  useBowlVisibility();
  useVisionReminder();
  useAppTutorials(nav.revealNav);

  const longPressOpen = Boolean(findModal(modalStack, 'habitLongPress'));
  const scrollHomeToTop = useCallback(() => {
    document.getElementById('app-main-content')?.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  return (
    <div id="app-root" className="w-full h-full overflow-hidden select-none font-sans bg-canvas text-ink">
      <div id="mobile-viewport" className="relative w-full h-full overflow-hidden">
        <ErrorBoundary resetKey={String(viewResetKey)} onReset={resetView}>
          <TabHost onScroll={nav.onScroll} />
          <FlightLayer />
          <ScrolledBowlOverlay
            isVisible={activeTab === 'home' && bowl.isBowlOffscreen && !longPressOpen && !isAnyModalOpen}
            votes={bowl.bowlFill.votes}
            capacity={bowl.bowlFill.capacity}
            fillPercent={bowl.bowlFill.fillPercent}
            hasActiveFlight={bowl.pieceFlights.length > 0}
            isPulsing={bowl.arrivalPulse}
            onScrollToTop={scrollHomeToTop}
          />
        </ErrorBoundary>
        {/* Floating bottom nav: hidden on scroll, keyboard or modal (see useNavChrome). */}
        <BottomNav activeTab={activeTab} onTabChange={setTab} pendingRemindersCount={pendingCount} isBlurred={longPressOpen} />
        <HomeIndicator />
        <ModalLayer />
      </div>
    </div>
  );
}
