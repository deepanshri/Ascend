import React, { useState, useEffect, useMemo, useRef, useCallback, Suspense, startTransition } from 'react';
import { App as CapacitorApp } from '@capacitor/app';
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
import { computeDayRollover } from './lib/dayRollover';
import { findModal } from './providers/uiReducer';
import { ModalHost } from './components/ModalHost';
import {
  Habit,
  HabitCategory,
  IdentityEvidence,
  ActiveTab,
  UserSession,
  FrictionAudit,
  HabitCompletionEvent,
  MomentumEvent,
} from './types';
import { isSeedHabitId } from './data/initialHabits';
import {
  calculateMomentumScore,
  createMomentumEvent,
  habitWeight,
  deriveHabitsFromEventLog,
  mergeCompletionEvents,
  mergeMomentumEvents,
  momentumEventsFromCompletionLog,
  newMomentumEventId,
  upsertHabitLog,
  upsertHabitLogs,
  deleteHabitLog,
} from './utils/momentum';
import {
  appendMomentumEventRemote,
  appendMomentumEventsRemote,
  MOMENTUM_EVENTS_STORAGE_KEY,
  saveLocalMomentumEvents,
} from './lib/momentumEvents';
import {
  addDaysIso,
  dayIndexForIso,
  endOfIsoDate,
  formatEvidenceDate,
  formatIsoShort,
  resolveEventIsoDate,
  toISODate,
  getLocalDateString,
} from './utils/dates';
import { isHabitScheduledOnDayIndex } from './utils/schedule';
import { hideNativeSplash } from './lib/nativeChrome';
import { getThemeIsDark } from './lib/themeStore';
import { fetchUserProfile, persistUserProfile, getLocalTutorialCompleted, resolveTutorialCompleted } from './lib/profile';
import { persistStoredAvatarId, resolveAvatarId } from './data/avatars';
import { persistHabitsToTable, persistMomentumHistory, syncAuthenticatedAccount } from './lib/accountSync';
import { mergeHabitsByUpdatedAt, touchHabit } from './lib/syncMerge';
import { fetchHabitLogsForDateRange, purgeSeedHabitsFromTable, persistHabitLogFrictionReason, fetchFrictionReasonsFromTable, omitDeletedHabitRefs } from './lib/habitsApi';
import { readStorage, removeStorage, writeJson, writeStorage } from './lib/storage';
import {
  ACTIVE_FALLBACKS_STORAGE_KEY,
  COMPLETION_EVENTS_STORAGE_KEY,
  EVIDENCE_STORAGE_KEY,
  FRICTION_AUDITS_STORAGE_KEY,
  HABITS_STORAGE_KEY,
} from './lib/ledgerStorage';
import {
  loadStoredActiveFallbackIds,
  loadStoredCompletionEvents,
  loadStoredCompletionEventsOrNull,
  loadStoredEvidence,
  loadStoredFrictionAudits,
  loadStoredHabits,
  loadStoredMomentumEvents,
  loadStoredRolledOverHabits,
  saveRolledOverHabits,
} from './lib/ledgerStorageLoaders';
import { hasLogOn } from './lib/habitLogs';
import { usePersistedState } from './hooks/usePersistedState';
import {
  destroyAscendSpotlightTutorial,
  hasScreenTutorialCompleted,
  markScreenTutorialCompleted,
  startAscendSpotlightTutorial,
  startScreenTutorial,
  type TutorialScreen,
} from './lib/tutorial';
import {
  schedulePsychologyNotifications,
  cancelHabitTargetTimeNotification,
  scheduleHabitTargetTimeNotification,
  syncAllHabitTargetNotifications,
} from './lib/notifications';
import { displayedIdentityVoteCount, hasMomentumVoteOnIso, hasTodayLedgerEntry, removeTodayEvidence, replaceTodayCompletion, upsertTodayEvidence } from './services/ledgerService';
import { deleteHabit, stableHabitLogId } from './services/habitService';
import {
  accumulationPiecesFromLogs,
  activeCycleWindow,
  archiveCompletedCycle,
  readBowlCycleEpoch,
  resetBowlCycleEpoch,
  summarizeDualBowlFill,
  summarizeBowlFill,
  type AccumulationPiece,
} from './services/reportService';
import { getMarbleColor } from './utils/colors';
import { HomeView } from './components/HomeView';
import { useHabits, withHabitTimeOfDay } from './hooks/useHabits';
import { resolveHabitTimeOfDay } from './utils/timeOfDay';
import { consumeWidgetActions, parseWidgetRoute, publishWidgetSnapshot, readLaunchWidgetRoute } from './lib/widgetSync';
import { WidgetBridge } from './lib/widgetBridge';
import type { WidgetPendingAction, WidgetRoute } from './lib/widgetSync';
import { isAtActiveHabitCap, MAX_ACTIVE_HABITS } from './lib/protection';
import { countActiveKeystones, MAX_KEYSTONE_HABITS } from './lib/keystone';
import {
  createMissedFrictionAudit,
  enqueueFrictionPrompts,
  loadPendingFrictionPrompts,
  markFrictionPrompted,
  mergeFrictionAuditsFromLogs,
  savePendingFrictionPrompts,
  type PendingFrictionPrompt,
} from './lib/frictionAudit';
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
import FlyingPieceOverlay, {
  measureCompletionFlight,
  type FlightHandoffVelocity,
  type PieceFlight,
} from './components/FlyingPieceOverlay';
import { ScrolledBowlOverlay } from './components/ScrolledBowlOverlay';
import { pulseCompletionHaptic } from './lib/completionFeedback';

const NO_NOTIFICATION_WINDOWS = { morning: false, afternoon: false, night: false };

