import React, { useState, useEffect, useMemo, useRef, useCallback, Suspense } from 'react';
import { Plus } from 'lucide-react';
import { motion } from 'motion/react';
import { useKeyboardInset } from './hooks/useKeyboardInset';
import { useAnyModalOpen, useKeyboardVisible } from './hooks/useKeyboardVisible';
import { tapPress } from './lib/motionPresets';
import { useTheme, useThemeActions } from './providers/ThemeProvider';
import { usePreferences, usePreferencesActions } from './providers/PreferencesProvider';
import { toggleInterest } from './providers/preferencesReducer';
import { useReminders, useRemindersActions } from './providers/RemindersProvider';
import { useUI, useUIActions } from './providers/UIProvider';
import { useSession, useSessionActions, useUserDataReset } from './providers/SessionProvider';
import { useOnboarding, useOnboardingActions } from './providers/OnboardingProvider';
import { useCalendar, useCalendarActions } from './providers/CalendarProvider';
import { useProtection, useProtectionActions } from './providers/ProtectionProvider';
import { useLedger, useLedgerActions } from './providers/HabitLedgerProvider';
import { useAccountSync } from './providers/AccountSyncController';
import { useBowl, useBowlActions } from './providers/BowlProvider';
import { useCompleteHabit } from './hooks/useCompleteHabit';
import { useWidgetBridge } from './hooks/useWidgetBridge';
import { findModal } from './providers/uiReducer';
import { ModalHost } from './components/ModalHost';
import {
  Habit,
  IdentityEvidence,
  ActiveTab,
  UserSession,
  HabitCompletionEvent,
  MomentumEvent,
} from './types';
import { calculateMomentumScore } from './utils/momentum';
import {
  endOfIsoDate,
  toISODate,
  getLocalDateString,
} from './utils/dates';
import { persistUserProfile } from './lib/profile';
import { purgeSeedHabitsFromTable } from './lib/habitsApi';
import { hasLogOn } from './lib/habitLogs';
import {
  destroyAscendSpotlightTutorial,
  hasScreenTutorialCompleted,
  markScreenTutorialCompleted,
  startAscendSpotlightTutorial,
  startScreenTutorial,
  type TutorialScreen,
} from './lib/tutorial';
import { displayedIdentityVoteCount } from './services/ledgerService';
import { HomeView } from './components/HomeView';
import { isAtActiveHabitCap, MAX_ACTIVE_HABITS } from './lib/protection';
import { countActiveKeystones, MAX_KEYSTONE_HABITS } from './lib/keystone';
import { HomeIndicator } from './components/HomeIndicator';
import { BottomNav } from './components/BottomNav';
import { HabitCard } from './components/HabitCard';
import { QuoteCard } from './components/QuoteCard';
import {
  getChronicleEntry,
  getYesterdayPlanForToday,
} from './lib/chronicle';
import { FriendsFeed } from './components/FriendsFeed';
import { ScreenHeader, SCREEN_INSET_CLASS, HEADER_ICON_BTN_CLASS } from './components/ScreenHeader';
import { TabLoadingFallback } from './components/TabLoadingFallback';

const AuthView = React.lazy(() => import('./components/AuthView').then((m) => ({ default: m.AuthView })));
const OnboardingView = React.lazy(() => import('./components/OnboardingView').then((m) => ({ default: m.OnboardingView })));
const RemindersView = React.lazy(() => import('./components/RemindersView').then((m) => ({ default: m.RemindersView })));
const ReportView = React.lazy(() => import('./components/ReportView').then((m) => ({ default: m.ReportView })));
const PersonalView = React.lazy(() => import('./components/PersonalView').then((m) => ({ default: m.PersonalView })));
const SettingsView = React.lazy(() => import('./components/SettingsView').then((m) => ({ default: m.SettingsView })));
import { getUserVisionStatement } from './lib/vision';
import { ErrorBoundary } from './components/ErrorBoundary';
import { FlightLayer } from './app/FlightLayer';
import { ScrolledBowlOverlay } from './components/ScrolledBowlOverlay';
import { pulseCompletionHaptic } from './lib/completionFeedback';

/** Tab pane visibility classes — maintains active tab DOM instances in memory for 0ms switching. */
function tabPaneClassName(isActive: boolean, extra = ''): string {
  return `absolute inset-0 tab-pane gpu-smooth ${isActive ? 'tab-pane-active' : 'tab-pane-cached'}${extra ? ` ${extra}` : ''}`;
}

