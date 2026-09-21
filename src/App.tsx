import React, { useState, useEffect, useMemo, useRef, useCallback, Suspense } from 'react';
import { Plus } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useKeyboardInset } from './hooks/useKeyboardInset';
import { useAnyModalOpen, useKeyboardVisible } from './hooks/useKeyboardVisible';
import { tapPress } from './lib/motionPresets';
import { MotionModal } from './components/MotionModal';
import {
  Habit,
  IdentityEvidence,
  ActiveTab,
  StandaloneReminder,
  UserSession,
  ThemeMode,
  FrictionAudit,
  HabitCompletionEvent,
  MomentumEvent,
} from './types';
import { isSeedHabitId } from './data/initialHabits';
import {
  calculateMomentumScore,
  collectMissedMomentumEvents,
  createMomentumEvent,
  habitWeight,
  deriveHabitsFromEventLog,
  mergeCompletionEvents,
  mergeMomentumEvents,
  momentumEventsFromCompletionLog,
  newMomentumEventId,
  resolveMomentumEventDate,
  upsertHabitLog,
  deleteHabitLog,
} from './utils/momentum';
import { appendMomentumEventRemote, fetchMomentumEventsFromTable, loadLocalMomentumEvents, MOMENTUM_EVENTS_STORAGE_KEY, saveLocalMomentumEvents } from './lib/momentumEvents';
import {
  addDaysIso,
  diffDaysIso,
  endOfIsoDate,
  formatEvidenceDate,
  getTodayDayIndex,
  getWeekDates,
  isIsoDate,
  parseIsoDateParts,
  resolveEventIsoDate,
  startOfDay,
  toISODate,
} from './utils/dates';
import { isHabitScheduledOnDayIndex, isHabitScheduledOnIso, scheduledHabitsForDayIndex } from './utils/schedule';
import { habitCategoryBadge, normalizeHabitCategory } from './utils/categories';
import { applyNativeChrome, hideNativeSplash } from './lib/nativeChrome';
import {
  getStoredSession,
  setStoredSession,
  isOnboardingCompleted,
  setOnboardingCompleted,
  authService,
  supabase,
  isSupabaseConfigured,
  generateAvatarUrl,
  notificationScheduler,
  remindersSyncService,
  upsertPublicReminder,
} from './lib/supabase';
import { fetchUserProfile, persistUserProfile, setLocalTutorialCompleted, getLocalTutorialCompleted, resolveTutorialCompleted } from './lib/profile';
import { persistStoredAvatarId, readStoredAvatarId, resolveAvatarId } from './data/avatars';
import { persistHabitsToTable, persistMomentumHistory, syncAuthenticatedAccount } from './lib/accountSync';
import { mergeHabitsByUpdatedAt, mergeRemindersByUpdatedAt, touchHabit } from './lib/syncMerge';
import { fetchActiveHabits, fetchHabitLogsForDateRange, purgeSeedHabitsFromTable, persistHabitLogFrictionReason, fetchFrictionReasonsFromTable, omitDeletedHabitRefs, omitDeletedHabits, rememberDeletedHabit } from './lib/habitsApi';
import {
  destroyAscendSpotlightTutorial,
  hasScreenTutorialCompleted,
  markScreenTutorialCompleted,
  startAscendSpotlightTutorial,
  startScreenTutorial,
  type TutorialScreen,
} from './lib/tutorial';
import {
  hydrateNotificationWindows,
  initializeReminderNotifications,
  loadNotificationWindows,
  persistNotificationWindows,
  reminderNotificationIds,
  requestNotificationPermissions,
  schedulePsychologyNotifications,
  weekdayFromIsoDate,
  withReminderNotificationIds,
  type NotificationWindowKey,
  type PsychologyNotificationWindows,
} from './lib/notifications';
import { ledgerEvidenceForHabits, displayedIdentityVoteCount, hasMomentumVoteOnIso, hasTodayLedgerEntry, removeTodayEvidence, replaceTodayCompletion, upsertTodayEvidence } from './services/ledgerService';
import { deleteHabit, stableHabitLogId } from './services/habitService';
import {
  accumulationPiecesFromLogs,
  activeCycleWindow,
  archiveCompletedCycle,
  clampCycleDays,
  persistCycleDays,
  readBowlCycleEpoch,
  readCycleHistory,
  readStoredCycleDays,
  resetBowlCycleEpoch,
  summarizeDualBowlFill,
  summarizeBowlFill,
  type CompletedCycleSummary,
  type CycleDays,
  type AccumulationPiece,
} from './services/reportService';
import { HomeView } from './components/HomeView';
import { useHabits, withHabitTimeOfDay } from './hooks/useHabits';
import { hydrateHabitTimeOfDay, resolveHabitTimeOfDay } from './utils/timeOfDay';
import { consumeWidgetActions, parseWidgetRoute, publishWidgetSnapshot, readLaunchWidgetRoute } from './lib/widgetSync';
import { WidgetBridge } from './lib/widgetBridge';
import type { WidgetPendingAction, WidgetRoute } from './lib/widgetSync';
import {
  countActiveHabits,
  getExamShieldStatus,
  getVacationStatus,
  isAtActiveHabitCap,
  loadProtectionState,
  saveProtectionState,
  tickProtectionState,
  toggleExamShield,
  toggleVacation,
} from './lib/protection';
import { canEnableKeystone, countActiveKeystones, MAX_KEYSTONE_HABITS } from './lib/keystone';
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
import { FriendsFeed } from './components/FriendsFeed';
import { ScreenHeader, SCREEN_INSET_CLASS, HEADER_ICON_BTN_CLASS } from './components/ScreenHeader';
import { TabLoadingFallback } from './components/TabLoadingFallback';

const AddHabitModal = React.lazy(() => import('./components/AddHabitModal').then((m) => ({ default: m.AddHabitModal })));
const HabitDetailModal = React.lazy(() => import('./components/HabitDetailModal').then((m) => ({ default: m.HabitDetailModal })));
const DeleteHabitConfirmModal = React.lazy(() => import('./components/DeleteHabitConfirmModal').then((m) => ({ default: m.DeleteHabitConfirmModal })));
const IdentityLedgerModal = React.lazy(() => import('./components/IdentityLedgerModal').then((m) => ({ default: m.IdentityLedgerModal })));
const FrictionAuditModal = React.lazy(() => import('./components/FrictionAuditModal').then((m) => ({ default: m.FrictionAuditModal })));
const AuthView = React.lazy(() => import('./components/AuthView').then((m) => ({ default: m.AuthView })));
const OnboardingView = React.lazy(() => import('./components/OnboardingView').then((m) => ({ default: m.OnboardingView })));
const RemindersView = React.lazy(() => import('./components/RemindersView').then((m) => ({ default: m.RemindersView })));
const ReportView = React.lazy(() => import('./components/ReportView').then((m) => ({ default: m.ReportView })));
const PersonalView = React.lazy(() => import('./components/PersonalView').then((m) => ({ default: m.PersonalView })));
const SettingsView = React.lazy(() => import('./components/SettingsView').then((m) => ({ default: m.SettingsView })));
import { ErrorBoundary } from './components/ErrorBoundary';
import { HabitLongPressOverlay } from './components/HabitLongPressOverlay';
import {
  FlyingPieceOverlay,
  measureCompletionFlight,
  type PieceFlight,
} from './components/FlyingPieceOverlay';
import {
  isCompletionSoundEnabled,
  isHapticVibrationEnabled,
  playCompletionReward,
  pulseCompletionHaptic,
  setCompletionSoundEnabled,
  setHapticVibrationEnabled,
} from './lib/completionFeedback';

const APP_TABS: readonly ActiveTab[] = ['home', 'reminders', 'report', 'personal', 'settings'];

function resolveActiveTab(tab: ActiveTab | string | null | undefined): ActiveTab {
  return APP_TABS.includes(tab as ActiveTab) ? (tab as ActiveTab) : 'home';
}

/** Tab pane visibility classes — maintains active tab DOM instances in memory for 0ms switching. */
function tabPaneClassName(isActive: boolean, extra = ''): string {
  return `absolute inset-0 tab-pane gpu-smooth ${isActive ? 'tab-pane-active' : 'tab-pane-cached'}${extra ? ` ${extra}` : ''}`;
}