/** Debounce for ledger writes so swipe-complete doesn't block the main thread. */
const STORAGE_DEBOUNCE_MS = 320;

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
    focusReminder,
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
    setSyncStatus: applySyncStatus,
    updateAvatar: handleUpdateAvatar,
    updateName: handleUpdateName,
  } = useSessionActions();
  const sessionRef = useRef<UserSession | null>(session);
  sessionRef.current = session;
  const derivedHabitsRef = useRef<Habit[]>([]);
  const todayDayIndexRef = useRef(3);
  const handleCompleteTodayRef = useRef<(habitId: string, isFallback?: boolean, originCoord?: { x: number; y: number; marbleColor?: string }) => void>(() => {});
  const handleResetTodayRef = useRef<(habitId: string) => void>(() => {});
  const handleToggleFallbackModeRef = useRef<(habitId: string) => void>(() => {});
  const handleToggleKeystoneRef = useRef<(habitId: string, next: boolean) => void>(() => {});
  const { isOnboarded, onboardingStep, hasCompletedTutorial } = useOnboarding();
  const {
    completeOnboarding: handleOnboardingComplete,
    setOnboardingStep: handleOnboardingStepChange,
    startAsNewUser,
    startAsReturningUser,
    setTutorialCompleted,
    completeTutorial,
    tutorialLock,
    setTutorialLocked,
  } = useOnboardingActions();

  const { theme, isDark } = useTheme();
  const { setTheme: handleThemeChange } = useThemeActions();

  const { protectionWindows, examShieldActive, vacationModeActive, examShieldStatus, vacationStatus, paused } =
    useProtection();
  const { activateExamShield, deactivateExamShield, toggleVacation: handleToggleVacationMode } = useProtectionActions();
  const protectionPausedRef = useRef(paused);
  protectionPausedRef.current = paused;
  const habitsRef = useRef<Habit[]>([]);
  const momentumEventsRef = useRef<MomentumEvent[]>([]);

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

  // Friction Audit Log state
  const [frictionAudits, setFrictionAudits] = usePersistedState(loadStoredFrictionAudits, (value) =>
    writeJson(FRICTION_AUDITS_STORAGE_KEY, value)
  );

  const [pendingFriction, setPendingFriction] = usePersistedState<PendingFrictionPrompt[]>(
    loadPendingFrictionPrompts,
    savePendingFrictionPrompts
  );

  // Persistence via localStorage for habits
  const [habits, setHabits] = usePersistedState(
    loadStoredHabits,
    (value) => writeJson(HABITS_STORAGE_KEY, value),
    STORAGE_DEBOUNCE_MS
  );
  habitsRef.current = habits;

  // Append-only immutable completion event log (ground truth for habit history)
  const [completionEvents, setCompletionEvents] = usePersistedState(
    loadStoredCompletionEvents,
    (value) => writeJson(COMPLETION_EVENTS_STORAGE_KEY, value),
    STORAGE_DEBOUNCE_MS
  );

  const [momentumEvents, setMomentumEvents] = usePersistedState(
    loadStoredMomentumEvents,
    saveLocalMomentumEvents,
    STORAGE_DEBOUNCE_MS
  );
  momentumEventsRef.current = momentumEvents;

  // Hydrate profile interests + tutorial flag from Supabase `profiles`
  useEffect(() => {
    if (!session) {
      destroyAscendSpotlightTutorial();
      setTutorialCompleted(getLocalTutorialCompleted() ? true : null);
      setTutorialLocked(false);
      return;
    }

    let cancelled = false;
    void (async () => {
      const profile = await fetchUserProfile(session, selectedInterests);
      if (cancelled) return;
      if (profile.interests.length > 0) {
        setSelectedInterests(profile.interests);
      }
      if (profile.avatar_url) {
        const avatarUrl = resolveAvatarId(profile.avatar_url);
        persistStoredAvatarId(avatarUrl);
        handleUpdateAvatar(avatarUrl);
      }
      setTutorialCompleted(resolveTutorialCompleted(profile.has_completed_tutorial));
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.id, session?.isGuest]);

  // Active fallback mode for habits today (habits switched to fallback micro-task, pending completion)
  const [activeFallbackIds, setActiveFallbackIds] = usePersistedState(
    loadStoredActiveFallbackIds,
    (value) => writeJson(ACTIVE_FALLBACKS_STORAGE_KEY, value),
    STORAGE_DEBOUNCE_MS
  );

  const [bowlEpoch, setBowlEpoch] = useState(() => readBowlCycleEpoch(toISODate()));
  const [bowlCelebrating, setBowlCelebrating] = useState(false);
  const [pieceFlights, setPieceFlights] = useState<PieceFlight[]>([]);
  const [settlePieceIds, setSettlePieceIds] = useState<string[]>([]);
  const [settleHandoffs, setSettleHandoffs] = useState<Map<string, FlightHandoffVelocity>>(
    () => new Map()
  );
  const [isBowlOffscreen, setIsBowlOffscreen] = useState(false);
  const [bowlArrivalPulse, setBowlArrivalPulse] = useState(false);
  const bowlArrivalPulseTimerRef = useRef<number | null>(null);
  const [rolledOverHabits, setRolledOverHabits] = useState<string[]>(() =>
    loadStoredRolledOverHabits(getLocalDateString())
  );
  const settleTimersRef = useRef<Map<string, number>>(new Map());
  const [celebrationPieces, setCelebrationPieces] = useState<AccumulationPiece[] | null>(null);
  const bowlCelebrateLockRef = useRef(false);
  const pendingCycleResetRef = useRef<{ endIso: string; resetAt: number } | null>(null);

  const [evidenceList, setEvidenceList] = usePersistedState(
    loadStoredEvidence,
    (value) => writeJson(EVIDENCE_STORAGE_KEY, value),
    STORAGE_DEBOUNCE_MS
  );

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

  const CALENDAR_LAST_ACTIVE_KEY = 'ascend_last_active_date';

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
  const refetchHabitsAndLogsRef = useRef<() => Promise<void> | void>(() => {});
  /**
   * Missed-day processing gate, kept exactly as written before Step 6. Note it
   * is false for returning (onboarded) users, unlike every other sync gate.
   */
  const processMissedDays = !isOnboarded || onboardingStep >= 3;

  // Day rollover: decided by the pure computeDayRollover, applied here.
  useEffect(() => {
    const result = computeDayRollover({
      todayIso: currentDateString,
      lastActiveIso: readStorage(CALENDAR_LAST_ACTIVE_KEY),
      habits: habitsRef.current,
      momentumEvents: momentumEventsRef.current,
      protectionPaused: protectionPausedRef.current,
      processMissedDays,
    });
    writeStorage(CALENDAR_LAST_ACTIVE_KEY, result.lastActiveIso);
    if (result.clearActiveFallbacks) setActiveFallbackIds([]);
    if (result.graceHabitIds) {
      setRolledOverHabits(result.graceHabitIds);
      saveRolledOverHabits(currentDateString, result.graceHabitIds);
    }
    if (result.missed.length > 0) {
      const habitsById = new Map(habitsRef.current.map((habit) => [habit.id, habit]));
      const missedEvents = result.missed.flatMap(({ habitId, isoDate }) => {
        const habit = habitsById.get(habitId);
        return habit ? [createMomentumEvent(habit, 'missed', isoDate, endOfIsoDate(isoDate))] : [];
      });
      setMomentumEvents((prev) => mergeMomentumEvents(prev, missedEvents));
      // One request for every missed day, not one per event.
      void appendMomentumEventsRemote(sessionRef.current?.id, missedEvents).catch(() => {});
    }
    if (result.frictionPrompts.length > 0) {
      setPendingFriction((prev) => enqueueFrictionPrompts(prev, result.frictionPrompts));
    }
    if (result.dayChanged) void refetchHabitsAndLogsRef.current?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentDateString, processMissedDays]);
 
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

  const [momentumPulse, setMomentumPulse] = useState(0);

  useEffect(() => {
    const handleSyncComplete = () => {
      setMomentumPulse((n) => n + 1);
    };
    window.addEventListener('ascend_offline_sync_completed', handleSyncComplete);
    return () => {
      window.removeEventListener('ascend_offline_sync_completed', handleSyncComplete);
    };
  }, []);


  const handleToggleExamShield = useCallback(() => {
    // Turning it on asks for confirmation first; turning it off is immediate.
    if (examShieldActive) deactivateExamShield();
    else openModal({ kind: 'examShield' });
  }, [examShieldActive, deactivateExamShield, openModal]);
  const handleConfirmActivateExamShield = activateExamShield;




  useEffect(() => {
    const timer = window.setTimeout(() => {
      void hideNativeSplash().catch(() => {});
    }, 1500);
    return () => window.clearTimeout(timer);
  }, []);


  const selectedDay = currentDayIndex + 1;


  // Derive habit states (days, microDays) by replaying the append-only event log
  const derivedHabits = useMemo(() => {
    return deriveHabitsFromEventLog(habits, completionEvents, calendarOrigin);
  }, [habits, completionEvents, calendarOrigin]);

  // Non-archived habits for core active calculations
  const activeHabits = useMemo(() => {
    return derivedHabits.filter((h) => !h.archived);
  }, [derivedHabits]);
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
  const { morningHabits, nightHabits } = useHabits(activeHabits);

  const bowlWindow = useMemo(
    () => activeCycleWindow(cycleDays, bowlEpoch.startIso, toISODate(calendarOrigin)),
    [cycleDays, bowlEpoch.startIso, calendarOrigin]
  );

  /**
   * Theme only skins the bowl (morning glass + green vs night glass + blue).
   * Pieces are derived ONLY from habit_logs / local completionEvents in the active
   * cycle window. Un-swipe deletes the log row → this list recalculates and the
   * marble exits. momentum_events is never read or mutated here (append-only ledger).
   */
  const bowlPieces = useMemo(
    () =>
      accumulationPiecesFromLogs(
        completionEvents,
        activeHabits.map((habit) => habit.id),
        bowlWindow.startIso,
        bowlWindow.endIso,
        calendarOrigin,
        bowlEpoch.resetAt,
        activeHabits
      ),
    [
      completionEvents,
      activeHabits,
      bowlWindow.startIso,
      bowlWindow.endIso,
      calendarOrigin,
      bowlEpoch.resetAt,
    ]
  );

  const morningPieces = useMemo(() => {
    const morningIds = new Set(morningHabits.map((habit) => habit.id));
    return bowlPieces.filter((piece) => morningIds.has(piece.habitId));
  }, [bowlPieces, morningHabits]);
  const nightPieces = useMemo(() => {
    const nightIds = new Set(nightHabits.map((habit) => habit.id));
    return bowlPieces.filter((piece) => nightIds.has(piece.habitId));
  }, [bowlPieces, nightHabits]);
  const dualBowlFill = useMemo(
    () =>
      summarizeDualBowlFill(
        morningHabits.length,
        morningPieces.length,
        nightHabits.length,
        nightPieces.length,
        cycleDays
      ),
    [morningHabits.length, morningPieces.length, nightHabits.length, nightPieces.length, cycleDays]
  );

  const bowlFill = useMemo(
    () => summarizeBowlFill(activeHabits.length, bowlPieces.length, cycleDays),
    [activeHabits.length, bowlPieces.length, cycleDays]
  );

  // Bowl full → celebrate, archive cycle history, then reset epoch after pour-out.
  // Never touches Identity Ledger / momentum_events / habit_logs.
  useEffect(() => {
    if (bowlCelebrating || bowlCelebrateLockRef.current) return;
    if (bowlFill.capacity <= 0) return;
    if (bowlFill.votes < bowlFill.capacity) return;

    bowlCelebrateLockRef.current = true;
    setCelebrationPieces(bowlPieces);
    setBowlCelebrating(true);

    const entry = archiveCompletedCycle({
      cycleDays: bowlFill.cycleDays,
      startIso: bowlWindow.startIso,
      endIso: bowlWindow.endIso,
      votes: bowlFill.votes,
      capacity: bowlFill.capacity,
      fillPercent: bowlFill.fillPercent,
      isOverflowing: bowlFill.isOverflowing,
      morningVotes: dualBowlFill.morning.votes,
      nightVotes: dualBowlFill.night.votes,
    });
    pendingCycleResetRef.current = { endIso: bowlWindow.endIso, resetAt: entry.completedAt };
  }, [
    bowlFill.votes,
    bowlFill.capacity,
    bowlFill.cycleDays,
    bowlFill.fillPercent,
    bowlFill.isOverflowing,
    bowlCelebrating,
    bowlPieces,
    bowlWindow.startIso,
    bowlWindow.endIso,
    dualBowlFill.morning.votes,
    dualBowlFill.night.votes,
  ]);

  const handleBowlCelebrationDone = useCallback(() => {
    const pending = pendingCycleResetRef.current;
    if (pending) {
      setBowlEpoch(resetBowlCycleEpoch(pending.endIso, pending.resetAt));
      pendingCycleResetRef.current = null;
    } else {
      setBowlEpoch(readBowlCycleEpoch(toISODate(calendarOrigin)));
    }
    setCelebrationPieces(null);
    setBowlCelebrating(false);
    window.setTimeout(() => {
      bowlCelebrateLockRef.current = false;
    }, 400);
  }, [calendarOrigin]);

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

  // Rolling momentum from the append-only events log merged with live completion events.
  const todayMomentumEvents = useMemo(() => {
    const logEvents = momentumEventsFromCompletionLog(completionEvents, habits, calendarOrigin);
    return mergeMomentumEvents(momentumEvents, logEvents);
  }, [momentumEvents, completionEvents, habits, calendarOrigin]);

  const todayMomentumScore = useMemo(() => {
    return calculateMomentumScore(todayMomentumEvents, {
      habits,
      protectionWindows,
    });
  }, [todayMomentumEvents, habits, protectionWindows]);

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

  const completionEventsRef = useRef(completionEvents);
  const selectedInterestsRef = useRef(selectedInterests);
  const hasCompletedTutorialRef = useRef(hasCompletedTutorial);
  const momentumScoreRef = useRef(momentumScore);
  const hydratedUserIdRef = useRef<string | null>(null);
  completionEventsRef.current = completionEvents;
  selectedInterestsRef.current = selectedInterests;
  hasCompletedTutorialRef.current = hasCompletedTutorial;
  momentumScoreRef.current = todayMomentumScore;

  const runAuthenticatedSync = async (targetSession: UserSession) => {
    if (targetSession?.isGuest) {
      return { ok: false, error: 'Guest sessions stay local' };
    }
    const result = await syncAuthenticatedAccount({
      session: targetSession,
      habits: habitsRef.current,
      completionEvents: completionEventsRef.current,
      momentumEvents: momentumEventsRef.current,
      interests: selectedInterestsRef.current,
      hasCompletedTutorial:
        getLocalTutorialCompleted() || hasCompletedTutorialRef.current === true,
      momentumScore: momentumScoreRef.current,
      getLatestHabits: () => habitsRef.current,
    });
    // The user signed out or switched while this ran: never apply their data to the next state.
    if (sessionRef.current?.id !== targetSession.id) return result;
    setHabits((prev) => mergeHabitsByUpdatedAt(prev, result.habits));
    setCompletionEvents(result.completionEvents);

setMomentumEvents((prev) =>
  mergeMomentumEvents(prev, result.momentumEvents)
);
    if (result.ok) {
      hydratedUserIdRef.current = targetSession.id;
    }
    applySyncStatus(result.ok ? 'synced' : 'error');
    return result;
  };

  const refetchHabitsAndLogs = useCallback(async () => {
    const targetSession = sessionRef.current;
    if (targetSession && !targetSession.isGuest) {
      applySyncStatus('syncing');
      try {
        await runAuthenticatedSync(targetSession);
      } catch (err) {
        console.warn('Auto-reset sync failed:', err);
        applySyncStatus('error');
      }
    } else {
      const stored = loadStoredCompletionEventsOrNull();
      if (stored) setCompletionEvents(stored);
    }
  }, []);

  useEffect(() => {
    refetchHabitsAndLogsRef.current = refetchHabitsAndLogs;
  }, [refetchHabitsAndLogs]);

  // Guest → auth: hydrate profiles, habits, habit_logs, and momentum_history
  useEffect(() => {
    if (!session || session?.isGuest) {
      hydratedUserIdRef.current = null;
      return;
    }
    // Defer initial sync during onboarding until step 3
    if (!isOnboarded && onboardingStep < 3) return;
    let cancelled = false;
    void (async () => {
      applySyncStatus('syncing');
      try {
        const result = await runAuthenticatedSync(session);
        if (cancelled) return;
        applySyncStatus(result.ok ? 'synced' : 'error');
      } catch {
        if (!cancelled) applySyncStatus('error');
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.id, session?.isGuest, isOnboarded, onboardingStep]);

  useEffect(() => {
    if (!session || session?.isGuest) return;
    if (hydratedUserIdRef.current !== session.id) return;
    void persistHabitsToTable(session.id, habits).then((ok) => {
      if (!ok) applySyncStatus('error');
    }).catch(() => {
      applySyncStatus('error');
    });
  }, [habits, session?.id, session?.isGuest]);

  useEffect(() => {
    if (!session || session?.isGuest) return;
    if (hydratedUserIdRef.current !== session.id) return;
    void persistMomentumHistory(session.id, todayMomentumScore, todayDayIndex).catch(() => {});
  }, [todayMomentumScore, todayDayIndex, session?.id, session?.isGuest]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void publishWidgetSnapshot({
        todayDayIndex,
        origin: calendarOrigin,
        dark: isDark,
        momentumScore: todayMomentumScore,
        habits: activeHabits,
        reminders,
        momentumEvents,
        completionEvents,
        graceHabitIds: rolledOverHabits,
      });
    }, 400);
    return () => window.clearTimeout(timer);
  }, [
    todayMomentumScore,
    activeHabits,
    reminders,
    todayDayIndex,
    calendarOrigin,
    completionEvents,
    momentumEvents,
    isDark,
    rolledOverHabits,
  ]);

  const hasSession = Boolean(session);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void schedulePsychologyNotifications({
        // Nobody signed in: all windows off, which cancels the nudges.
        windows: hasSession ? notificationWindows : NO_NOTIFICATION_WINDOWS,
        habits: activeHabits,
        todayIndex: todayDayIndex,
        momentumScore: todayMomentumScore,
      });
    }, 500);
    return () => window.clearTimeout(timer);
  }, [hasSession, notificationWindows, activeHabits, todayDayIndex, todayMomentumScore, completionEvents]);

  useEffect(() => {
    if (!isOnboarded && onboardingStep < 3) return;
    void syncAllHabitTargetNotifications(habits, todayDayIndex, calendarOrigin);
  }, [habits, todayDayIndex, calendarOrigin, completionEvents, isOnboarded, onboardingStep]);

  // Cycle-window habit_logs hydrate (Home + any tab once signed in).
  // Range query is read-only — never resets bowlEpoch (celebration/rollover only).
  useEffect(() => {
    if (!session || session?.isGuest) return;
    // Defer heavy history parsing passes until after onboarding completes or reaches step 3
    if (!isOnboarded && onboardingStep < 3) return;
    const startIso = bowlWindow.startIso;
    const endIso = bowlWindow.endIso;
    if (!startIso || !endIso || startIso > endIso) return;

    let cancelled = false;
    void (async () => {
      const cycleLogs = await fetchHabitLogsForDateRange(session.id, startIso, endIso);
      if (cancelled) return;
      const userCycleLogs = omitDeletedHabitRefs(
        cycleLogs.filter((event) => !isSeedHabitId(event.habitId))
      );
      if (userCycleLogs.length > 0) {
        setCompletionEvents((prev) =>
          omitDeletedHabitRefs(
            mergeCompletionEvents(
              prev.filter((event) => !isSeedHabitId(event.habitId)),
              userCycleLogs,
              calendarOrigin
            )
          )
        );
      }
    })().catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [
    session?.id,
    session?.isGuest,
    bowlWindow.startIso,
    bowlWindow.endIso,
    calendarOrigin,
    isOnboarded,
    onboardingStep,
  ]);

  useEffect(() => {
    if (!session || session?.isGuest) return;
    // Defer friction audit parsing during initial onboarding
    if (!isOnboarded && onboardingStep < 3) return;
    let cancelled = false;
    void fetchFrictionReasonsFromTable(session.id).then((rows) => {
      if (cancelled || rows.length === 0) return;
      setFrictionAudits((prev) =>
        omitDeletedHabitRefs(mergeFrictionAuditsFromLogs(prev, rows, habitsRef.current)),
      );
    }).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [session?.id, session?.isGuest, isOnboarded, onboardingStep]);


  const appendMomentumLog = (event: MomentumEvent) => {
    setMomentumEvents((prev) => mergeMomentumEvents(prev, [event]));
    void appendMomentumEventRemote(sessionRef.current?.id, event).catch(() => {});
  };

  /** Local momentum rows awaiting remote flush — cleared on grace undo. */
  const pendingGraceMomentumRef = useRef(
    new Map<string, { event: MomentumEvent; timer: number }>()
  );

  const flushGraceMomentum = (habitId: string) => {
    const pending = pendingGraceMomentumRef.current.get(habitId);
    if (!pending) return;
    window.clearTimeout(pending.timer);
    pendingGraceMomentumRef.current.delete(habitId);
    void appendMomentumEventRemote(sessionRef.current?.id, pending.event).catch(() => {});
  };

  const cancelGraceMomentum = (habitId: string): boolean => {
    const pending = pendingGraceMomentumRef.current.get(habitId);
    if (!pending) return false;
    window.clearTimeout(pending.timer);
    pendingGraceMomentumRef.current.delete(habitId);
    setMomentumEvents((prev) => prev.filter((row) => row.id !== pending.event.id));
    return true;
  };

  /**
   * Grace rollover: log each habit as a 50% micro-habit on `dateIso`, in one
   * state update and one remote write per table.
   */
  const applyGraceRollover = useCallback(
    (targets: Habit[], dateIso: string) => {
      if (targets.length === 0) return;
      const dayIndex = dayIndexForIso(dateIso, calendarOrigin);
      const safeDayIndex = dayIndex >= 0 ? dayIndex : 2;
      const items = targets.map((targetHabit) => {
        const completionEvent: HabitCompletionEvent = withHabitTimeOfDay(
          {
            id: stableHabitLogId(targetHabit.id, dateIso),
            habitId: targetHabit.id,
            dayIndex: safeDayIndex,
            date: dateIso,
            type: 'fallback_micro',
            note: targetHabit.fallbackMicroHabit || 'Grace rollover (50% micro-habit)',
            timestamp: endOfIsoDate(dateIso) - 60_000,
          },
          targetHabit
        );
        const momentumEvent = createMomentumEvent(
          targetHabit,
          'fallback',
          dateIso,
          completionEvent.timestamp,
          habitWeight(targetHabit) * 0.5
        );
        const evidence: IdentityEvidence = {
          id: `ev-micro-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          habitId: targetHabit.id,
          habitName: targetHabit.name,
          identityStatement: `Micro-Habit rollover: ${targetHabit.name || 'Consistency preserved'}`,
          category: targetHabit.category || 'work',
          date: `${formatIsoShort(dateIso)} • Grace rollover (50%)`,
          dayNumber: safeDayIndex + 1,
          loggedDate: dateIso,
        };
        return { completionEvent, momentumEvent, evidence };
      });

      startTransition(() => {
        setCompletionEvents((prev) =>
          items.reduce((acc, item) => replaceTodayCompletion(acc, item.completionEvent, calendarOrigin), prev)
        );
        setMomentumEvents((prev) => mergeMomentumEvents(prev, items.map((item) => item.momentumEvent)));
        setEvidenceList((prev) =>
          items.reduce((acc, item) => upsertTodayEvidence(acc, item.evidence, dateIso, calendarOrigin), prev)
        );
        setMomentumPulse((n) => n + 1);
      });

      const userId = sessionRef.current?.id;
      void upsertHabitLogs(userId, items.map((item) => item.completionEvent)).catch(() => {});
      void appendMomentumEventsRemote(userId, items.map((item) => item.momentumEvent)).catch(() => {});
      try {
        void pulseCompletionHaptic('fallback');
      } catch {}
    },
    [calendarOrigin]
  );

  const handleRolloverAll = useCallback(() => {
    if (rolledOverHabits.length === 0) return;
    const yesterdayIso = addDaysIso(getLocalDateString(), -1);

    const habitsById = new Map(habits.map((habit) => [habit.id, habit]));
    applyGraceRollover(
      rolledOverHabits.flatMap((habitId) => habitsById.get(habitId) ?? []),
      yesterdayIso
    );

    setRolledOverHabits([]);
    saveRolledOverHabits(getLocalDateString(), []);
    setPendingFriction((prev) =>
      prev.filter((p) => !(rolledOverHabits.includes(p.habitId) && p.loggedDate === yesterdayIso))
    );
  }, [rolledOverHabits, habits, applyGraceRollover]);

  const handleFrictionRolloverMicro = useCallback(() => {
    const prompt = pendingFriction[0];
    if (!prompt) return;
    const targetHabit = habits.find((h) => h.id === prompt.habitId);
    applyGraceRollover(targetHabit ? [targetHabit] : [], prompt.loggedDate);
    markFrictionPrompted(prompt.habitId, prompt.loggedDate);
    setPendingFriction((prev) => prev.slice(1));
    setRolledOverHabits((prev) => {
      const next = prev.filter((id) => id !== prompt.habitId);
      saveRolledOverHabits(getLocalDateString(), next);
      return next;
    });
  }, [pendingFriction, habits, applyGraceRollover]);

  const activeFrictionPrompt = pendingFriction[0] ?? null;

  const handleAddManualVote = (habitName: string, identityStatement: string, category: HabitCategory) => {
    const newEv: IdentityEvidence = {
      id: 'ev-manual-' + Date.now(),
      habitId: 'manual',
      habitName,
      identityStatement,
      category,
      date: new Date().toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      }),
      dayNumber: selectedDay,
      loggedDate: toISODate(),
    };
    setEvidenceList((prev) => [newEv, ...prev]);
    appendMomentumLog(createMomentumEvent({ id: newMomentumEventId(), category }, 'full', toISODate(), Date.now()));
  };

  const handleFrictionSubmit = (reason: string) => {
    const prompt = pendingFriction[0];
    if (!prompt) return;
    markFrictionPrompted(prompt.habitId, prompt.loggedDate);
    setFrictionAudits((prev) => [createMissedFrictionAudit(prompt, reason), ...prev]);
    void persistHabitLogFrictionReason(sessionRef.current?.id, prompt.habitId, prompt.loggedDate, reason).catch(() => {});
    setPendingFriction((prev) => prev.slice(1));
  };

  const handleFrictionSkip = () => {
    const prompt = pendingFriction[0];
    if (!prompt) return;
    markFrictionPrompted(prompt.habitId, prompt.loggedDate);
    setPendingFriction((prev) => prev.slice(1));
  };

  // GESTURE / TAP ACTION: Complete Today (Full 100% or Fallback Micro 50%)
  const handleCompleteToday = (
    habitId: string,
    isFallback: boolean = false,
    originCoord?: { x: number; y: number; marbleColor?: string }
  ) => {
    if (!isViewingToday) return;
    const targetHabit = habits.find((h) => h.id === habitId);
    if (!targetHabit) return;
    // Off-day: schedule feature blocks completion (no ledger / momentum / pulse).
    if (!isHabitScheduledOnDayIndex(targetHabit, todayDayIndex, calendarOrigin)) return;

    // Explicit callback flag wins; activeFallbackIds covers mode-then-complete flow.
    const isMicro = Boolean(isFallback) || activeFallbackIds.includes(habitId);
    const loggedDate = toISODate(calendarOrigin);
    const alreadyCompletedToday = hasTodayLedgerEntry(completionEvents, habitId, loggedDate, calendarOrigin);
    const alreadyVotedMomentum = hasMomentumVoteOnIso(momentumEvents, habitId, loggedDate);

    setActiveFallbackIds((prev) => prev.filter((id) => id !== habitId));

    // Dynamic Cancellation: cancel today's scheduled notification immediately on completion.
    void cancelHabitTargetTimeNotification(habitId);

    const newEvent: HabitCompletionEvent = withHabitTimeOfDay(
      {
        id: stableHabitLogId(habitId, loggedDate),
        habitId,
        dayIndex: todayDayIndex,
        date: loggedDate,
        type: isMicro ? 'fallback_micro' : 'full',
        note: isMicro ? (targetHabit.fallbackMicroHabit || 'Fallback micro-habit completed') : undefined,
        timestamp: Date.now(),
      },
      targetHabit
    );

    const newEvidence: IdentityEvidence = {
      id: alreadyCompletedToday
        ? `ev-${habitId}-${loggedDate}`
        : `ev-${isMicro ? 'micro-' : ''}${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      habitId,
      habitName: isMicro ? `${targetHabit.name} (Micro-Habit)` : targetHabit.name,
      identityStatement: isMicro
        ? `Micro-Habit vote: ${targetHabit.name || 'Non-zero progress'}`
        : (targetHabit.name || 'Consistent and disciplined'),
      category: targetHabit.category || 'work',
      date: `${formatEvidenceDate()} • ${isMicro ? 'Fallback micro (50%)' : 'Completed (100%)'}`,
      dayNumber: todayDayIndex + 1,
      loggedDate,
    };

    let momentumEvent: MomentumEvent | null = null;
    if (!alreadyVotedMomentum) {
      const baseWeight = habitWeight(targetHabit);
      const eventWeight = isMicro ? baseWeight * 0.5 : baseWeight;
      momentumEvent = createMomentumEvent(
        targetHabit,
        isMicro ? 'fallback' : 'full',
        loggedDate,
        newEvent.timestamp,
        eventWeight
      );
      const existing = pendingGraceMomentumRef.current.get(habitId);
      if (existing) window.clearTimeout(existing.timer);
      const timer = window.setTimeout(() => flushGraceMomentum(habitId), 3000);
      pendingGraceMomentumRef.current.set(habitId, { event: momentumEvent, timer });
    }

    const newAudit: FrictionAudit | null = (isMicro && !alreadyCompletedToday)
      ? {
          id: `fa-${Date.now()}`,
          date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          dayNumber: todayDayIndex + 1,
          habitName: targetHabit.name,
          type: 'fallback_used',
          note: `Protected momentum with fallback: "${targetHabit.fallbackMicroHabit || '2-min minimum'}"`,
          timestamp: Date.now(),
        }
      : null;

    // Batch all commit state setters in a single transition to eliminate multi-pass rendering
    startTransition(() => {
      setActiveFallbackIds((prev) =>
        prev.includes(habitId) ? prev.filter((id) => id !== habitId) : prev
      );
      setCompletionEvents((prev) => replaceTodayCompletion(prev, newEvent, calendarOrigin));
      if (momentumEvent) {
        setMomentumEvents((prev) => mergeMomentumEvents(prev, [momentumEvent!]));
        setMomentumPulse((n) => n + 1);
      }
      setEvidenceList((evPrev) => upsertTodayEvidence(evPrev, newEvidence, loggedDate, calendarOrigin));
      if (newAudit) {
        setFrictionAudits((prevAudits) => [newAudit, ...prevAudits]);
      }
    });

    // Dynamic Cancellation & remote upsert (background)
    void cancelHabitTargetTimeNotification(habitId);
    void upsertHabitLog(session?.id, newEvent).catch(() => {});

    // Reward moment: haptic + optional chime immediately; piece flies card → bowl.
    // Does not touch momentum_events beyond the append above.
    if (!alreadyCompletedToday) {
      const rewardKind = isMicro ? 'fallback' : 'full';
      try {
        void pulseCompletionHaptic(rewardKind);
      } catch {
        /* never block completion on feedback failure */
      }
      const pieceId = `${habitId}::${loggedDate}`;
      try {
        const swipeDir = isMicro ? 'left' : 'right';
        const points = measureCompletionFlight(habitId, originCoord, isBowlOffscreen);
        const themeDark = getThemeIsDark();
        // Same isMicro boolean as habit_logs.type — light vs solid marble shade.
        const flightColor =
          originCoord?.marbleColor || getMarbleColor(themeDark, isMicro);
        const flight: PieceFlight = {
          id: `fly-${pieceId}-${Date.now()}`,
          pieceId,
          isFallback: isMicro,
          kind: rewardKind,
          from: points.from,
          to: points.to,
          isDark: themeDark,
          direction: swipeDir,
          color: flightColor,
          touchRatio: points.touchRatio,
        };
        setPieceFlights((prev) => [...prev.slice(-4), flight]);
      } catch {
        /* ignore measurement failures */
      }
    }
  };

  // GESTURE / TAP ACTION: Toggle Fallback Mode for Today (Does NOT mark complete; allows cancel / revert)
  const handleToggleFallbackMode = (habitId: string) => {
    if (!isViewingToday) return;
    const targetHabit = habits.find((h) => h.id === habitId);
    if (!targetHabit) return;
    if (!isHabitScheduledOnDayIndex(targetHabit, todayDayIndex, calendarOrigin) && !activeFallbackIds.includes(habitId)) {
      // Off day: no fallback.
      return;
    }

    if (activeFallbackIds.includes(habitId)) {
      startTransition(() => {
        setActiveFallbackIds((prev) => prev.filter((id) => id !== habitId));
      });
      return;
    }

    const loggedDate = toISODate(calendarOrigin);
    const alreadyLogged = completionEvents.some(
      (e) => e.habitId === habitId && resolveEventIsoDate(e, calendarOrigin) === loggedDate
    );

    startTransition(() => {
      if (alreadyLogged) {
        setCompletionEvents((prev) =>
          prev.filter((e) => !(e.habitId === habitId && resolveEventIsoDate(e, calendarOrigin) === loggedDate))
        );
      }
      setActiveFallbackIds((prev) => (prev.includes(habitId) ? prev : [...prev, habitId]));
    });

    if (alreadyLogged) {
      void deleteHabitLog(session?.id, habitId, loggedDate, todayDayIndex).catch(() => {});
    }
  };

  // GESTURE / TAP ACTION: Uncheck today. Daily habit_logs drop; momentum_events logs an append-only
  // reversal record if completion was already committed, rolling back momentum and identity votes.
  const handleResetToday = (habitId: string) => {
    if (!isViewingToday) return;
    const loggedDate = toISODate(calendarOrigin);
    const existingCompletion = completionEvents.find(
      (e) => e.habitId === habitId && resolveEventIsoDate(e, calendarOrigin) === loggedDate
    );
    const wasFallback = existingCompletion?.type === 'fallback_micro';
    const rolledBackMomentum = cancelGraceMomentum(habitId);

    const targetHabit = habits.find((h) => h.id === habitId);
    let reversalEvent: MomentumEvent | null = null;
    if (!rolledBackMomentum && targetHabit) {
      const baseWeight = habitWeight(targetHabit);
      const reversalWeight = wasFallback ? baseWeight * 0.5 : baseWeight;
      reversalEvent = createMomentumEvent(
        targetHabit,
        'reversal',
        loggedDate,
        Date.now(),
        reversalWeight
      );
    }

    startTransition(() => {
      setCompletionEvents((prev) =>
        prev.filter((e) => !(e.habitId === habitId && resolveEventIsoDate(e, calendarOrigin) === loggedDate))
      );
      setActiveFallbackIds((prev) =>
        prev.includes(habitId) ? prev.filter((id) => id !== habitId) : prev
      );
      setEvidenceList((prev) => removeTodayEvidence(prev, habitId, loggedDate, calendarOrigin));

      if (rolledBackMomentum) {
        setMomentumPulse((n) => n + 1);
      } else if (reversalEvent) {
        appendMomentumLog(reversalEvent);
        setMomentumPulse((n) => n + 1);
      }
    });


    void deleteHabitLog(session?.id, habitId, loggedDate, todayDayIndex).catch(() => {});

    // Reschedule daily notification when uncompleted
    if (targetHabit?.targetTime && !targetHabit.archived) {
      void scheduleHabitTargetTimeNotification(targetHabit);
    }
  };

  // Add new habit (optimistic). Remote insert is performed by AddHabitModal.
  const handleAddHabit = (newHabitData: Omit<Habit, 'id' | 'days' | 'microDays'>): Habit | null => {
    if (isAtActiveHabitCap(habits)) {
      return null;
    }
    const payload = newHabitData;
    const newHabit: Habit = {
      ...payload,
      id: typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : 'habit-' + Date.now(),
      days: [false, false, false, false, false, false, false],
      microDays: [false, false, false, false, false, false, false],
      scheduledDays: payload.scheduledDays && payload.scheduledDays.length > 0 ? payload.scheduledDays : [0, 1, 2, 3, 4, 5, 6],
      scheduleType: payload.scheduleType || 'daily',
      timeOfDay: resolveHabitTimeOfDay(payload),
      updatedAt: Date.now(),
    };
    setHabits((prev) => {
      const updatedPrev = payload.isKeystone
        ? prev.map((h) => (h.isKeystone ? touchHabit({ ...h, isKeystone: false }) : h))
        : prev;
      return [newHabit, ...updatedPrev];
    });
    if (newHabit.targetTime) {
      void scheduleHabitTargetTimeNotification(newHabit);
    }
    return newHabit;
  };

  // Archive habit
  const handleArchiveHabit = (habitId: string) => {
    setHabits((prev) =>
      prev.map((h) => (h.id === habitId ? touchHabit({ ...h, archived: true }) : h))
    );
    void cancelHabitTargetTimeNotification(habitId);
    closeModal('habitDetail', habitId);
  };

  // Restore archived habit
  const handleRestoreHabit = useCallback((habitId: string) => {
    setHabits((prev) => {
      const target = prev.find((habit) => habit.id === habitId);
      if (target?.archived && isAtActiveHabitCap(prev)) {
        return prev;
      }
      return prev.map((h) => {
        if (h.id === habitId) {
          const restored = touchHabit({ ...h, archived: false });
          if (restored.targetTime) {
            void scheduleHabitTargetTimeNotification(restored);
          }
          return restored;
        }
        return h;
      });
    });
  }, []);

  // Cascade delete habit via RPC and purge from local state
  const handleDeleteHabit = useCallback((habitId: string) => {
    void cancelHabitTargetTimeNotification(habitId);
    setHabits((prev) => prev.filter((habit) => habit.id !== habitId));
    setActiveFallbackIds((prev) => prev.filter((id) => id !== habitId));
    closeModal('habitDetail', habitId);
    void deleteHabit(habitId).catch(() => {});
  }, [closeModal]);

  // Update habit
  const handleUpdateHabit = (updatedHabit: Habit) => {
    const next = updatedHabit;
    setHabits((prev) =>
      prev.map((h) => {
        if (h.id === next.id) {
          return touchHabit(next);
        }
        if (next.isKeystone && h.isKeystone) {
          return touchHabit({ ...h, isKeystone: false });
        }
        return h;
      })
    );
    updateModal({ kind: 'habitDetail', habit: touchHabit(next) });
    if (next.targetTime && !next.archived) {
      const isCompletedToday = hasLogOn(completionEvents, next.id, currentDateString);
      if (!isCompletedToday) {
        void scheduleHabitTargetTimeNotification(next);
      } else {
        void cancelHabitTargetTimeNotification(next.id);
      }
    } else {
      void cancelHabitTargetTimeNotification(next.id);
    }
  };

  const handleToggleKeystone = (habitId: string, nextValue: boolean) => {
    setHabits((prev) =>
      prev.map((habit) => {
        if (habit.id === habitId) {
          return touchHabit({ ...habit, isKeystone: nextValue });
        }
        if (nextValue && habit.isKeystone) {
          return touchHabit({ ...habit, isKeystone: false });
        }
        return habit;
      })
    );
  };

  // Reset to an empty local workspace (no demo habits)
  const handleResetData = useCallback(() => {
    setHabits([]);
    setEvidenceList([]);
    setCompletionEvents([]);
    setMomentumEvents([]);
    setActiveFallbackIds([]);
    removeStorage(HABITS_STORAGE_KEY);
    removeStorage(EVIDENCE_STORAGE_KEY);
    removeStorage(COMPLETION_EVENTS_STORAGE_KEY);
    removeStorage(ACTIVE_FALLBACKS_STORAGE_KEY);
    localStorage.removeItem(MOMENTUM_EVENTS_STORAGE_KEY);
    localStorage.removeItem('ascend_identity_vote_floor');
  }, []);

  // Import JSON backup
  const handleImportJSON = useCallback((
    importedHabits: Habit[],
    importedEvidence?: IdentityEvidence[],
    importedEvents?: HabitCompletionEvent[],
    importedMomentum?: MomentumEvent[]
  ) => {
    const userHabits = importedHabits.filter((habit) => !isSeedHabitId(habit.id));
    setHabits(userHabits);
    if (importedEvidence && Array.isArray(importedEvidence)) {
      setEvidenceList(importedEvidence.filter((item) => !isSeedHabitId(item.habitId)));
    }
    if (importedEvents && Array.isArray(importedEvents)) {
      setCompletionEvents(importedEvents.filter((event) => !isSeedHabitId(event.habitId)));
    }
    if (importedMomentum && Array.isArray(importedMomentum)) {
      setMomentumEvents((prev) =>
        mergeMomentumEvents(
          prev.filter((event) => !isSeedHabitId(event.habitId)),
          importedMomentum.filter((event) => !isSeedHabitId(event.habitId))
        )
      );
    } else if (importedEvents && Array.isArray(importedEvents)) {
      const userEvents = importedEvents.filter((event) => !isSeedHabitId(event.habitId));
      setMomentumEvents((prev) =>
        mergeMomentumEvents(
          prev.filter((event) => !isSeedHabitId(event.habitId)),
          momentumEventsFromCompletionLog(userEvents, userHabits)
        )
      );
    }
  }, []);

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
    if (isNewUser) {
      if (newSession?.isGuest) {
        setHabits((prev) => prev.filter((habit) => !isSeedHabitId(habit.id)));
        setCompletionEvents((prev) => prev.filter((event) => !isSeedHabitId(event.habitId)));
        setMomentumEvents((prev) => prev.filter((event) => !isSeedHabitId(event.habitId)));
        setEvidenceList((prev) => prev.filter((item) => !isSeedHabitId(item.habitId)));
      } else {
        setHabits([]);
        setCompletionEvents([]);
        setMomentumEvents([]);
        setEvidenceList([]);
      }
      startAsNewUser();
    } else {
      setHabits((prev) => prev.filter((habit) => !isSeedHabitId(habit.id)));
      setCompletionEvents((prev) => prev.filter((event) => !isSeedHabitId(event.habitId)));
      setMomentumEvents((prev) => prev.filter((event) => !isSeedHabitId(event.habitId)));
      setEvidenceList((prev) => prev.filter((item) => !isSeedHabitId(item.habitId)));
      startAsReturningUser();
    }
  };

  // RESET_ALL for the ledger state App still owns (moves into HabitLedgerProvider in step 7).
  useUserDataReset(() => {
    hydratedUserIdRef.current = null;
    for (const pending of pendingGraceMomentumRef.current.values()) window.clearTimeout(pending.timer);
    pendingGraceMomentumRef.current.clear();
    // The previous user's habit alarms must not keep firing on this device.
    for (const habit of habitsRef.current) void cancelHabitTargetTimeNotification(habit.id);
    setHabits([]);
    setCompletionEvents([]);
    setMomentumEvents([]);
    setEvidenceList([]);
    setFrictionAudits([]);
    setPendingFriction([]);
    setActiveFallbackIds([]);
    setRolledOverHabits([]);
    setBowlEpoch(readBowlCycleEpoch(toISODate()));
    setCelebrationPieces(null);
    setBowlCelebrating(false);
    setPieceFlights([]);
    setChronicleVersion((v) => v + 1);
  });

  derivedHabitsRef.current = derivedHabits;
  todayDayIndexRef.current = todayDayIndex;
  handleCompleteTodayRef.current = handleCompleteToday;
  handleResetTodayRef.current = handleResetToday;
  handleToggleFallbackModeRef.current = handleToggleFallbackMode;
  handleToggleKeystoneRef.current = handleToggleKeystone;

  const deferredPieceIds = useMemo(
    () => new Set(pieceFlights.map((flight) => flight.pieceId)),
    [pieceFlights]
  );
  const settlePieceIdSet = useMemo(() => new Set(settlePieceIds), [settlePieceIds]);

  const handlePieceFlightComplete = useCallback(
    (flightId: string, pieceId: string, handoff: FlightHandoffVelocity) => {
      void pulseCompletionHaptic('fallback');
      // Pulse floating overlay on marble arrival
      setBowlArrivalPulse(true);
      if (bowlArrivalPulseTimerRef.current) window.clearTimeout(bowlArrivalPulseTimerRef.current);
      bowlArrivalPulseTimerRef.current = window.setTimeout(() => setBowlArrivalPulse(false), 600);
      // Same React batch: mount bowl marble at rim with V_terminal, then unmount overlay
      setSettleHandoffs((prev) => {
        const next = new Map(prev);
        next.set(pieceId, handoff);
        return next;
      });
      setSettlePieceIds((prev) => (prev.includes(pieceId) ? prev : [...prev, pieceId]));
      setPieceFlights((prev) => prev.filter((flight) => flight.id !== flightId));
      const existing = settleTimersRef.current.get(pieceId);
      if (existing) window.clearTimeout(existing);
      const timer = window.setTimeout(() => {
        settleTimersRef.current.delete(pieceId);
        setSettlePieceIds((prev) => prev.filter((id) => id !== pieceId));
        setSettleHandoffs((prev) => {
          if (!prev.has(pieceId)) return prev;
          const next = new Map(prev);
          next.delete(pieceId);
          return next;
        });
      }, 800);
      settleTimersRef.current.set(pieceId, timer);
    },
    []
  );

  useEffect(
    () => () => {
      for (const timer of settleTimersRef.current.values()) window.clearTimeout(timer);
      settleTimersRef.current.clear();
    },
    []
  );

  const stableCompleteToday = useCallback(
    (
      habitId: string,
      isFallback?: boolean,
      originCoord?: { x: number; y: number; marbleColor?: string }
    ) => {
      handleCompleteTodayRef.current(habitId, isFallback, originCoord);
    },
    []
  );
  const stableResetToday = useCallback((habitId: string) => {
    handleResetTodayRef.current(habitId);
  }, []);
  const stableToggleFallbackMode = useCallback((habitId: string) => {
    handleToggleFallbackModeRef.current(habitId);
  }, []);
  const stableToggleKeystone = useCallback((habitId: string, next: boolean) => {
    handleToggleKeystoneRef.current(habitId, next);
  }, []);
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


  useEffect(() => {
    let cancelled = false;

    const applyAction = (action: WidgetPendingAction) => {
      if (!action?.id) return;
      const completed = Boolean(action.completed);
      if (action.type === 'reminder') {
        handleSetReminderCompleted(action.id, completed);
        return;
      }
      if (action.type !== 'habit') return;
      const already = hasLogOn(completionEventsRef.current, action.id, currentDateString);
      if (completed && !already) handleCompleteTodayRef.current(action.id, false);
      if (!completed && already) handleResetTodayRef.current(action.id);
    };

    const applyRoute = (route: WidgetRoute | null) => {
      if (!route) return;
      if (route.tab === 'report') setActiveTab('report');
      if (route.tab === 'reminders') {
        setActiveTab('reminders');
        if (route.reminderId) focusReminder(route.reminderId);
        if (route.openCreate) setOpenCreateTask(true);
      }
      if (route.tab === 'home') {
        setActiveTab('home');
        if (route.openCreate && !isAtActiveHabitCap(habitsRef.current)) openModal({ kind: 'addHabit' });
        if (route.habitId) {
          const habit = derivedHabitsRef.current.find((item) => item.id === route.habitId);
          if (habit) openModal({ kind: 'habitDetail', habit });
        }
      }
      if (route.tab === 'ledger') {
        setActiveTab('personal');
        openModal({ kind: 'identityLedger' });
      }
    };

    const drain = async () => {
      const [actions, launch] = await Promise.all([consumeWidgetActions(), readLaunchWidgetRoute()]);
      if (cancelled) return;
      actions.forEach(applyAction);
      applyRoute(launch);
    };

    void drain();
    void CapacitorApp.getLaunchUrl().then((launch) => {
      if (!cancelled && launch?.url) {
        applyRoute(parseWidgetRoute(launch.url));
      }
    });

    const actionSub = WidgetBridge.addListener('widgetAction', applyAction);
    const linkSub = WidgetBridge.addListener('deepLink', (data) => applyRoute(parseWidgetRoute(data.url)));
    const appUrlSub = CapacitorApp.addListener('appUrlOpen', (data) => {
      if (data?.url) {
        applyRoute(parseWidgetRoute(data.url));
      }
    });

    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        window.setTimeout(() => {
          void drain();
        }, 150);
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
      void Promise.resolve(actionSub).then((sub) => sub.remove());
      void Promise.resolve(linkSub).then((sub) => sub.remove());
      void Promise.resolve(appUrlSub).then((sub) => sub.remove());
    };
  }, []);

  const handleOpenCreateConsumed = useCallback(() => setOpenCreateTask(false), [setOpenCreateTask]);

  const handlePersonalSyncNow = useCallback(async () => {
    const target = sessionRef.current;
    if (!target || target.isGuest) {
      throw new Error('Please sign in to sync');
    }
    const result = await runAuthenticatedSync(target);
    if (!result.ok) {
      throw new Error(result.error || 'Sync failed');
    }
  }, []);

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
          setIsBowlOffscreen((prev) => (prev !== isOff ? isOff : prev));
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
      setIsBowlOffscreen(false);
      return;
    }

    const checkBowlVisibility = () => {
      const frame = document.getElementById('accumulation-bowl-frame');
      const root = document.getElementById('app-main-content');
      if (!frame || !root) return;
      const r = frame.getBoundingClientRect();
      const rootRect = root.getBoundingClientRect();
      const isOff = r.bottom <= rootRect.top + 20;
      setIsBowlOffscreen((prev) => (prev !== isOff ? isOff : prev));
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
        setIsBowlOffscreen((prev) => (prev !== isOff ? isOff : prev));
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
              pieces={celebrationPieces ?? bowlPieces}
              bowlFill={bowlFill}
              momentumScore={todayMomentumScore}
              momentumPulse={momentumPulse}
              onCycleDaysChange={handleCycleDaysChange}
              celebrating={bowlCelebrating}
              onCelebrationDone={handleBowlCelebrationDone}
              deferredPieceIds={deferredPieceIds}
              settlePieceIds={settlePieceIdSet}
              settleHandoffs={settleHandoffs}
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
                cycleStartIso={bowlEpoch.startIso}
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
                onResetData={handleResetData}
                onRestoreHabit={handleRestoreHabit}
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


        <FlyingPieceOverlay flights={pieceFlights} onFlightComplete={handlePieceFlightComplete} />
        <ScrolledBowlOverlay
          isVisible={isTabActive('home') && isBowlOffscreen && !longPressedHabitId && !isAnyModalOpen}
          votes={bowlFill.votes}
          capacity={bowlFill.capacity}
          fillPercent={bowlFill.fillPercent}
          hasActiveFlight={pieceFlights.length > 0}
          isPulsing={bowlArrivalPulse}
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
          onAddHabit={handleAddHabit}
          onUpdateHabit={handleUpdateHabit}
          onArchiveHabit={handleArchiveHabit}
          onDeleteHabit={handleDeleteHabit}
          frictionPrompt={activeFrictionPrompt}
          onFrictionSubmit={handleFrictionSubmit}
          onFrictionSkip={handleFrictionSkip}
          onFrictionRolloverMicro={handleFrictionRolloverMicro}
          onChronicleSave={handleChronicleSave}
          ledgerEvidence={ledgerEvidence}
          identityVoteCount={displayedIdentityVotes}
          onAddManualVote={handleAddManualVote}
          examShieldStatus={examShieldStatus}
          onConfirmActivateExamShield={handleConfirmActivateExamShield}
        />

      </div>
    </div>
  );
}