export default function App() {
  useKeyboardInset(true);
  const isKeyboardOpen = useKeyboardVisible();
  const isAnyModalOpen = useAnyModalOpen();
  const { activeTab, visitedTabs, viewResetKey, modalStack, widgetFocusReminderId, widgetOpenCreateTask } = useUI();
  const {
    setTab: setActiveTab,
    openModal,
    updateModal,
    closeModal,
    resetView,
    setOpenCreateTask,
  } = useUIActions();
  const isAddModalOpen = modalStack.some((modal) => modal.kind === 'addHabit');
  const longPressModal = findModal(modalStack, 'habitLongPress');
  const longPressedHabitId = longPressModal?.habitId ?? null;
  const { session, authLoading } = useSession();
  const {
    signIn,
    signOut,
    deleteAccount,
    updateAvatar: handleUpdateAvatar,
    updateName: handleUpdateName,
  } = useSessionActions();
  const sessionRef = useRef<UserSession | null>(session);
  sessionRef.current = session;
  const derivedHabitsRef = useRef<Habit[]>([]);
  const todayDayIndexRef = useRef(3);
  const { isOnboarded, hasCompletedTutorial } = useOnboarding();
  const {
    completeOnboarding: handleOnboardingComplete,
    setOnboardingStep: handleOnboardingStepChange,
    startAsNewUser,
    startAsReturningUser,
    completeTutorial,
    tutorialLock,
    setTutorialLocked,
  } = useOnboardingActions();

  const { theme, isDark } = useTheme();
  const { setTheme: handleThemeChange } = useThemeActions();

  const { protectionWindows, examShieldActive, vacationModeActive, examShieldStatus, vacationStatus } =
    useProtection();
  const { activateExamShield, deactivateExamShield, toggleVacation: handleToggleVacationMode } = useProtectionActions();

  const { selectedInterests, notificationWindows, eveningChronicle, completionSound, hapticVibration, cycleDays } =
    usePreferences();
  const {
    setSelectedInterests,
    toggleNotificationWindow: handleToggleNotificationWindow,
    setEveningChronicle: handleEveningChronicleChange,
    setCompletionSound: handleCompletionSoundChange,
    setHapticVibration: handleHapticVibrationChange,
    setCycleDays: handleCycleDaysChange,
  } = usePreferencesActions();
  const [chronicleVersion, setChronicleVersion] = useState(0);
  const CHRONICLE_LAST_AUTO_LAUNCH_KEY = 'ascend_chronicle_last_auto_launch_date';

  const VISION_REMINDER_LAST_DATE_KEY = 'ascend_vision_reminder_last_date';

  const handleOpenChronicle = useCallback(() => openModal({ kind: 'chronicle' }), [openModal]);
  const handleChronicleSave = useCallback(() => setChronicleVersion((v) => v + 1), []);

  const handleToggleInterest = useCallback((interest: string) => {
    setSelectedInterests((prev) => {
      const next = toggleInterest(prev, interest);
      const curSession = sessionRef.current;
      if (curSession && !curSession.isGuest) {
        void persistUserProfile(curSession, { interests: next }).catch(() => {});
      }
      return next;
    });
  }, [setSelectedInterests]);

  const {
    habits,
    completionEvents,
    momentumEvents,
    evidenceList,
    frictionAudits,
    pendingFriction,
    activeFallbackIds,
    rolledOverHabits,
    momentumPulse,
    derivedHabits,
    activeHabits,
    todayMomentumEvents,
    todayMomentumScore,
  } = useLedger();
  const ledgerActions = useLedgerActions();
  const { syncNow: handlePersonalSyncNow } = useAccountSync();

  const bowl = useBowl();
  const { onCelebrationDone, setBowlOffscreen } = useBowlActions();
  const isBowlOffscreen = bowl.isBowlOffscreen;
  const handleCompleteToday = useCompleteHabit();
  useWidgetBridge(handleCompleteToday);

  const { reminders, pendingCount: pendingRemindersCount } = useReminders();
  const {
    addReminder: handleAddReminder,
    updateReminder: handleUpdateReminder,
    toggleReminder: handleToggleReminder,
    setReminderCompleted: handleSetReminderCompleted,
    deleteReminder: handleDeleteReminder,
    snoozeReminder: handleSnoozeReminder,
    mergeHydrated: handleRemindersHydrated,
    syncNow: handleSyncReminders,
  } = useRemindersActions();

  const isTabActive = useCallback((tab: ActiveTab) => activeTab === tab, [activeTab]);

  const {
    todayIso: currentDateString,
    calendarOrigin,
    originIso,
    todayDayIndex,
    currentDayIndex,
    selectedIso: currentSelectedDate,
    isViewingToday,
  } = useCalendar();
  const { selectDate: setCurrentSelectedDate } = useCalendarActions();
  // Startup trigger: Strategy/Vision overlay auto-launch on new day (deferred 150ms post-paint)
  useEffect(() => {
    if (!isOnboarded) return;
    const todayIso = getLocalDateString();
    if (!isTabActive('home')) return;

    const timer = window.setTimeout(() => {
      const lastVisionDate = localStorage.getItem(VISION_REMINDER_LAST_DATE_KEY);
      if (lastVisionDate !== todayIso) {
        localStorage.setItem(VISION_REMINDER_LAST_DATE_KEY, todayIso);
        openModal({ kind: 'visionReminder', text: getUserVisionStatement() });
      }
    }, 150);

    return () => window.clearTimeout(timer);
  }, [isOnboarded, isTabActive, currentDateString]);

  const handleToggleExamShield = useCallback(() => {
    // Turning it on asks for confirmation first; turning it off is immediate.
    if (examShieldActive) deactivateExamShield();
    else openModal({ kind: 'examShield' });
  }, [examShieldActive, deactivateExamShield, openModal]);
  const handleConfirmActivateExamShield = activateExamShield;


  const activeKeystoneCount = useMemo(() => countActiveKeystones(habits), [habits]);
  const activeFallbackIdSet = useMemo(() => new Set(activeFallbackIds), [activeFallbackIds]);
  const todayIso = originIso;
  const chronicleCompletedToday = useMemo(
    () => Boolean(getChronicleEntry(todayIso)),
    [todayIso, chronicleVersion]
  );
  const yesterdayPlan = useMemo(
    () => getYesterdayPlanForToday(calendarOrigin),
    [calendarOrigin, chronicleVersion]
  );
  const prevKeystoneCompletedRef = useRef<string[]>([]);
  const keystoneCompletedOnViewedDay = useMemo(() => {
    const next = activeHabits
      .filter((habit) => habit.isKeystone && habit.days?.[currentDayIndex])
      .map((habit) => habit.id);
    const prev = prevKeystoneCompletedRef.current;
    if (prev.length === next.length && prev.every((id, idx) => id === next[idx])) {
      return prev;
    }
    prevKeystoneCompletedRef.current = next;
    return next;
  }, [activeHabits, currentDayIndex]);

  const longPressedHabit = useMemo(() => {
    return derivedHabits.find((h) => h.id === longPressedHabitId) || null;
  }, [derivedHabits, longPressedHabitId]);

  const momentumScore = useMemo(() => {
    if (isViewingToday) return todayMomentumScore;
    return calculateMomentumScore(todayMomentumEvents, {
      asOf: endOfIsoDate(currentSelectedDate),
      habits,
      protectionWindows,
    });
  }, [
    isViewingToday,
    todayMomentumScore,
    todayMomentumEvents,
    currentSelectedDate,
    habits,
    protectionWindows,
  ]);

  const displayedIdentityVotes = useMemo(
    () => displayedIdentityVoteCount(
      momentumEvents,
      evidenceList,
      undefined
    ),
    [momentumEvents, evidenceList]
  );
  const ledgerEvidence = useMemo(
    () => evidenceList,
    [evidenceList]
  );

  const handleRolloverAll = useCallback(() => {
    if (ledgerActions.rolloverAll() > 0) void pulseCompletionHaptic('fallback');
  }, [ledgerActions]);

  const handleFrictionRolloverMicro = useCallback(() => {
    if (ledgerActions.frictionRolloverMicro() > 0) void pulseCompletionHaptic('fallback');
  }, [ledgerActions]);

  const activeFrictionPrompt = pendingFriction[0] ?? null;

  const handleArchiveHabit = useCallback(
    (habitId: string) => {
      ledgerActions.archiveHabit(habitId);
      closeModal('habitDetail', habitId);
    },
    [ledgerActions, closeModal]
  );

  const handleDeleteHabit = useCallback(
    (habitId: string) => {
      ledgerActions.deleteHabit(habitId);
      closeModal('habitDetail', habitId);
    },
    [ledgerActions, closeModal]
  );

  const handleUpdateHabit = useCallback(
    (habit: Habit) => updateModal({ kind: 'habitDetail', habit: ledgerActions.updateHabit(habit) }),
    [ledgerActions, updateModal]
  );

  const handleImportJSON = useCallback(
    (
      importedHabits: Habit[],
      importedEvidence?: IdentityEvidence[],
      importedEvents?: HabitCompletionEvent[],
      importedMomentum?: MomentumEvent[]
    ) =>
      ledgerActions.importBackup({
        habits: importedHabits,
        evidence: Array.isArray(importedEvidence) ? importedEvidence : undefined,
        completionEvents: Array.isArray(importedEvents) ? importedEvents : undefined,
        momentumEvents: Array.isArray(importedMomentum) ? importedMomentum : undefined,
      }),
    [ledgerActions]
  );

  // Clear Cache
  const handleClearCache = useCallback(() => {
    localStorage.removeItem('ascend_reminders_cache');
    localStorage.removeItem('ascend_habit_logs_cache');
    localStorage.removeItem('ascend_chronicle_entries');
    localStorage.removeItem('ascend_chronicle');
    localStorage.removeItem(CHRONICLE_LAST_AUTO_LAUNCH_KEY);
    localStorage.removeItem(VISION_REMINDER_LAST_DATE_KEY);
    localStorage.removeItem('ascend_reminders');
    localStorage.removeItem('ascend_cache_timestamp');
  }, []);

  // Delete Account — JWT-scoped RPC deletes auth.users + owned public data, then local data is purged.
  const handleDeleteAccount = useCallback(async () => {
    await deleteAccount();
  }, [deleteAccount]);

  // Sign out: queued writes are pushed, then every user-scoped store is purged and reset.
  const handleLogout = signOut;

  // Auth Success handler
  const handleAuthSuccess = (newSession: UserSession, isNewUser?: boolean, interests?: string[]) => {
    signIn(newSession);
    setActiveTab('home');
    if (interests && interests.length > 0) {
      setSelectedInterests(interests);
      if (newSession && !newSession?.isGuest) {
        void persistUserProfile(newSession, {
          interests,
          has_completed_tutorial: false,
        }).catch(() => {});
      }
    }
    if (newSession && !newSession?.isGuest) {
      void purgeSeedHabitsFromTable(newSession.id).catch(() => {});
    }
    // A new account starts empty (a new guest keeps local work); demo habits never carry over.
    ledgerActions.startAuth(Boolean(isNewUser) && !newSession?.isGuest);
    if (isNewUser) startAsNewUser();
    else startAsReturningUser();
  };

  // RESET_ALL for the chronicle view App still owns (the providers reset themselves).
  useUserDataReset(() => setChronicleVersion((v) => v + 1));

  derivedHabitsRef.current = derivedHabits;
  todayDayIndexRef.current = todayDayIndex;

  const stableCompleteToday = handleCompleteToday;
  const stableResetToday = ledgerActions.resetToday;
  const stableToggleFallbackMode = ledgerActions.toggleFallbackMode;
  const stableToggleKeystone = ledgerActions.setKeystone;
  const stableLongPress = useCallback(
    (h: Habit, rect?: DOMRect) => openModal({ kind: 'habitLongPress', habitId: h.id, rect: rect || null }),
    [openModal]
  );
  const stableDismissLongPress = useCallback(() => closeModal('habitLongPress'), [closeModal]);
  const stableOpenEdit = useCallback(
    (h: Habit) => {
      closeModal('habitLongPress');
      openModal({ kind: 'habitDetail', habit: h });
    },
    [openModal, closeModal]
  );
  const stableOpenDeleteConfirm = useCallback(
    (h: Habit) => {
      closeModal('habitLongPress');
      openModal({ kind: 'deleteHabit', habit: h });
    },
    [openModal, closeModal]
  );

  const handleOpenSettingsTab = useCallback(() => setActiveTab('settings'), [setActiveTab]);

  const renderHabit = useCallback(
    (habit: Habit, habitIndex: number) => {
      const keystoneAtCap =
        !habit.isKeystone && activeKeystoneCount >= MAX_KEYSTONE_HABITS;
      const isCompletedToday = Boolean(habit.days?.[currentDayIndex]);
      return (
        <HabitCard
          key={habit.id}
          habit={habit}
          todayIndex={todayDayIndex}
          viewIndex={currentDayIndex}
          isCompletedToday={isCompletedToday}
          theme={theme}
          gesturesLocked={!isViewingToday}
          isLongPressed={longPressedHabitId === habit.id}
          isOtherLongPressed={Boolean(longPressedHabitId && longPressedHabitId !== habit.id)}
          isFallbackActive={isViewingToday && activeFallbackIdSet.has(habit.id)}
          isTourTarget={habitIndex === 0}
          onCompleteToday={stableCompleteToday}
          onToggleFallbackMode={stableToggleFallbackMode}
          onResetToday={stableResetToday}
          onLongPress={stableLongPress}
          onDismissLongPress={stableDismissLongPress}
          onOpenEdit={stableOpenEdit}
          onOpenDeleteConfirm={stableOpenDeleteConfirm}
          onToggleKeystone={stableToggleKeystone}
          keystoneAtCap={keystoneAtCap}
          keystoneBoosted={
            keystoneCompletedOnViewedDay.length > 0 && !keystoneCompletedOnViewedDay.includes(habit.id)
          }
          weekOrigin={calendarOrigin}
        />
      );
    },
    [
      activeKeystoneCount,
      todayDayIndex,
      currentDayIndex,
      theme,
      isViewingToday,
      longPressedHabitId,
      activeFallbackIdSet,
      stableCompleteToday,
      stableToggleFallbackMode,
      stableResetToday,
      stableLongPress,
      stableDismissLongPress,
      stableOpenEdit,
      stableOpenDeleteConfirm,
      stableToggleKeystone,
      keystoneCompletedOnViewedDay,
      calendarOrigin,
    ]
  );

  const quoteCardElement = useMemo(
    () => (
      <QuoteCard
        selectedInterests={selectedInterests}
        isGuest={Boolean(session?.isGuest)}
        chronicleSettings={eveningChronicle}
        chronicleCompletedToday={chronicleCompletedToday}
        yesterdayPlan={yesterdayPlan}
        onOpenChronicle={handleOpenChronicle}
      />
    ),
    [
      selectedInterests,
      session?.isGuest,
      eveningChronicle,
      chronicleCompletedToday,
      yesterdayPlan,
      handleOpenChronicle,
    ]
  );
  const handleOpenHomeTab = useCallback(() => setActiveTab('home'), [setActiveTab]);
  const handleOpenLedgerModal = useCallback(() => openModal({ kind: 'identityLedger' }), [openModal]);
  const handleOpenPasswordModal = useCallback(() => openModal({ kind: 'changePassword' }), [openModal]);

  const handleOpenCreateConsumed = useCallback(() => setOpenCreateTask(false), [setOpenCreateTask]);

  // Nav chrome: toggle via DOM class — never setState on scroll (that re-rendered every habit card).
  const navScrollVisibleRef = useRef(true);
  const lastScrollYRef = useRef(0);
  const pendingScrollYRef = useRef(0);
  const scrollRafRef = useRef(0);

  const syncNavChrome = useCallback(() => {
    const el = document.getElementById('floating-bottom-nav');
    if (!el) return;
    const show = navScrollVisibleRef.current && !isKeyboardOpen && !isAnyModalOpen;
    el.classList.toggle('nav-chrome-hidden', !show);
    el.setAttribute('aria-hidden', show ? 'false' : 'true');
  }, [isKeyboardOpen, isAnyModalOpen]);

  useEffect(() => {
    syncNavChrome();
  }, [syncNavChrome]);

  useEffect(() => {
    navScrollVisibleRef.current = true;
    lastScrollYRef.current = 0;
    syncNavChrome();
    if (activeTab === 'report') {
      setCurrentSelectedDate(toISODate());
    }
    if (scrollRafRef.current) {
      cancelAnimationFrame(scrollRafRef.current);
      scrollRafRef.current = 0;
    }
  }, [activeTab, syncNavChrome]);

  const handleMainScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      pendingScrollYRef.current = e.currentTarget.scrollTop;
      if (scrollRafRef.current) return;
      scrollRafRef.current = requestAnimationFrame(() => {
        scrollRafRef.current = 0;
        const currentScrollY = pendingScrollYRef.current;
        const delta = currentScrollY - lastScrollYRef.current;
        let nextVisible = navScrollVisibleRef.current;

        if (currentScrollY <= 8) nextVisible = true;
        else if (delta > 8) nextVisible = false;
        else if (delta < -8) nextVisible = true;

        lastScrollYRef.current = currentScrollY;

        // Immediate check if bowl frame has scrolled off-screen
        const frame = document.getElementById('accumulation-bowl-frame');
        if (frame) {
          const r = frame.getBoundingClientRect();
          const isOff = r.bottom <= 60;
          setBowlOffscreen(isOff);
        }

        if (nextVisible === navScrollVisibleRef.current) return;
        navScrollVisibleRef.current = nextVisible;
        syncNavChrome();
      });
    },
    [syncNavChrome]
  );

  const handleScrollToTop = useCallback(() => {
    const mainEl = document.getElementById('app-main-content');
    if (mainEl) {
      mainEl.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, []);

  // Track viewport visibility of primary 3D bowl frame
  useEffect(() => {
    if (!isTabActive('home')) {
      setBowlOffscreen(false);
      return;
    }

    const checkBowlVisibility = () => {
      const frame = document.getElementById('accumulation-bowl-frame');
      const root = document.getElementById('app-main-content');
      if (!frame || !root) return;
      const r = frame.getBoundingClientRect();
      const rootRect = root.getBoundingClientRect();
      const isOff = r.bottom <= rootRect.top + 20;
      setBowlOffscreen(isOff);
    };

    const frame = document.getElementById('accumulation-bowl-frame');
    const root = document.getElementById('app-main-content');
    if (!frame || !root) {
      const timer = window.setTimeout(checkBowlVisibility, 150);
      return () => window.clearTimeout(timer);
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return;
        const rootBounds = entry.rootBounds;
        const isOff = !entry.isIntersecting && entry.boundingClientRect.bottom <= (rootBounds ? rootBounds.top + 20 : 60);
        setBowlOffscreen(isOff);
      },
      {
        root,
        threshold: [0, 0.1],
      }
    );

    observer.observe(frame);
    checkBowlVisibility();

    return () => {
      observer.disconnect();
    };
  }, [isTabActive('home'), viewResetKey]);

  // Spotlight tutorial: only after onboarding, and only if the profile flag is false
  useEffect(() => {
    if (!session || !isOnboarded) return;
    if (hasCompletedTutorial !== false) return;
    if (tutorialLock.current) return;

    if (activeTab !== 'home') {
      setActiveTab('home');
      return;
    }

    navScrollVisibleRef.current = true;
    syncNavChrome();
    const timer = window.setTimeout(() => {
      if (tutorialLock.current || hasCompletedTutorial !== false || isAddModalOpen) return;
      setTutorialLocked(true);
      startAscendSpotlightTutorial(() => {
        completeTutorial();
        markScreenTutorialCompleted('home');
        if (session && !session?.isGuest) {
          void persistUserProfile(session, {
            has_completed_tutorial: true,
            interests: selectedInterests,
          }).catch(() => {});
        }
      });
    }, 700);

    return () => window.clearTimeout(timer);
  }, [session, isOnboarded, hasCompletedTutorial, activeTab, selectedInterests, syncNavChrome, isAddModalOpen]);

  useEffect(() => {
    if (!session || !isOnboarded) return;
    if (hasCompletedTutorial !== true) return;
    const screen = activeTab as TutorialScreen;
    if (screen !== 'reminders' && screen !== 'report' && screen !== 'personal' && screen !== 'settings') {
      return;
    }
    if (hasScreenTutorialCompleted(screen)) return;

    navScrollVisibleRef.current = true;
    syncNavChrome();
    const timer = window.setTimeout(() => {
      if (hasScreenTutorialCompleted(screen)) return;
      startScreenTutorial(screen, () => {
        markScreenTutorialCompleted(screen);
      });
    }, 550);

    return () => {
      window.clearTimeout(timer);
      destroyAscendSpotlightTutorial();
    };
  }, [session, isOnboarded, hasCompletedTutorial, activeTab, syncNavChrome]);

  // ROUTING GUARDS
  if (authLoading) {
    return <TabLoadingFallback />;
  }

  // ROUTING: Unauthenticated users -> Auth Screen
  if (!session) {
    return (
      <Suspense fallback={<TabLoadingFallback />}>
        <AuthView onAuthSuccess={handleAuthSuccess} />
      </Suspense>
    );
  }

  // ROUTING: Authenticated users who haven't finished onboarding -> Onboarding Flow
  if (!isOnboarded) {
    return (
      <Suspense fallback={<TabLoadingFallback />}>
        <OnboardingView
          onComplete={handleOnboardingComplete}
          onStepChange={handleOnboardingStepChange}
        />
      </Suspense>
    );
  }

  const themeBgClass = 'bg-canvas text-ink';

  return (
    <div
      id="app-root"
      className={`w-full h-full overflow-hidden select-none font-sans ${themeBgClass}`}
    >
      <div
        id="mobile-viewport"
        className="relative w-full h-full overflow-hidden"
      >
        <ErrorBoundary
          resetKey={String(viewResetKey)}
          onReset={resetView}
        >
        <div className="absolute inset-0 z-10 tab-pane-host gpu-smooth bg-canvas">
        {/* Active tabs maintain persistent DOM memory once visited for 0ms instant tab switching. */}
          <main
            id="app-main-content"
            onScroll={handleMainScroll}
            aria-hidden={!isTabActive('home')}
            className={tabPaneClassName(
              isTabActive('home'),
              `px-4 ${SCREEN_INSET_CLASS} pb-28 flex flex-col overflow-y-auto overscroll-y-contain no-scrollbar gpu-accelerated gpu-smooth${longPressedHabitId && isTabActive('home') ? ' opacity-40 pointer-events-none' : ''}`
            )}
          >
            <ScreenHeader
              title="Home"
              onOpenSettings={handleOpenSettingsTab}
              actions={
                <>
                  <FriendsFeed
                    userId={session?.id}
                    isGuest={session?.isGuest}
                    userEmail={session?.email}
                    userName={session?.name}
                    variant="icon"
                    mode="invite"
                  />
                  <motion.button
                    id="add-habit-btn-above-list"
                    type="button"
                    whileTap={tapPress}
                    onClick={() => {
                      if (isAtActiveHabitCap(habits)) {
                        alert(`Maximum limit of ${MAX_ACTIVE_HABITS} active habits reached.`);
                        return;
                      }
                      destroyAscendSpotlightTutorial();
                      openModal({ kind: 'addHabit' });
                    }}
                    aria-label="Add Habit"
                    title={isAtActiveHabitCap(habits) ? `Maximum limit of ${MAX_ACTIVE_HABITS} active habits reached` : 'Add Habit'}
                    className={HEADER_ICON_BTN_CLASS}
                  >
                    <Plus className="w-5 h-5" strokeWidth={2.5} />
                  </motion.button>
                </>
              }
            />

            <HomeView
              isActive={isTabActive('home')}
              pieces={bowl.pieces}
              bowlFill={bowl.bowlFill}
              momentumScore={todayMomentumScore}
              momentumPulse={momentumPulse}
              onCycleDaysChange={handleCycleDaysChange}
              celebrating={bowl.celebrating}
              onCelebrationDone={onCelebrationDone}
              deferredPieceIds={bowl.deferredPieceIds}
              settlePieceIds={bowl.settlePieceIds}
              settleHandoffs={bowl.settleHandoffs}
              habits={activeHabits}
              todayIndex={todayDayIndex}
              renderHabit={renderHabit}
              examShieldActive={examShieldActive}
              rolledOverHabits={rolledOverHabits}
              onRolloverAll={handleRolloverAll}
            >
              {quoteCardElement}
            </HomeView>
          </main>

        {visitedTabs.includes('reminders') && (
          <div
            aria-hidden={!isTabActive('reminders')}
            className={activeTab === 'reminders' ? 'block h-full' : 'hidden'}
          >
            <Suspense fallback={<TabLoadingFallback />}>
              <RemindersView
                reminders={reminders}
                focusReminderId={widgetFocusReminderId}
                openCreate={widgetOpenCreateTask}
                onOpenCreateConsumed={handleOpenCreateConsumed}
                onAddReminder={handleAddReminder}
                onUpdateReminder={handleUpdateReminder}
                onToggleComplete={handleToggleReminder}
                onSetReminderCompleted={handleSetReminderCompleted}
                onDeleteReminder={handleDeleteReminder}
                onSnoozeReminder={handleSnoozeReminder}
                userSession={session}
                onRemindersHydrated={handleRemindersHydrated}
                onSyncReminders={handleSyncReminders}
                onScroll={handleMainScroll}
                onOpenSettings={handleOpenSettingsTab}
              />
            </Suspense>
          </div>
        )}

        {visitedTabs.includes('report') && (
          <div
            aria-hidden={!isTabActive('report')}
            className={activeTab === 'report' ? 'block h-full' : 'hidden'}
          >
            <Suspense fallback={<TabLoadingFallback />}>
              <ReportView
                isActive={isTabActive('report')}
                habits={derivedHabits ?? []}
                evidenceList={ledgerEvidence}
                identityVoteCount={displayedIdentityVotes}
                userId={session?.id}
                isGuest={session?.isGuest}
                userEmail={session?.email}
                userName={session?.name}
                onOpenLedger={handleOpenLedgerModal}
                onOpenSettings={handleOpenSettingsTab}
                frictionAudits={frictionAudits ?? []}
                onScroll={handleMainScroll}
                isDark={isDark}
                momentumScore={todayMomentumScore}
                momentumEvents={momentumEvents ?? []}
                momentumHistory={momentumEvents ?? []}
                completionEvents={completionEvents ?? []}
                logs={completionEvents ?? []}
                selectedDayIso={currentSelectedDate}
                onSelectDayIso={setCurrentSelectedDate}
                cycleDays={cycleDays}
                cycleStartIso={bowl.cycleStartIso}
              />
            </Suspense>
          </div>
        )}

        {visitedTabs.includes('personal') && (
          <div
            aria-hidden={!isTabActive('personal')}
            className={activeTab === 'personal' ? 'block h-full' : 'hidden'}
          >
            <Suspense fallback={<TabLoadingFallback />}>
              <PersonalView
                userSession={session}
                evidenceList={ledgerEvidence}
                identityVoteCount={displayedIdentityVotes}
                selectedInterests={selectedInterests ?? []}
                onToggleInterest={handleToggleInterest}
                examShieldActive={examShieldActive}
                examShieldStatus={examShieldStatus}
                onToggleExamShield={handleToggleExamShield}
                vacationModeActive={vacationModeActive}
                vacationStatus={vacationStatus}
                onToggleVacationMode={handleToggleVacationMode}
                momentumScore={momentumScore}
                onOpenSettings={handleOpenSettingsTab}
                onOpenLedger={handleOpenLedgerModal}
                onSyncNow={handlePersonalSyncNow}
                onChangePassword={handleOpenPasswordModal}
                onUpdateAvatar={handleUpdateAvatar}
                onLogout={handleLogout}
                onUpdateName={handleUpdateName}
                onScroll={handleMainScroll}
              />
            </Suspense>
          </div>
        )}

        {visitedTabs.includes('settings') && (
          <div
            aria-hidden={!isTabActive('settings')}
            className={activeTab === 'settings' ? 'block h-full' : 'hidden'}
          >
            <Suspense fallback={<TabLoadingFallback />}>
              <SettingsView
                habits={habits ?? []}
                evidenceList={ledgerEvidence}
                completionEvents={completionEvents ?? []}
                momentumEvents={momentumEvents ?? []}
                theme={theme}
                onThemeChange={handleThemeChange}
                notificationWindows={notificationWindows}
                onToggleNotificationWindow={handleToggleNotificationWindow}
                eveningChronicle={eveningChronicle}
                onEveningChronicleChange={handleEveningChronicleChange}
                completionSound={completionSound}
                onCompletionSoundChange={handleCompletionSoundChange}
                hapticVibration={hapticVibration}
                onHapticVibrationChange={handleHapticVibrationChange}
                onResetData={ledgerActions.clearWorkspace}
                onRestoreHabit={ledgerActions.restoreHabit}
                onDeleteHabit={handleDeleteHabit}
                onImportJSON={handleImportJSON}
                onDeleteAccount={handleDeleteAccount}
                onClearCache={handleClearCache}
                onScroll={handleMainScroll}
                onOpenSettings={handleOpenHomeTab}
              />
            </Suspense>
          </div>
        )}
        </div>

        <FlightLayer />
        <ScrolledBowlOverlay
          isVisible={isTabActive('home') && isBowlOffscreen && !longPressedHabitId && !isAnyModalOpen}
          votes={bowl.bowlFill.votes}
          capacity={bowl.bowlFill.capacity}
          fillPercent={bowl.bowlFill.fillPercent}
          hasActiveFlight={bowl.pieceFlights.length > 0}
          isPulsing={bowl.arrivalPulse}
          onScrollToTop={handleScrollToTop}
        />
        </ErrorBoundary>

        {/* Floating Bottom Navigation: hide on scroll, keyboard, or modal */}
        <BottomNav
          activeTab={activeTab}
          onTabChange={setActiveTab}
          pendingRemindersCount={pendingRemindersCount}
          isBlurred={Boolean(longPressedHabitId)}
        />

        <HomeIndicator />

        <ModalHost
          session={session}
          habits={habits}
          todayDayIndex={todayDayIndex}
          todayIso={todayIso}
          longPressedHabit={longPressedHabit}
          longPressedCompletedToday={
            longPressedHabit ? hasLogOn(completionEvents, longPressedHabit.id, currentDateString) : false
          }
          longPressedFallbackActive={
            Boolean(longPressedHabit) && isViewingToday && activeFallbackIds.includes(longPressedHabit.id)
          }
          onAddHabit={ledgerActions.addHabit}
          onUpdateHabit={handleUpdateHabit}
          onArchiveHabit={handleArchiveHabit}
          onDeleteHabit={handleDeleteHabit}
          frictionPrompt={activeFrictionPrompt}
          onFrictionSubmit={ledgerActions.submitFriction}
          onFrictionSkip={ledgerActions.skipFriction}
          onFrictionRolloverMicro={handleFrictionRolloverMicro}
          onChronicleSave={handleChronicleSave}
          ledgerEvidence={ledgerEvidence}
          identityVoteCount={displayedIdentityVotes}
          onAddManualVote={ledgerActions.addManualVote}
          examShieldStatus={examShieldStatus}
          onConfirmActivateExamShield={handleConfirmActivateExamShield}
        />

      </div>
    </div>
  );
}