export default function App() {
  useKeyboardInset(true);
  const isKeyboardOpen = useKeyboardVisible();
  const isAnyModalOpen = useAnyModalOpen();
  // Authentication & Session State
  const [session, setSession] = useState<UserSession | null>(() => {
    const stored = getStoredSession();
    // Guest sessions are retired — require real auth before Home.
    if (stored?.isGuest || stored?.id?.startsWith('guest_')) {
      try {
        setStoredSession(null);
      } catch {
        // ignore
      }
      return null;
    }
    if (stored) {
      return { ...stored, syncStatus: stored.syncStatus === 'error' ? 'error' : 'syncing' };
    }
    return null;
  });
  const sessionRef = useRef<UserSession | null>(session);
  sessionRef.current = session;
  const derivedHabitsRef = useRef<Habit[]>([]);
  const todayDayIndexRef = useRef(3);
  const handleCompleteTodayRef = useRef<(habitId: string, isFallback?: boolean) => void>(() => {});
  const handleResetTodayRef = useRef<(habitId: string) => void>(() => {});
  const handleToggleFallbackModeRef = useRef<(habitId: string) => void>(() => {});
  const handleToggleKeystoneRef = useRef<(habitId: string, next: boolean) => void>(() => {});
  const handleSetReminderCompletedRef = useRef<(id: string, completed: boolean) => void>(() => {});
  const handleToggleReminderRef = useRef<(id: string) => void>(() => {});
  const handleDeleteReminderRef = useRef<(id: string) => void>(() => {});
  const handleSnoozeReminderRef = useRef<(id: string, minutes: number) => void>(() => {});
  const [isOnboarded, setIsOnboarded] = useState<boolean>(() => isOnboardingCompleted());

  // Theme state ('light' | 'dark' | 'system')
  const [theme, setTheme] = useState<ThemeMode>(() => {
    try {
      const saved = localStorage.getItem('ascend_theme') as ThemeMode;
      if (saved === 'light' || saved === 'dark' || saved === 'system') return saved;
    } catch {}
    return 'light';
  });

  const [systemPrefersDark, setSystemPrefersDark] = useState<boolean>(() => {
    try {
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    } catch {
      return false;
    }
  });
  const isDark = theme === 'dark' || (theme === 'system' && systemPrefersDark);

  useEffect(() => {
    try {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      const onChange = (e: MediaQueryListEvent) => setSystemPrefersDark(e.matches);
      mq.addEventListener('change', onChange);
      return () => mq.removeEventListener('change', onChange);
    } catch {}
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
    document.documentElement.style.colorScheme = isDark ? 'dark' : 'light';
  }, [isDark]);

  const [protection, setProtection] = useState(() => loadProtectionState());
  const examShieldActive = protection.examShield.active;
  const vacationModeActive = protection.vacation.active;
  const examShieldStatus = getExamShieldStatus(protection);
  const vacationStatus = getVacationStatus(protection);

  const examShieldRef = useRef(examShieldActive);
  const vacationModeRef = useRef(vacationModeActive);
  const habitsRef = useRef<Habit[]>([]);
  const momentumEventsRef = useRef<MomentumEvent[]>([]);
  examShieldRef.current = examShieldActive;
  vacationModeRef.current = vacationModeActive;

  useEffect(() => {
    saveProtectionState(protection);
  }, [protection]);

  const [notificationWindows, setNotificationWindows] = useState<PsychologyNotificationWindows>(
    () => loadNotificationWindows()
  );

  useEffect(() => {
    let cancelled = false;
    void hydrateNotificationWindows().then((windows) => {
      if (!cancelled) setNotificationWindows(windows);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleToggleNotificationWindow = (key: NotificationWindowKey) => {
    setNotificationWindows((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      void persistNotificationWindows(next);
      return next;
    });
  };

  // Selected personal interests state (presets) - powers Home quotes
  const [selectedInterests, setSelectedInterests] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('ascend_personal_interests');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed.filter((item): item is string => typeof item === 'string');
        }
      }
    } catch {}
    return ['Movies', 'Books', 'Anime', 'Running'];
  });

  useEffect(() => {
    try {
      localStorage.setItem('ascend_personal_interests', JSON.stringify(selectedInterests));
    } catch {}
  }, [selectedInterests]);

  const handleToggleInterest = (interest: string) => {
    setSelectedInterests((prev) => {
      const next = prev.includes(interest) ? prev.filter((t) => t !== interest) : [...prev, interest];
      if (session && !session.isGuest) {
        void persistUserProfile(session, { interests: next }).catch(() => {});
      }
      return next;
    });
  };

  // Friction Audit Log state
  const [frictionAudits, setFrictionAudits] = useState<FrictionAudit[]>(() => {
    try {
      const saved = localStorage.getItem('ascend_friction_audits');
      if (saved) return omitDeletedHabitRefs(JSON.parse(saved) as FrictionAudit[]);
    } catch {}
    return [];
  });

  const [pendingFriction, setPendingFriction] = useState<PendingFrictionPrompt[]>(() => loadPendingFrictionPrompts());

  // Persistence via localStorage for habits
  const [habits, setHabits] = useState<Habit[]>(() => {
    try {
      const saved = localStorage.getItem('habit_tracker_habits');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (!Array.isArray(parsed)) return [];
        return omitDeletedHabits(
          parsed
            .filter((h: Habit) => h && typeof h === 'object' && !isSeedHabitId(h.id))
            .map((h: Habit) => {
              const category = normalizeHabitCategory(h.category);
              const days = Array.isArray(h.days) ? h.days : [false, false, false, false, false, false, false];
              const microDays = Array.isArray(h.microDays)
                ? h.microDays
                : [false, false, false, false, false, false, false];
              return hydrateHabitTimeOfDay({
                ...h,
                category,
                days,
                microDays,
                tags: [habitCategoryBadge(category)],
              });
            }),
        );
      }
    } catch {}
    return [];
  });

  // Append-only immutable completion event log (ground truth for habit history)
  const [completionEvents, setCompletionEvents] = useState<HabitCompletionEvent[]>(() => {
    try {
      const saved = localStorage.getItem('ascend_completion_events');
      if (saved) {
        const parsed = JSON.parse(saved) as HabitCompletionEvent[];
        return omitDeletedHabitRefs(parsed.filter((event) => !isSeedHabitId(event.habitId)));
      }
    } catch {}
    return [];
  });

  const [momentumEvents, setMomentumEvents] = useState<MomentumEvent[]>(() => {
    const stored = loadLocalMomentumEvents();
    if (stored) {
      return omitDeletedHabitRefs(stored.filter((event) => !isSeedHabitId(event.habitId)));
    }
    try {
      const saved = localStorage.getItem('ascend_completion_events');
      const logs: HabitCompletionEvent[] = saved ? JSON.parse(saved) : [];
      const userLogs = omitDeletedHabitRefs(logs.filter((event) => !isSeedHabitId(event.habitId)));
      let seedHabits: Habit[] = [];
      try {
        const habitSaved = localStorage.getItem('habit_tracker_habits');
        if (habitSaved) {
          seedHabits = omitDeletedHabits(
            (JSON.parse(habitSaved) as Habit[]).filter((habit) => !isSeedHabitId(habit.id)),
          );
        }
      } catch {}
      return momentumEventsFromCompletionLog(userLogs, seedHabits);
    } catch {
      return [];
    }
  });
  momentumEventsRef.current = momentumEvents;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        localStorage.setItem('ascend_completion_events', JSON.stringify(completionEvents));
      } catch {}
    }, 320);
    return () => window.clearTimeout(timer);
  }, [completionEvents]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      saveLocalMomentumEvents(momentumEvents);
    }, 320);
    return () => window.clearTimeout(timer);
  }, [momentumEvents]);

  // Hydrate profile interests + tutorial flag from Supabase `profiles`
  useEffect(() => {
    if (!session) {
      destroyAscendSpotlightTutorial();
      setHasCompletedTutorial(getLocalTutorialCompleted() ? true : null);
      tutorialLockRef.current = false;
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
        setSession((prev) => {
          if (!prev) return prev;
          const next = { ...prev, avatarUrl };
          setStoredSession(next);
          return next;
        });
      }
      setHasCompletedTutorial(resolveTutorialCompleted(profile.has_completed_tutorial));
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.id, session?.isGuest]);

  // Active fallback mode for habits today (habits switched to fallback micro-task, pending completion)
  const [activeFallbackIds, setActiveFallbackIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('ascend_active_fallbacks');
      if (saved) return JSON.parse(saved);
    } catch {}
    return [];
  });

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        localStorage.setItem('ascend_active_fallbacks', JSON.stringify(activeFallbackIds));
      } catch {}
    }, 320);
    return () => window.clearTimeout(timer);
  }, [activeFallbackIds]);

  const [cycleDays, setCycleDays] = useState<CycleDays>(() => readStoredCycleDays());
  const [bowlEpoch, setBowlEpoch] = useState(() => readBowlCycleEpoch(toISODate()));
  const [cycleHistory, setCycleHistory] = useState<CompletedCycleSummary[]>(() => readCycleHistory());
  const [bowlCelebrating, setBowlCelebrating] = useState(false);
  const [pieceFlights, setPieceFlights] = useState<PieceFlight[]>([]);
  const [settlePieceIds, setSettlePieceIds] = useState<string[]>([]);
  const [completionSound, setCompletionSound] = useState(() => isCompletionSoundEnabled());
  const [hapticVibration, setHapticVibration] = useState(() => isHapticVibrationEnabled());
  const settleTimersRef = useRef<Map<string, number>>(new Map());
  const [celebrationPieces, setCelebrationPieces] = useState<AccumulationPiece[] | null>(null);
  const bowlCelebrateLockRef = useRef(false);
  const pendingCycleResetRef = useRef<{ endIso: string; resetAt: number } | null>(null);

  const handleCycleDaysChange = (days: CycleDays) => {
    const next = clampCycleDays(days);
    persistCycleDays(next);
    setCycleDays(next);
  };

  const [evidenceList, setEvidenceList] = useState<IdentityEvidence[]>(() => {
    try {
      const saved = localStorage.getItem('habit_tracker_evidence');
      if (saved) {
        const parsed = JSON.parse(saved) as IdentityEvidence[];
        return parsed
          .filter((item) => !isSeedHabitId(item.habitId))
          .map((item) => ({
          ...item,
          category: normalizeHabitCategory(item.category),
        }));
      }
    } catch {}
    return [];
  });

  // Standalone Reminders / Tasks — clean slate (no demo seed rows).
  const [reminders, setReminders] = useState<StandaloneReminder[]>(() => {
    try {
      const saved = localStorage.getItem('habit_tracker_reminders');
      if (saved) {
        const parsed = JSON.parse(saved) as StandaloneReminder[];
        if (Array.isArray(parsed)) {
          const SEED_REMINDER_IDS = new Set(['rem-1', 'rem-2']);
          return parsed
            .filter((item) => item && !SEED_REMINDER_IDS.has(String(item.id)))
            .map(withReminderNotificationIds);
        }
      }
    } catch {}
    return [];
  });

  // Reminders persist via the debounced effect below (avoid duplicate sync writes).

  const [activeTab, setActiveTab] = useState<ActiveTab>('home');
  const [viewResetKey, setViewResetKey] = useState(0);
  const safeActiveTab = resolveActiveTab(activeTab);

  useEffect(() => {
    if (activeTab !== safeActiveTab) setActiveTab(safeActiveTab);
  }, [activeTab, safeActiveTab]);

  const isTabActive = useCallback((tab: ActiveTab) => safeActiveTab === tab, [safeActiveTab]);
  const [visitedTabs, setVisitedTabs] = useState<Set<ActiveTab>>(() => new Set(['home']));

  useEffect(() => {
    setVisitedTabs((prev) => {
      if (prev.has(safeActiveTab)) return prev;
      const next = new Set(prev);
      next.add(safeActiveTab);
      return next;
    });
  }, [safeActiveTab]);

  const CALENDAR_LAST_ACTIVE_KEY = 'ascend_last_active_date';

  const [calendarOrigin, setCalendarOrigin] = useState<Date>(() => {
    try {
      const saved = localStorage.getItem('ascend_last_active_date');
      if (saved && isIsoDate(saved)) {
        const parts = parseIsoDateParts(saved);
        if (parts) {
          return startOfDay(new Date(parts.year, parts.month - 1, parts.day));
        }
      }
    } catch {}
    return startOfDay(new Date());
  });
  const [currentSelectedDate, setCurrentSelectedDate] = useState<string>(() => toISODate());
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  useEffect(() => {
    (window as any).__setCalendarOrigin = (target: Date | string) => {
      let d: Date;
      if (typeof target === 'string') {
        const parts = parseIsoDateParts(target);
        d = parts ? new Date(parts.year, parts.month - 1, parts.day) : new Date(target);
      } else {
        d = target;
      }
      setCalendarOrigin(startOfDay(d));
    };
    return () => {
      delete (window as any).__setCalendarOrigin;
    };
  }, []);

  useEffect(() => {
    const rollForwardIfMidnightPassed = () => {
      const nowIso = toISODate();
      const originIso = toISODate(calendarOrigin);
      if (nowIso === originIso) {
        try {
          localStorage.setItem(CALENDAR_LAST_ACTIVE_KEY, nowIso);
        } catch {}
        return;
      }

      setProtection((prev) => tickProtectionState(prev, nowIso));

      const dayDiff = diffDaysIso(originIso, nowIso);
      if (dayDiff > 0) {
        let runningEvents = momentumEventsRef.current;
        const accumulatedMissed: MomentumEvent[] = [];
        const accumulatedPrompts: { habitId: string; habitName: string; loggedDate: string }[] = [];

        // Loop day-by-day from calendarOrigin up to (today - 1 day)
        for (let step = 0; step < dayDiff; step++) {
          const stepIso = addDaysIso(originIso, step);
          const parts = parseIsoDateParts(stepIso);
          const stepOrigin = parts
            ? new Date(parts.year, parts.month - 1, parts.day, 12, 0, 0)
            : new Date(calendarOrigin.getTime() + step * 86_400_000);

          if (!examShieldRef.current && !vacationModeRef.current) {
            const missed = collectMissedMomentumEvents(
              habitsRef.current,
              runningEvents,
              stepIso,
              stepOrigin
            );
            if (missed.length > 0) {
              accumulatedMissed.push(...missed);
              runningEvents = mergeMomentumEvents(runningEvents, missed);
              missed.forEach((event) => {
                const habit = habitsRef.current.find((item) => item.id === event.habitId);
                accumulatedPrompts.push({
                  habitId: event.habitId,
                  habitName: habit?.name || 'Habit',
                  loggedDate: stepIso,
                });
              });
            }
          }
        }

        if (accumulatedMissed.length > 0) {
          setMomentumEvents((prev) => mergeMomentumEvents(prev, accumulatedMissed));
          const userId = sessionRef.current?.id;
          accumulatedMissed.forEach((event) => {
            void appendMomentumEventRemote(userId, event);
          });
        }
        if (accumulatedPrompts.length > 0) {
          setPendingFriction((prev) => enqueueFrictionPrompts(prev, accumulatedPrompts));
        }
      }

      // Update calendarOrigin only after processing all intermediate days
      const nextOrigin = startOfDay(new Date());
      const week = getWeekDates(nextOrigin).map((date) => toISODate(date));
      setCalendarOrigin(nextOrigin);
      try {
        localStorage.setItem(CALENDAR_LAST_ACTIVE_KEY, nowIso);
      } catch {}
      setCurrentSelectedDate((prev) => {
        if (prev === originIso) return nowIso;
        return week.includes(prev) ? prev : nowIso;
      });
      setActiveFallbackIds([]);
    };

    const intervalId = window.setInterval(rollForwardIfMidnightPassed, 60_000);
    const onResume = () => rollForwardIfMidnightPassed();
    const onVisibility = () => {
      if (document.visibilityState === 'visible') rollForwardIfMidnightPassed();
    };

    window.addEventListener('focus', onResume);
    document.addEventListener('visibilitychange', onVisibility);
    rollForwardIfMidnightPassed();

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', onResume);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [calendarOrigin]);

  useEffect(() => {
    setProtection((prev) => tickProtectionState(prev, toISODate(calendarOrigin)));
  }, [calendarOrigin]);

  const [isLedgerModalOpen, setIsLedgerModalOpen] = useState(false);
  const [widgetFocusReminderId, setWidgetFocusReminderId] = useState<string | null>(null);
  const [widgetOpenCreateTask, setWidgetOpenCreateTask] = useState(false);
  const [detailHabit, setDetailHabit] = useState<Habit | null>(null);
  const [longPressedHabitId, setLongPressedHabitId] = useState<string | null>(null);
  const [longPressedRect, setLongPressedRect] = useState<DOMRect | null>(null);
  const [deleteConfirmHabit, setDeleteConfirmHabit] = useState<Habit | null>(null);
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

  const tutorialLockRef = useRef(false);
  const [hasCompletedTutorial, setHasCompletedTutorial] = useState<boolean | null>(() => {
    try {
      return getLocalTutorialCompleted() ? true : null;
    } catch {
      return null;
    }
  });

  const handleToggleExamShield = () => {
    setProtection((prev) => {
      const result = toggleExamShield(prev);
      return result.state;
    });
  };

  const handleToggleVacationMode = () => {
    setProtection((prev) => {
      const result = toggleVacation(prev);
      if (result.state.vacation.active) {
      } else {
      }
      return result.state;
    });
  };

  // Upgrade guest modal
  const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(false);
  const [upgradeEmail, setUpgradeEmail] = useState('');
  const [upgradePassword, setUpgradePassword] = useState('');
  const [upgradeName, setUpgradeName] = useState('');
  const [upgradeLoading, setUpgradeLoading] = useState(false);
  const [upgradeError, setUpgradeError] = useState<string | null>(null);

  // Change password modal
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [newPasswordText, setNewPasswordText] = useState('');
  const [passwordStatusMsg, setPasswordStatusMsg] = useState<string | null>(null);
  const [passwordChangeLoading, setPasswordChangeLoading] = useState(false);
  const [passwordChangeError, setPasswordChangeError] = useState<string | null>(null);

  // Delete account
  const [deleteAccountLoading, setDeleteAccountLoading] = useState(false);
  const [deleteAccountError, setDeleteAccountError] = useState<string | null>(null);

  // Listen to Supabase auth state and restore session
  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return;

    const applyAuthUser = (user: {
      id: string;
      email?: string | null;
      created_at?: string;
      user_metadata?: Record<string, unknown>;
    }) => {
      const restoredSession: UserSession = {
        id: user.id,
        email: user.email || '',
        name: String(user.user_metadata?.full_name || user.email?.split('@')[0] || 'Ascender'),
        avatarUrl: readStoredAvatarId(String(user.user_metadata?.avatar_url || generateAvatarUrl(user.email || 'User'))),
        isGuest: false,
        memberSince: new Date(user.created_at || Date.now()).toLocaleDateString('en-US', {
          month: 'short',
          year: 'numeric',
        }),
        syncStatus: 'syncing',
      };
      setSession(restoredSession);
      setStoredSession(restoredSession);
    };

    void authService.restoreExistingSession().then((result) => {
      if (result === 'pending' || !result) return;
      setSession(result);
    }).catch((err) => console.warn('Auth restore offline:', err));

    const { data: authListener } = supabase.auth.onAuthStateChange((event, supabaseSession) => {
      if (supabaseSession?.user) {
        applyAuthUser(supabaseSession.user);
        return;
      }
      if (event === 'SIGNED_OUT' && !sessionRef.current?.isGuest) {
        setSession(null);
        setStoredSession(null);
      }
    });

    return () => {
      authListener?.subscription?.unsubscribe();
    };
  }, []);

  // Sync state to localStorage (debounced so swipe-complete doesn't block the main thread)
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        localStorage.setItem('habit_tracker_habits', JSON.stringify(habits));
      } catch {}
    }, 320);
    return () => window.clearTimeout(timer);
  }, [habits]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        localStorage.setItem('habit_tracker_evidence', JSON.stringify(evidenceList));
      } catch {}
    }, 320);
    return () => window.clearTimeout(timer);
  }, [evidenceList]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        localStorage.setItem('habit_tracker_reminders', JSON.stringify(reminders));
      } catch {}
    }, 320);
    return () => window.clearTimeout(timer);
  }, [reminders]);

  useEffect(() => {
    try {
      localStorage.setItem('ascend_theme', theme);
    } catch {}
  }, [theme]);

  useEffect(() => {
    const dark = theme === 'dark' || (theme === 'system' && systemPrefersDark);
    void applyNativeChrome(dark).catch(() => {});
  }, [theme, systemPrefersDark]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void hideNativeSplash().catch(() => {});
    }, 1500);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('ascend_friction_audits', JSON.stringify(frictionAudits));
    } catch {}
  }, [frictionAudits]);

  useEffect(() => {
    savePendingFrictionPrompts(pendingFriction);
  }, [pendingFriction]);

  const weekIsoDates = useMemo(() => getWeekDates(calendarOrigin).map((date) => toISODate(date)), [calendarOrigin]);
  const todayDayIndex = getTodayDayIndex();
  const currentDayIndex = useMemo(() => {
    const idx = weekIsoDates.indexOf(currentSelectedDate);
    return idx >= 0 ? idx : todayDayIndex;
  }, [weekIsoDates, currentSelectedDate, todayDayIndex]);
  const selectedDay = currentDayIndex + 1;
  const isViewingToday = currentSelectedDate === weekIsoDates[todayDayIndex];

  const handleSelectDay = (day: number) => {
    const iso = weekIsoDates[day - 1];
    if (iso) setCurrentSelectedDate(iso);
  };

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
        bowlEpoch.resetAt
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
    setCycleHistory((prev) => [entry, ...prev.filter((item) => item.id !== entry.id)].slice(0, 40));
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

  const handleBowlCelebrationDone = () => {
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
  };

  const keystoneCompletedOnViewedDay = useMemo(
    () => activeHabits.filter((habit) => habit.isKeystone && habit.days?.[currentDayIndex]).map((habit) => habit.id),
    [activeHabits, currentDayIndex]
  );

  const longPressedHabit = useMemo(() => {
    return derivedHabits.find((h) => h.id === longPressedHabitId) || null;
  }, [derivedHabits, longPressedHabitId]);

  // Rolling momentum from the append-only events log.
  // When viewing today, reuse one calculation instead of scanning the log twice.
  const todayMomentumScore = useMemo(() => {
    return calculateMomentumScore(momentumEvents, {
      examShield: examShieldActive,
      vacationMode: vacationModeActive,
      habits,
    });
  }, [momentumEvents, examShieldActive, vacationModeActive, habits]);

  const momentumScore = useMemo(() => {
    if (isViewingToday) return todayMomentumScore;
    return calculateMomentumScore(momentumEvents, {
      examShield: examShieldActive,
      vacationMode: vacationModeActive,
      asOf: endOfIsoDate(currentSelectedDate),
      habits,
    });
  }, [
    isViewingToday,
    todayMomentumScore,
    momentumEvents,
    examShieldActive,
    vacationModeActive,
    currentSelectedDate,
    habits,
  ]);

  const displayedIdentityVotes = useMemo(
    () => displayedIdentityVoteCount(
      momentumEvents,
      evidenceList,
      habits.map((habit) => habit.id)
    ),
    [momentumEvents, evidenceList, habits]
  );
  const ledgerEvidence = useMemo(
    () => ledgerEvidenceForHabits(evidenceList, habits.map((habit) => habit.id)),
    [evidenceList, habits]
  );

  const completionEventsRef = useRef(completionEvents);
  const selectedInterestsRef = useRef(selectedInterests);
  const hasCompletedTutorialRef = useRef(hasCompletedTutorial);
  const momentumScoreRef = useRef(momentumScore);
  const hydratedUserIdRef = useRef<string | null>(null);
  const reminderSyncSeqRef = useRef(0);
  habitsRef.current = habits;
  momentumEventsRef.current = momentumEvents;
  completionEventsRef.current = completionEvents;
  selectedInterestsRef.current = selectedInterests;
  hasCompletedTutorialRef.current = hasCompletedTutorial;
  momentumScoreRef.current = todayMomentumScore;

  const applySyncStatus = (status: UserSession['syncStatus']) => {
    setSession((prev) => {
      if (!prev) return prev;
      const next = { ...prev, syncStatus: status };
      setStoredSession(next);
      return next;
    });
  };

  const runAuthenticatedSync = async (targetSession: UserSession) => {
    if (targetSession.isGuest) {
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
    setHabits((prev) => mergeHabitsByUpdatedAt(prev, result.habits));
    setCompletionEvents(omitDeletedHabitRefs(result.completionEvents));
    setMomentumEvents((prev) =>
      omitDeletedHabitRefs(mergeMomentumEvents(prev, result.momentumEvents)),
    );
    if (result.ok) {
      hydratedUserIdRef.current = targetSession.id;
    }
    applySyncStatus(result.ok ? 'synced' : 'error');
    return result;
  };

  // Guest → auth: hydrate profiles, habits, habit_logs, and momentum_history
  useEffect(() => {
    if (!session || session.isGuest) {
      hydratedUserIdRef.current = null;
      return;
    }
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
  }, [session?.id, session?.isGuest]);

  useEffect(() => {
    if (!session || session.isGuest) return;
    if (hydratedUserIdRef.current !== session.id) return;
    void persistHabitsToTable(session.id, habits).then((ok) => {
      applySyncStatus(ok ? 'synced' : 'error');
    });
  }, [habits, session?.id, session?.isGuest]);

  useEffect(() => {
    if (!session || session.isGuest) return;
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
  ]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void schedulePsychologyNotifications({
        windows: notificationWindows,
        habits: activeHabits,
        todayIndex: todayDayIndex,
        momentumScore: todayMomentumScore,
      });
    }, 500);
    return () => window.clearTimeout(timer);
  }, [notificationWindows, activeHabits, todayDayIndex, todayMomentumScore, completionEvents]);

  // Cycle-window habit_logs hydrate (Home + any tab once signed in).
  // Range query is read-only — never resets bowlEpoch (celebration/rollover only).
  useEffect(() => {
    if (!session || session.isGuest) return;
    const startIso = bowlWindow.startIso;
    const endIso = bowlWindow.endIso;
    if (!startIso || !endIso || startIso > endIso) return;

    let cancelled = false;
    void (async () => {
      const [remoteHabits, cycleLogs, remoteMomentum] = await Promise.all([
        fetchActiveHabits(session.id),
        fetchHabitLogsForDateRange(session.id, startIso, endIso),
        fetchMomentumEventsFromTable(session.id),
      ]);
      if (cancelled) return;
      setHabits((prev) => omitDeletedHabits(mergeHabitsByUpdatedAt(prev, remoteHabits)));
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
      const userMomentum = omitDeletedHabitRefs(
        remoteMomentum.filter((event) => !isSeedHabitId(event.habitId))
      );
      if (userMomentum.length > 0) {
        setMomentumEvents((prev) =>
          omitDeletedHabitRefs(
            mergeMomentumEvents(
              prev.filter((event) => !isSeedHabitId(event.habitId)),
              userMomentum
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
  ]);

  useEffect(() => {
    if (!session || session.isGuest) return;
    let cancelled = false;
    void fetchFrictionReasonsFromTable(session.id).then((rows) => {
      if (cancelled || rows.length === 0) return;
      setFrictionAudits((prev) =>
        omitDeletedHabitRefs(mergeFrictionAuditsFromLogs(prev, rows, habitsRef.current)),
      );
    });
    return () => {
      cancelled = true;
    };
  }, [session?.id, session?.isGuest]);

  const selectedDayCompletedCount = activeHabits.filter(
    (h) => Boolean(h.days?.[currentDayIndex])
  ).length;

  // Pending reminder count for bottom navigation badge
  const pendingRemindersCount = useMemo(() => {
    return reminders.filter((r) => !r.completed).length;
  }, [reminders]);

  const appendMomentumLog = (event: MomentumEvent) => {
    setMomentumEvents((prev) => mergeMomentumEvents(prev, [event]));
    void appendMomentumEventRemote(sessionRef.current?.id, event);
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
    void appendMomentumEventRemote(sessionRef.current?.id, pending.event);
  };

  const cancelGraceMomentum = (habitId: string): boolean => {
    const pending = pendingGraceMomentumRef.current.get(habitId);
    if (!pending) return false;
    window.clearTimeout(pending.timer);
    pendingGraceMomentumRef.current.delete(habitId);
    setMomentumEvents((prev) => prev.filter((row) => row.id !== pending.event.id));
    return true;
  };

  const activeFrictionPrompt = pendingFriction[0] ?? null;

  const handleFrictionSubmit = (reason: string) => {
    const prompt = pendingFriction[0];
    if (!prompt) return;
    markFrictionPrompted(prompt.habitId, prompt.loggedDate);
    setFrictionAudits((prev) => [createMissedFrictionAudit(prompt, reason), ...prev]);
    void persistHabitLogFrictionReason(sessionRef.current?.id, prompt.habitId, prompt.loggedDate, reason);
    setPendingFriction((prev) => prev.slice(1));
  };

  const handleFrictionSkip = () => {
    const prompt = pendingFriction[0];
    if (!prompt) return;
    markFrictionPrompted(prompt.habitId, prompt.loggedDate);
    setPendingFriction((prev) => prev.slice(1));
  };

  // GESTURE / TAP ACTION: Complete Today (Full 100% or Fallback Micro 50%)
  const handleCompleteToday = (habitId: string, isFallback: boolean = false) => {
    if (!isViewingToday) return;
    const targetHabit = habits.find((h) => h.id === habitId);
    if (!targetHabit) return;
    // Off-day: schedule feature blocks completion (no ledger / momentum / pulse).
    if (!isHabitScheduledOnDayIndex(targetHabit, todayDayIndex, calendarOrigin)) return;

    const isMicro = isFallback || activeFallbackIds.includes(habitId);
    const loggedDate = toISODate(calendarOrigin);
    const alreadyCompletedToday = hasTodayLedgerEntry(completionEvents, habitId, loggedDate, calendarOrigin);
    const alreadyVotedMomentum = hasMomentumVoteOnIso(momentumEvents, habitId, loggedDate);

    setActiveFallbackIds((prev) => prev.filter((id) => id !== habitId));

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

    // One completion row per (habit, calendar day). Re-checking after uncheck replaces, never stacks.
    // Local state updates immediately so bowl marbles drop at t=0 (remote sync is background).
    setCompletionEvents((prev) => replaceTodayCompletion(prev, newEvent, calendarOrigin));
    void upsertHabitLog(session?.id, newEvent).catch(() => {});

    // momentum_events stays append-only; skip a second full/fallback row for the same local day.
    // Defer remote append briefly so a grace undo can drop the local row with zero penalty.
    // Island pulse only when a new vote is appended — pill still no-ops if the rounded score is flat.
    if (!alreadyVotedMomentum) {
      const momentumEvent = createMomentumEvent(
        targetHabit,
        isMicro ? 'fallback' : 'full',
        loggedDate,
        newEvent.timestamp
      );
      setMomentumEvents((prev) => mergeMomentumEvents(prev, [momentumEvent]));
      const existing = pendingGraceMomentumRef.current.get(habitId);
      if (existing) window.clearTimeout(existing.timer);
      const timer = window.setTimeout(() => flushGraceMomentum(habitId), 3000);
      pendingGraceMomentumRef.current.set(habitId, { event: momentumEvent, timer });
      setMomentumPulse((n) => n + 1);
    }

    const newEvidence: IdentityEvidence = {
      id: alreadyCompletedToday
        ? `ev-${habitId}-${loggedDate}`
        : `ev-${isMicro ? 'micro-' : ''}${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      habitId,
      habitName: isMicro ? `${targetHabit.name} (Micro-Habit)` : targetHabit.name,
      identityStatement: isMicro
        ? `Micro-Habit vote: ${targetHabit.identityStatement || 'Non-zero progress'}`
        : (targetHabit.identityStatement || 'I am consistent and disciplined'),
      category: targetHabit.category || 'work',
      date: `${formatEvidenceDate()} • ${isMicro ? 'Fallback micro (50%)' : 'Completed (100%)'}`,
      dayNumber: todayDayIndex + 1,
      loggedDate,
    };
    setEvidenceList((evPrev) => upsertTodayEvidence(evPrev, newEvidence, loggedDate, calendarOrigin));

    if (isMicro && !alreadyCompletedToday) {
      const newAudit: FrictionAudit = {
        id: `fa-${Date.now()}`,
        date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        dayNumber: todayDayIndex + 1,
        habitName: targetHabit.name,
        type: 'fallback_used',
        note: `Protected momentum with fallback: "${targetHabit.fallbackMicroHabit || '2-min minimum'}"`,
        timestamp: Date.now(),
      };
      setFrictionAudits((prevAudits) => [newAudit, ...prevAudits]);
    }

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
      // Measure after paint so optimistic card/bowl layout is ready.
      requestAnimationFrame(() => {
        try {
          const swipeDir = isMicro ? 'left' : 'right';
          const points = measureCompletionFlight(habitId, swipeDir);
          if (!points) return;
          const flight: PieceFlight = {
            id: `fly-${pieceId}-${Date.now()}`,
            pieceId,
            kind: rewardKind,
            from: points.from,
            to: points.to,
            isDark,
            direction: swipeDir,
          };
          setPieceFlights((prev) => [...prev.slice(-4), flight]);
        } catch {
          /* ignore measurement failures */
        }
      });
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
      setActiveFallbackIds((prev) => prev.filter((id) => id !== habitId));
      return;
    }

    const loggedDate = toISODate(calendarOrigin);
    const alreadyLogged = completionEvents.some(
      (e) => e.habitId === habitId && resolveEventIsoDate(e, calendarOrigin) === loggedDate
    );
    if (alreadyLogged) {
      setCompletionEvents((prev) =>
        prev.filter((e) => !(e.habitId === habitId && resolveEventIsoDate(e, calendarOrigin) === loggedDate))
      );
      void deleteHabitLog(session?.id, habitId, loggedDate, todayDayIndex).catch(() => {});
    }

    setActiveFallbackIds((prev) => [...prev, habitId]);
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

    setCompletionEvents((prev) =>
      prev.filter((e) => !(e.habitId === habitId && resolveEventIsoDate(e, calendarOrigin) === loggedDate))
    );
    void deleteHabitLog(session?.id, habitId, loggedDate, todayDayIndex).catch(() => {});
    setActiveFallbackIds((prev) => prev.filter((id) => id !== habitId));
    setEvidenceList((prev) => removeTodayEvidence(prev, habitId, loggedDate, calendarOrigin));

    if (rolledBackMomentum) {
      setMomentumPulse((n) => n + 1);
    } else {
      // Habit completion was already committed/flushed to momentum_events ledger.
      // Append an immutable 'reversal' event to roll back the score and ledger vote.
      const targetHabit = habits.find((h) => h.id === habitId);
      if (targetHabit) {
        const baseWeight = habitWeight(targetHabit);
        const reversalWeight = wasFallback ? baseWeight * 0.5 : baseWeight;
        const reversalEvent = createMomentumEvent(
          targetHabit,
          'reversal',
          loggedDate,
          Date.now(),
          reversalWeight
        );
        appendMomentumLog(reversalEvent);
        setMomentumPulse((n) => n + 1);
      }
    }
  };

  // Add new habit (optimistic). Remote insert is performed by AddHabitModal.
  const handleAddHabit = (newHabitData: Omit<Habit, 'id' | 'days' | 'microDays'>): Habit | null => {
    if (isAtActiveHabitCap(habits)) {
      return null;
    }
    let payload = newHabitData;
    if (payload.isKeystone && !canEnableKeystone(habits)) {
      payload = { ...payload, isKeystone: false };
    }
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
    setHabits((prev) => [newHabit, ...prev]);
    return newHabit;
  };

  // Archive habit
  const handleArchiveHabit = (habitId: string) => {
    setHabits((prev) =>
      prev.map((h) => (h.id === habitId ? touchHabit({ ...h, archived: true }) : h))
    );
    if (detailHabit && detailHabit.id === habitId) {
      setDetailHabit(null);
    }
  };

  // Restore archived habit
  const handleRestoreHabit = (habitId: string) => {
    const target = habits.find((habit) => habit.id === habitId);
    if (target?.archived && isAtActiveHabitCap(habits)) {
      return;
    }
    setHabits((prev) =>
      prev.map((h) => (h.id === habitId ? touchHabit({ ...h, archived: false }) : h))
    );
  };

  // Delete habit (optimistic) + purge every local trace so Report Analysis cannot resurface it
  const handleDeleteHabit = (habitId: string) => {
    rememberDeletedHabit(habitId);
    setHabits((prev) => prev.filter((h) => h.id !== habitId));
    setCompletionEvents((prev) => prev.filter((e) => e.habitId !== habitId));
    setMomentumEvents((prev) => prev.filter((e) => e.habitId !== habitId));
    setEvidenceList((prev) => prev.filter((item) => item.habitId !== habitId));
    setFrictionAudits((prev) => prev.filter((item) => item.habitId !== habitId));
    setPendingFriction((prev) => prev.filter((item) => item.habitId !== habitId));
    setActiveFallbackIds((prev) => prev.filter((id) => id !== habitId));
    if (detailHabit && detailHabit.id === habitId) {
      setDetailHabit(null);
    }
    void deleteHabit(session?.id, habitId).catch(() => {});
  };

  // Update habit
  const handleUpdateHabit = (updatedHabit: Habit) => {
    let next = updatedHabit;
    if (next.isKeystone && !canEnableKeystone(habits, next.id)) {
      next = { ...next, isKeystone: false };
    }
    setHabits((prev) =>
      prev.map((h) => (h.id === next.id ? touchHabit(next) : h))
    );
    setDetailHabit(touchHabit(next));
  };

  const handleToggleKeystone = (habitId: string, nextValue: boolean) => {
    if (nextValue && !canEnableKeystone(habits, habitId)) {
      return;
    }
    setHabits((prev) =>
      prev.map((habit) => (habit.id === habitId ? touchHabit({ ...habit, isKeystone: nextValue }) : habit))
    );
  };

  // Reset to an empty local workspace (no demo habits)
  const handleResetData = () => {
    setHabits([]);
    setEvidenceList([]);
    setCompletionEvents([]);
    setMomentumEvents([]);
    setActiveFallbackIds([]);
    localStorage.removeItem('habit_tracker_habits');
    localStorage.removeItem('habit_tracker_evidence');
    localStorage.removeItem('ascend_completion_events');
    localStorage.removeItem('ascend_active_fallbacks');
    localStorage.removeItem(MOMENTUM_EVENTS_STORAGE_KEY);
    localStorage.removeItem('ascend_identity_vote_floor');
  };

  // Import JSON backup
  const handleImportJSON = (
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
  };

  // Clear Cache
  const handleClearCache = () => {
    localStorage.removeItem('ascend_cache_timestamp');
  };

  // Delete Account — JWT-scoped RPC deletes auth.users + owned public data (no service_role on client)
  const handleDeleteAccount = async () => {
    if (!session) return;
    setDeleteAccountLoading(true);
    setDeleteAccountError(null);
    try {
      const err = await authService.deleteAccount(session.id);
      if (err) {
        setDeleteAccountError(err);
        setDeleteAccountLoading(false);
        return;
      }
    } catch (e: any) {
      setDeleteAccountError(e?.message || 'Account deletion failed.');
      setDeleteAccountLoading(false);
      return;
    }
    // Success — wipe local state; session=null returns user to Auth/landing
    localStorage.clear();
    setSession(null);
    setIsOnboarded(false);
    setHabits([]);
    setEvidenceList([]);
    setCompletionEvents([]);
    setMomentumEvents([]);
    setReminders([]);
    setActiveTab('home');
    setDeleteAccountLoading(false);
  };

  // Auth Success handler
  const handleAuthSuccess = (newSession: UserSession, isNewUser?: boolean, interests?: string[]) => {
    setSession(newSession);
    setStoredSession(newSession);
    if (interests && interests.length > 0) {
      setSelectedInterests(interests);
      if (!newSession.isGuest) {
        void persistUserProfile(newSession, {
          interests,
          has_completed_tutorial: false,
        }).catch(() => {});
      }
    }
    if (!newSession.isGuest) {
      void purgeSeedHabitsFromTable(newSession.id).catch(() => {});
    }
    if (isNewUser) {
      if (newSession.isGuest) {
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
      setIsOnboarded(false);
      setOnboardingCompleted(false);
      setHasCompletedTutorial(false);
      setLocalTutorialCompleted(false, { force: true });
      tutorialLockRef.current = false;
    } else {
      setHabits((prev) => prev.filter((habit) => !isSeedHabitId(habit.id)));
      setCompletionEvents((prev) => prev.filter((event) => !isSeedHabitId(event.habitId)));
      setMomentumEvents((prev) => prev.filter((event) => !isSeedHabitId(event.habitId)));
      setEvidenceList((prev) => prev.filter((item) => !isSeedHabitId(item.habitId)));
      setIsOnboarded(true);
      setOnboardingCompleted(true);
    }
  };

  // Onboarding Complete handler
  const handleOnboardingComplete = () => {
    setIsOnboarded(true);
    setOnboardingCompleted(true);
  };

  // Upgrade Guest Account handler
  const handleUpgradeGuestSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session || !upgradeEmail.trim() || !upgradePassword.trim()) return;

    setUpgradeLoading(true);
    setUpgradeError(null);
    try {
      const updated = await authService.upgradeGuestAccount(
        upgradeEmail.trim(),
        upgradePassword.trim(),
        upgradeName.trim(),
        session
      );
      setSession(updated);
      setIsUpgradeModalOpen(false);
    } catch (err: any) {
      setUpgradeError(err?.message || 'Upgrade failed. Please check your credentials.');
    } finally {
      setUpgradeLoading(false);
    }
  };

  // Native dual-alert re-scheduler after force-quit / reboot (RECEIVE_BOOT_COMPLETED)
  useEffect(() => {
    void initializeReminderNotifications();
    notificationScheduler.bootReschedulePendingAlerts(reminders);
    // Initial reminders come from localStorage; re-arm once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Last-write-wins pull: apply the newest public.reminders row and re-schedule natives.
  useEffect(() => {
    if (!session || session.isGuest) return;
    let cancelled = false;
    const seq = ++reminderSyncSeqRef.current;
    void remindersSyncService.syncReminders(reminders, session).then((res) => {
      if (cancelled || seq !== reminderSyncSeqRef.current) return;
      setReminders((prev) => mergeRemindersByUpdatedAt(prev, res.reminders));
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.id, session?.isGuest]);

  // Standalone Reminders Handlers with Supabase LWW sync and OS-level alerts
  const persistReminderSync = (updated: StandaloneReminder[]) => {
    const seq = ++reminderSyncSeqRef.current;
    void remindersSyncService.syncReminders(updated, session).then((res) => {
      if (seq !== reminderSyncSeqRef.current) return;
      setReminders((prev) => mergeRemindersByUpdatedAt(prev, res.reminders));
    });
  };

  const handleAddReminder = (
    newRem: Omit<StandaloneReminder, 'id' | 'completed' | 'createdAt' | 'updatedAt'> & {
      id?: string;
      notificationId1?: number;
      notificationId2?: number;
    }
  ) => {
    const now = Date.now();
    const id = newRem.id || 'rem-' + now + '-' + Math.random().toString(36).substring(2, 6);
    const ids = reminderNotificationIds(id);
    const hasTime = Boolean(newRem.time);
    const item: StandaloneReminder = {
      ...newRem,
      id,
      completed: false,
      alert10Min: hasTime && newRem.alert10Min !== false,
      alertExact: hasTime && newRem.alertExact !== false,
      createdAt: now,
      updatedAt: now,
      habitId: newRem.habitId ?? null,
      daysOfWeek: newRem.daysOfWeek?.length ? newRem.daysOfWeek : [weekdayFromIsoDate(newRem.date)],
      isEnabled: true,
      notificationId1: Math.trunc(newRem.notificationId1 ?? ids.notificationId1),
      notificationId2: Math.trunc(newRem.notificationId2 ?? ids.notificationId2),
    };

    notificationScheduler.scheduleReminderAlerts(item);

    const updated = [item, ...reminders.filter((existing) => existing.id !== item.id)];
    setReminders(updated);
    persistReminderSync(updated);

  };

  const handleToggleReminder = (id: string) => {
    const now = Date.now();
    void requestNotificationPermissions();
    const updated = reminders.map((r) => {
      if (r.id !== id) return r;
      const nextCompleted = !r.completed;
      const revised = withReminderNotificationIds({
        ...r,
        completed: nextCompleted,
        isEnabled: !nextCompleted,
        updatedAt: now,
      });
      if (nextCompleted) {
        notificationScheduler.cancelReminderAlerts(id, revised);
      } else {
        notificationScheduler.scheduleReminderAlerts(revised);
      }
      return revised;
    });
    setReminders(updated);
    const revised = updated.find((item) => item.id === id);
    if (revised) void upsertPublicReminder(session, revised);
    persistReminderSync(updated);
  };

  const handleSetReminderCompleted = (id: string, completed: boolean) => {
    const now = Date.now();
    void requestNotificationPermissions();
    const updated = reminders.map((r) => {
      if (r.id !== id) return r;
      if (r.completed === completed) return r;
      const revised = withReminderNotificationIds({
        ...r,
        completed,
        isEnabled: !completed,
        updatedAt: now,
      });
      if (completed) {
        notificationScheduler.cancelReminderAlerts(id, revised);
      } else {
        notificationScheduler.scheduleReminderAlerts(revised);
      }
      return revised;
    });
    setReminders(updated);
    const revised = updated.find((item) => item.id === id);
    if (revised) void upsertPublicReminder(session, revised);
    persistReminderSync(updated);
  };

  derivedHabitsRef.current = derivedHabits;
  todayDayIndexRef.current = todayDayIndex;
  handleCompleteTodayRef.current = handleCompleteToday;
  handleResetTodayRef.current = handleResetToday;
  handleToggleFallbackModeRef.current = handleToggleFallbackMode;
  handleToggleKeystoneRef.current = handleToggleKeystone;
  handleSetReminderCompletedRef.current = handleSetReminderCompleted;

  const deferredPieceIds = useMemo(
    () => new Set(pieceFlights.map((flight) => flight.pieceId)),
    [pieceFlights]
  );
  const settlePieceIdSet = useMemo(() => new Set(settlePieceIds), [settlePieceIds]);

  const handlePieceFlightComplete = useCallback((flightId: string, pieceId: string) => {
    // Delay making the piece visible in the bowl by 80ms so the flying marble
    // fully fades out before the resting piece fades in — prevents the double-piece flash.
    void pulseCompletionHaptic('fallback');
    window.setTimeout(() => {
      setPieceFlights((prev) => prev.filter((flight) => flight.id !== flightId));
      setSettlePieceIds((prev) => (prev.includes(pieceId) ? prev : [...prev, pieceId]));
      const existing = settleTimersRef.current.get(pieceId);
      if (existing) window.clearTimeout(existing);
      const timer = window.setTimeout(() => {
        settleTimersRef.current.delete(pieceId);
        setSettlePieceIds((prev) => prev.filter((id) => id !== pieceId));
      }, 600);
      settleTimersRef.current.set(pieceId, timer);
    }, 80);
  }, []);

  const handleCompletionSoundChange = useCallback((enabled: boolean) => {
    setCompletionSoundEnabled(enabled);
    setCompletionSound(enabled);
  }, []);

  const handleHapticVibrationChange = useCallback((enabled: boolean) => {
    setHapticVibrationEnabled(enabled);
    setHapticVibration(enabled);
  }, []);

  useEffect(
    () => () => {
      for (const timer of settleTimersRef.current.values()) window.clearTimeout(timer);
      settleTimersRef.current.clear();
    },
    []
  );

  const stableCompleteToday = useCallback((habitId: string, isFallback?: boolean) => {
    handleCompleteTodayRef.current(habitId, isFallback);
  }, []);
  const stableResetToday = useCallback((habitId: string) => {
    handleResetTodayRef.current(habitId);
  }, []);
  const stableToggleFallbackMode = useCallback((habitId: string) => {
    handleToggleFallbackModeRef.current(habitId);
  }, []);
  const stableToggleKeystone = useCallback((habitId: string, next: boolean) => {
    handleToggleKeystoneRef.current(habitId, next);
  }, []);
  const stableLongPress = useCallback((h: Habit, rect?: DOMRect) => {
    setLongPressedHabitId(h.id);
    setLongPressedRect(rect || null);
  }, []);
  const stableDismissLongPress = useCallback(() => {
    setLongPressedHabitId(null);
    setLongPressedRect(null);
  }, []);
  const stableOpenEdit = useCallback((h: Habit) => {
    setLongPressedHabitId(null);
    setLongPressedRect(null);
    setDetailHabit(h);
  }, []);
  const stableOpenDeleteConfirm = useCallback((h: Habit) => {
    setLongPressedHabitId(null);
    setLongPressedRect(null);
    setDeleteConfirmHabit(h);
  }, []);

  const handleOpenSettingsTab = useCallback(() => setActiveTab('settings'), []);
  const handleOpenHomeTab = useCallback(() => setActiveTab('home'), []);
  const handleOpenLedgerModal = useCallback(() => setIsLedgerModalOpen(true), []);
  const handleCloseLedgerModal = useCallback(() => setIsLedgerModalOpen(false), []);
  const handleOpenUpgradeModal = useCallback(() => setIsUpgradeModalOpen(true), []);
  const handleCloseUpgradeModal = useCallback(() => setIsUpgradeModalOpen(false), []);
  const handleOpenPasswordModal = useCallback(() => setIsPasswordModalOpen(true), []);
  const handleClosePasswordModal = useCallback(() => setIsPasswordModalOpen(false), []);


  useEffect(() => {
    let cancelled = false;

    const applyAction = (action: WidgetPendingAction) => {
      if (!action?.id) return;
      const completed = Boolean(action.completed);
      if (action.type === 'reminder') {
        handleSetReminderCompletedRef.current(action.id, completed);
        return;
      }
      if (action.type !== 'habit') return;
      const habit = derivedHabitsRef.current.find((item) => item.id === action.id);
      const already = Boolean(habit?.days?.[todayDayIndexRef.current]);
      if (completed && !already) handleCompleteTodayRef.current(action.id, false);
      if (!completed && already) handleResetTodayRef.current(action.id);
    };

    const applyRoute = (route: WidgetRoute | null) => {
      if (!route) return;
      if (route.tab === 'report') setActiveTab('report');
      if (route.tab === 'reminders') {
        setActiveTab('reminders');
        if (route.reminderId) setWidgetFocusReminderId(route.reminderId);
        if (route.openCreate) setWidgetOpenCreateTask(true);
      }
      if (route.tab === 'home') {
        setActiveTab('home');
        if (route.openCreate) setIsAddModalOpen(true);
        if (route.habitId) {
          const habit = derivedHabitsRef.current.find((item) => item.id === route.habitId);
          if (habit) setDetailHabit(habit);
        }
      }
      if (route.tab === 'ledger') {
        setActiveTab('personal');
        setIsLedgerModalOpen(true);
      }
    };

    const drain = async () => {
      const [actions, launch] = await Promise.all([consumeWidgetActions(), readLaunchWidgetRoute()]);
      if (cancelled) return;
      actions.forEach(applyAction);
      applyRoute(launch);
    };

    void drain();
    const actionSub = WidgetBridge.addListener('widgetAction', applyAction);
    const linkSub = WidgetBridge.addListener('deepLink', (data) => applyRoute(parseWidgetRoute(data.url)));
    const onVisible = () => {
      if (document.visibilityState === 'visible') void drain();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
      void Promise.resolve(actionSub).then((sub) => sub.remove());
      void Promise.resolve(linkSub).then((sub) => sub.remove());
    };
  }, []);

  const handleUpdateReminder = (
    id: string,
    updates: Partial<Omit<StandaloneReminder, 'id' | 'createdAt'>>
  ) => {
    const now = Date.now();
    const updated = reminders.map((r) => {
      if (r.id !== id) return r;
      const revised = withReminderNotificationIds({ ...r, ...updates, updatedAt: now });
      const alertsOff = revised.alert10Min === false && revised.alertExact === false;
      if (revised.completed || revised.isEnabled === false || alertsOff) {
        notificationScheduler.cancelReminderAlerts(id, revised);
      } else {
        notificationScheduler.scheduleReminderAlerts(revised);
      }
      return revised;
    });
    setReminders(updated);
    const revised = updated.find((item) => item.id === id);
    if (revised) void upsertPublicReminder(session, revised);
    persistReminderSync(updated);
  };

  const handleDeleteReminder = (id: string) => {
    const now = Date.now();
    const itemToDelete = reminders.find((r) => r.id === id);
    const updated = reminders.filter((r) => r.id !== id);
    if (itemToDelete) {
      const tombstone = withReminderNotificationIds({
        ...itemToDelete,
        deleted: true,
        isEnabled: false,
        updatedAt: now,
      });
      notificationScheduler.cancelReminderAlerts(id, tombstone);
      void upsertPublicReminder(session, tombstone);
      persistReminderSync([tombstone, ...updated]);
    }
    setReminders(updated);
  };

  const handleSnoozeReminder = (id: string, minutes: number) => {
    const until = new Date(Date.now() + minutes * 60 * 1000);
    const nowTimestamp = Date.now();
    const newTime = until.toTimeString().slice(0, 5);
    const newDate = toISODate(until);

    const updated = reminders.map((r) => {
      if (r.id !== id) return r;
      const snoozed = withReminderNotificationIds({
        ...r,
        time: newTime,
        date: newDate,
        daysOfWeek: [weekdayFromIsoDate(newDate)],
        isEnabled: true,
        completed: false,
        updatedAt: nowTimestamp,
      });
      notificationScheduler.scheduleReminderAlerts(snoozed);
      return snoozed;
    });
    setReminders(updated);
    const snoozed = updated.find((item) => item.id === id);
    if (snoozed) void upsertPublicReminder(session, snoozed);
    persistReminderSync(updated);
  };

  handleToggleReminderRef.current = handleToggleReminder;
  handleDeleteReminderRef.current = handleDeleteReminder;
  handleSnoozeReminderRef.current = handleSnoozeReminder;

  const stableToggleReminder = useCallback((id: string) => {
    handleToggleReminderRef.current(id);
  }, []);
  const stableSetReminderCompleted = useCallback((id: string, completed: boolean) => {
    handleSetReminderCompletedRef.current(id, completed);
  }, []);
  const stableDeleteReminder = useCallback((id: string) => {
    handleDeleteReminderRef.current(id);
  }, []);
  const stableSnoozeReminder = useCallback((id: string, minutes: number) => {
    handleSnoozeReminderRef.current(id, minutes);
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
        if (nextVisible === navScrollVisibleRef.current) return;
        navScrollVisibleRef.current = nextVisible;
        syncNavChrome();
      });
    },
    [syncNavChrome]
  );

  // Spotlight tutorial: only after onboarding, and only if the profile flag is false
  useEffect(() => {
    if (!session || !isOnboarded) return;
    if (hasCompletedTutorial !== false) return;
    if (tutorialLockRef.current) return;

    if (activeTab !== 'home') {
      setActiveTab('home');
      return;
    }

    navScrollVisibleRef.current = true;
    syncNavChrome();
    const timer = window.setTimeout(() => {
      if (tutorialLockRef.current || hasCompletedTutorial !== false) return;
      tutorialLockRef.current = true;
      startAscendSpotlightTutorial(() => {
        setHasCompletedTutorial(true);
        setLocalTutorialCompleted(true);
        markScreenTutorialCompleted('home');
        if (!session.isGuest) {
          void persistUserProfile(session, {
            has_completed_tutorial: true,
            interests: selectedInterests,
          }).catch(() => {});
        }
      });
    }, 700);

    return () => window.clearTimeout(timer);
  }, [session, isOnboarded, hasCompletedTutorial, activeTab, selectedInterests, syncNavChrome]);

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
        <OnboardingView onComplete={handleOnboardingComplete} />
      </Suspense>
    );
  }

  const themeBgClass = isDark ? 'dark bg-canvas text-ink' : 'bg-canvas text-ink';

  return (
    <div
      id="app-root"
      className={`w-full h-full overflow-hidden select-none font-sans transition-colors duration-200 ${themeBgClass}`}
    >
      <div
        id="mobile-viewport"
        className="relative w-full h-full overflow-hidden"
      >
        <ErrorBoundary
          resetKey={String(viewResetKey)}
          onReset={() => setViewResetKey((value) => value + 1)}
        >
        <div className="absolute inset-0 z-10 tab-pane-host gpu-smooth">
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
                    userId={session.id}
                    isGuest={session.isGuest}
                    userEmail={session.email}
                    userName={session.name}
                    variant="icon"
                    mode="invite"
                  />
                  <motion.button
                    id="add-habit-btn-above-list"
                    type="button"
                    whileTap={tapPress}
                    onClick={() => setIsAddModalOpen(true)}
                    aria-label="Add Habit"
                    title="Add Habit"
                    className={HEADER_ICON_BTN_CLASS}
                  >
                    <Plus className="w-5 h-5" strokeWidth={2.5} />
                  </motion.button>
                </>
              }
            />

            <HomeView
              pieces={celebrationPieces ?? bowlPieces}
              bowlFill={bowlFill}
              isDark={isDark}
              momentumScore={todayMomentumScore}
              momentumPulse={momentumPulse}
              onCycleDaysChange={handleCycleDaysChange}
              celebrating={bowlCelebrating}
              onCelebrationDone={handleBowlCelebrationDone}
              deferredPieceIds={deferredPieceIds}
              settlePieceIds={settlePieceIdSet}
              habits={activeHabits}
              todayIndex={todayDayIndex}
              renderHabit={(habit, habitIndex) => {
                const keystoneAtCap =
                  !habit.isKeystone && activeKeystoneCount >= MAX_KEYSTONE_HABITS;
                return (
                  <HabitCard
                    key={habit.id}
                    habit={habit}
                    todayIndex={todayDayIndex}
                    viewIndex={currentDayIndex}
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
              }}
            >
              <QuoteCard selectedInterests={selectedInterests} isGuest={session.isGuest} />
            </HomeView>
          </main>

        {visitedTabs.has('reminders') ? (
          <div
            aria-hidden={!isTabActive('reminders')}
            className={tabPaneClassName(isTabActive('reminders'))}
          >
          <Suspense fallback={<TabLoadingFallback />}>
            <RemindersView
              reminders={reminders ?? []}
              focusReminderId={widgetFocusReminderId}
              openCreate={widgetOpenCreateTask}
              onOpenCreateConsumed={() => setWidgetOpenCreateTask(false)}
              onAddReminder={handleAddReminder}
              onUpdateReminder={handleUpdateReminder}
              onToggleComplete={stableToggleReminder}
              onSetReminderCompleted={stableSetReminderCompleted}
              onDeleteReminder={stableDeleteReminder}
              onSnoozeReminder={stableSnoozeReminder}
              userSession={session}
              onRemindersHydrated={(remote) => {
                const next = Array.isArray(remote) ? remote : [];
                setReminders((prev) => mergeRemindersByUpdatedAt(prev, next));
                notificationScheduler.bootReschedulePendingAlerts(next);
              }}
              onSyncReminders={() => {
                const seq = ++reminderSyncSeqRef.current;
                remindersSyncService.syncReminders(reminders ?? [], session).then((res) => {
                  if (seq !== reminderSyncSeqRef.current) return;
                  setReminders((prev) => mergeRemindersByUpdatedAt(prev, Array.isArray(res.reminders) ? res.reminders : []));
                });
              }}
              onScroll={handleMainScroll}
              onOpenSettings={handleOpenSettingsTab}
            />
          </Suspense>
          </div>
        ) : null}

        {visitedTabs.has('report') ? (
          <div
            aria-hidden={!isTabActive('report')}
            className={tabPaneClassName(isTabActive('report'))}
          >
          <Suspense fallback={<TabLoadingFallback />}>
            <ReportView
              isActive={isTabActive('report')}
              habits={activeHabits ?? []}
              evidenceList={ledgerEvidence}
              identityVoteCount={displayedIdentityVotes}
              userId={session.id}
              isGuest={session.isGuest}
              userEmail={session.email}
              userName={session.name}
              onOpenLedger={handleOpenLedgerModal}
              onOpenSettings={handleOpenSettingsTab}
              frictionAudits={frictionAudits ?? []}
              onScroll={handleMainScroll}
              isDark={isDark}
              momentumScore={todayMomentumScore}
              momentumEvents={momentumEvents ?? []}
              completionEvents={completionEvents ?? []}
              selectedDayIso={currentSelectedDate}
              onSelectDayIso={setCurrentSelectedDate}
              cycleDays={cycleDays}
              cycleStartIso={bowlEpoch.startIso}
            />
          </Suspense>
          </div>
        ) : null}

        {visitedTabs.has('personal') ? (
          <div
            aria-hidden={!isTabActive('personal')}
            className={tabPaneClassName(isTabActive('personal'))}
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
              onUpgradeGuest={handleOpenUpgradeModal}
              onSyncNow={async () => {
                if (!session || session.isGuest) {
                  throw new Error('Guest sessions stay local');
                }
                const result = await runAuthenticatedSync(session);
                if (!result.ok) {
                  throw new Error(result.error || 'Sync failed');
                }
              }}
              onChangePassword={handleOpenPasswordModal}
              onUpdateAvatar={(avatarUrl) => {
                setSession((prev) => {
                  if (!prev) return prev;
                  const next = { ...prev, avatarUrl };
                  setStoredSession(next);
                  return next;
                });
              }}
              onLogout={handleDeleteAccount}
              onUpdateName={(newName) => {
                setSession((prev) => (prev ? { ...prev, name: newName } : prev));
              }}
              onScroll={handleMainScroll}
            />
          </Suspense>
          </div>
        ) : null}

        {visitedTabs.has('settings') ? (
          <div
            aria-hidden={!isTabActive('settings')}
            className={tabPaneClassName(isTabActive('settings'))}
          >
          <Suspense fallback={<TabLoadingFallback />}>
            <SettingsView
              habits={habits ?? []}
              evidenceList={ledgerEvidence}
              completionEvents={completionEvents ?? []}
              momentumEvents={momentumEvents ?? []}
              theme={theme}
              onThemeChange={setTheme}
              notificationWindows={notificationWindows}
              onToggleNotificationWindow={handleToggleNotificationWindow}
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
        ) : null}
        </div>


        <FlyingPieceOverlay flights={pieceFlights} onFlightComplete={handlePieceFlightComplete} />
        </ErrorBoundary>

        {/* Floating Bottom Navigation: hide on scroll, keyboard, or modal */}
        <BottomNav
          activeTab={safeActiveTab}
          onTabChange={(tab) => setActiveTab(resolveActiveTab(tab))}
          pendingRemindersCount={pendingRemindersCount}
          isBlurred={Boolean(longPressedHabitId)}
        />

        {/* Spotlighted Habit Overlay with Whole Screen Blur & Dustbin/Pen options */}
        <AnimatePresence>
          {longPressedHabit && (
            <HabitLongPressOverlay
              key="habit-long-press"
              habit={longPressedHabit}
              rect={longPressedRect}
              todayIndex={todayDayIndex}
              isFallbackActive={isViewingToday && activeFallbackIds.includes(longPressedHabit.id)}
              onClose={() => {
                setLongPressedHabitId(null);
                setLongPressedRect(null);
              }}
              onOpenEdit={(h) => {
                setLongPressedHabitId(null);
                setLongPressedRect(null);
                setDetailHabit(h);
              }}
              onDelete={(h) => {
                setLongPressedHabitId(null);
                setLongPressedRect(null);
                setDeleteConfirmHabit(h);
              }}
            />
          )}
        </AnimatePresence>

        {/* Home Indicator */}
        <HomeIndicator />

        {/* MODALS */}
        {isAddModalOpen && (
          <Suspense fallback={null}>
            <AddHabitModal
              isOpen={isAddModalOpen}
              onClose={() => setIsAddModalOpen(false)}
              onAddHabit={handleAddHabit}
              userId={session.id}
              isGuest={session.isGuest}
              activeHabitCount={countActiveHabits(habits)}
              activeKeystoneCount={countActiveKeystones(habits)}
            />
          </Suspense>
        )}

        {Boolean(detailHabit) && (
          <Suspense fallback={null}>
            <HabitDetailModal
              habit={detailHabit}
              isOpen={Boolean(detailHabit)}
              onClose={() => setDetailHabit(null)}
              onDeleteHabit={(habitId) => {
                const target = habits.find((item) => item.id === habitId) || detailHabit;
                setDetailHabit(null);
                if (target) setDeleteConfirmHabit(target);
              }}
              onUpdateHabit={handleUpdateHabit}
              onArchiveHabit={handleArchiveHabit}
              todayIndex={todayDayIndex}
              activeKeystoneCount={countActiveKeystones(habits)}
            />
          </Suspense>
        )}

        {Boolean(deleteConfirmHabit) && (
          <Suspense fallback={null}>
            <DeleteHabitConfirmModal
              habit={deleteConfirmHabit}
              isOpen={Boolean(deleteConfirmHabit)}
              onClose={() => setDeleteConfirmHabit(null)}
              onConfirm={() => {
                if (deleteConfirmHabit) {
                  handleDeleteHabit(deleteConfirmHabit.id);
                  setDeleteConfirmHabit(null);
                }
              }}
            />
          </Suspense>
        )}

        {Boolean(activeFrictionPrompt) && (
          <Suspense fallback={null}>
            <FrictionAuditModal
              isOpen={Boolean(activeFrictionPrompt)}
              habitName={activeFrictionPrompt?.habitName || ''}
              loggedDate={activeFrictionPrompt?.loggedDate}
              onSubmit={handleFrictionSubmit}
              onSkip={handleFrictionSkip}
            />
          </Suspense>
        )}

        {isLedgerModalOpen && (
          <Suspense fallback={null}>
            <IdentityLedgerModal
              isOpen={isLedgerModalOpen}
              onClose={handleCloseLedgerModal}
              evidenceList={ledgerEvidence}
              identityVoteCount={displayedIdentityVotes}
              onAddVote={(name, statement, cat) => {
                const newEv: IdentityEvidence = {
                  id: 'ev-manual-' + Date.now(),
                  habitId: 'manual',
                  habitName: name,
                  identityStatement: statement,
                  category: cat,
                  date: new Date().toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  }),
                  dayNumber: selectedDay,
                  loggedDate: toISODate(),
                };
                setEvidenceList((prev) => [newEv, ...prev]);
                appendMomentumLog(
                  createMomentumEvent(
                    { id: newMomentumEventId(), category: cat },
                    'full',
                    toISODate(),
                    Date.now()
                  )
                );
              }}
            />
          </Suspense>
        )}


        {/* Upgrade Guest Modal */}
        <MotionModal
          isOpen={isUpgradeModalOpen}
          onClose={() => setIsUpgradeModalOpen(false)}
          overlayClassName="bg-slate-900/60 backdrop-blur-xs"
          cardClassName="p-5 max-w-sm space-y-3"
        >
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-slate-900">Upgrade to Cloud Account</h3>
                <button
                  type="button"
                  onClick={() => setIsUpgradeModalOpen(false)}
                  className="text-slate-400 hover:text-slate-600 font-bold cursor-pointer"
                >
                  ✕
                </button>
              </div>
              <p className="text-[12px] text-slate-500">
                Sync your momentum, habits, and permanent Identity Ledger across all devices securely.
              </p>

              {upgradeError && (
                <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-[11.5px]">
                  {upgradeError}
                </div>
              )}

              <form onSubmit={handleUpgradeGuestSubmit} className="space-y-2.5">
                <div>
                  <label className="block text-[10.5px] font-bold text-slate-600 uppercase mb-0.5">
                    Your Name
                  </label>
                  <input
                    type="text"
                    required
                    value={upgradeName}
                    onChange={(e) => setUpgradeName(e.target.value)}
                    placeholder="e.g. Maya Lin"
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-[12.5px] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-[10.5px] font-bold text-slate-600 uppercase mb-0.5">
                    Email Address
                  </label>
                  <input
                    type="email"
                    required
                    value={upgradeEmail}
                    onChange={(e) => setUpgradeEmail(e.target.value)}
                    placeholder="name@example.com"
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-[12.5px] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-[10.5px] font-bold text-slate-600 uppercase mb-0.5">
                    Create Password
                  </label>
                  <input
                    type="password"
                    required
                    value={upgradePassword}
                    onChange={(e) => setUpgradePassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-[12.5px] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:focus:ring-blue-500"
                  />
                </div>

                <div className="flex space-x-2 pt-2">
                  <motion.button
                    type="button"
                    whileTap={tapPress}
                    onClick={() => setIsUpgradeModalOpen(false)}
                    className="flex-1 py-2 rounded-xl bg-slate-100 text-slate-700 font-semibold text-[11.5px] hover:bg-slate-200 cursor-pointer"
                  >
                    Cancel
                  </motion.button>
                  <motion.button
                    type="submit"
                    whileTap={upgradeLoading ? undefined : tapPress}
                    disabled={upgradeLoading}
                    className="flex-1 py-2 rounded-xl bg-emerald-600 dark:bg-blue-600 text-white font-bold text-[11.5px] hover:bg-emerald-700 dark:hover:bg-blue-500 cursor-pointer disabled:opacity-50"
                  >
                    {upgradeLoading ? 'Saving...' : 'Upgrade Now'}
                  </motion.button>
                </div>
              </form>
        </MotionModal>

        {/* Change Password Modal */}
        <MotionModal
          isOpen={isPasswordModalOpen}
          onClose={() => {
            if (passwordChangeLoading) return;
            setIsPasswordModalOpen(false);
            setPasswordStatusMsg(null);
            setPasswordChangeError(null);
            setNewPasswordText('');
          }}
          overlayClassName="bg-slate-900/60 backdrop-blur-xs"
          cardClassName="p-5 max-w-sm space-y-3"
        >
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-slate-900 dark:text-white">Change Password</h3>
                <button
                  type="button"
                  disabled={passwordChangeLoading}
                  onClick={() => {
                    setIsPasswordModalOpen(false);
                    setPasswordStatusMsg(null);
                    setPasswordChangeError(null);
                    setNewPasswordText('');
                  }}
                  className="text-slate-400 hover:text-slate-600 font-bold cursor-pointer disabled:opacity-50"
                >
                  ✕
                </button>
              </div>

              {passwordStatusMsg && (
                <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-blue-950 border border-emerald-200 dark:border-blue-800 text-emerald-800 dark:text-blue-300 text-[11.5px]">
                  {passwordStatusMsg}
                </div>
              )}

              {passwordChangeError && (
                <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 text-[11.5px]">
                  {passwordChangeError}
                </div>
              )}

              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (passwordChangeLoading) return;
                  setPasswordChangeError(null);
                  setPasswordStatusMsg(null);
                  setPasswordChangeLoading(true);
                  try {
                    // Real Auth call: supabase.auth.updateUser via authService → PATCH {SUPABASE_URL}/auth/v1/user
                    const err = await authService.changePassword(newPasswordText);
                    if (err) {
                      setPasswordChangeError(err);
                      return;
                    }
                    setPasswordStatusMsg('Password updated successfully.');
                    setNewPasswordText('');
                    setTimeout(() => {
                      setIsPasswordModalOpen(false);
                      setPasswordStatusMsg(null);
                    }, 1800);
                  } catch (err) {
                    setPasswordChangeError(
                      err instanceof Error ? err.message : 'Password change failed.'
                    );
                  } finally {
                    setPasswordChangeLoading(false);
                  }
                }}
                className="space-y-3"
              >
                <div>
                  <label className="block text-[10.5px] font-bold text-slate-600 dark:text-slate-400 uppercase mb-0.5">
                    New Password
                  </label>
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={newPasswordText}
                    onChange={(e) => setNewPasswordText(e.target.value)}
                    placeholder="At least 6 characters"
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-[12.5px] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:focus:ring-blue-500"
                  />
                </div>

                <div className="flex space-x-2 pt-1">
                  <motion.button
                    type="button"
                    whileTap={passwordChangeLoading ? undefined : tapPress}
                    disabled={passwordChangeLoading}
                    onClick={() => {
                      setIsPasswordModalOpen(false);
                      setPasswordStatusMsg(null);
                      setPasswordChangeError(null);
                      setNewPasswordText('');
                    }}
                    className="flex-1 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold text-[11.5px] hover:bg-slate-200 cursor-pointer disabled:opacity-50"
                  >
                    Cancel
                  </motion.button>
                  <motion.button
                    type="submit"
                    whileTap={passwordChangeLoading ? undefined : tapPress}
                    disabled={passwordChangeLoading}
                    className="flex-1 py-2 rounded-xl bg-slate-900 dark:bg-blue-600 text-white font-bold text-[11.5px] hover:bg-slate-800 dark:hover:bg-blue-500 cursor-pointer disabled:opacity-60 flex items-center justify-center space-x-1.5"
                  >
                    {passwordChangeLoading ? (
                      <>
                        <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        <span>Saving...</span>
                      </>
                    ) : (
                      <span>Save Changes</span>
                    )}
                  </motion.button>
                </div>
              </form>
        </MotionModal>

      </div>
    </div>
  );
}
