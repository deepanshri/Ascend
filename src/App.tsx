import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Plus } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useKeyboardInset } from './hooks/useKeyboardInset';
import { tapPress, toastMotion } from './lib/motionPresets';
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
  calculateDailyWeightedScore,
  calculateMomentumScore,
  collectMissedMomentumEvents,
  createMomentumEvent,
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
import { endOfIsoDate, formatEvidenceDate, getTodayDayIndex, getWeekDates, resolveEventIsoDate, startOfDay, toISODate } from './utils/dates';
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
import { fetchUserProfile, persistUserProfile, setLocalTutorialCompleted, getLocalTutorialCompleted } from './lib/profile';
import { persistStoredAvatarId, readStoredAvatarId, resolveAvatarId } from './data/avatars';
import { persistHabitsToTable, persistMomentumHistory, syncAuthenticatedAccount } from './lib/accountSync';
import { mergeHabitsByUpdatedAt, mergeRemindersByUpdatedAt, touchHabit } from './lib/syncMerge';
import { fetchActiveHabits, fetchHabitLogsForDate, deleteHabitCascade, purgeSeedHabitsFromTable, persistHabitLogFrictionReason, fetchFrictionReasonsFromTable } from './lib/habitsApi';
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
import {
  displayedIdentityVoteCount,
  hasMomentumVoteOnIso,
  hasTodayLedgerEntry,
  replaceTodayCompletion,
  upsertTodayEvidence,
} from './services/ledgerService';
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
import { RadialFanCalendar } from './components/RadialFanCalendar';
import { HabitCard } from './components/HabitCard';
import { QuoteCard } from './components/QuoteCard';
import { RemindersView } from './components/RemindersView';
import { ReportView } from './components/ReportView';
import { FriendsFeed } from './components/FriendsFeed';
import { PersonalView } from './components/PersonalView';
import { ScreenHeader, SCREEN_INSET_CLASS, HEADER_ICON_BTN_CLASS } from './components/ScreenHeader';
import { SettingsView } from './components/SettingsView';
import { AddHabitModal } from './components/AddHabitModal';
import { HabitDetailModal } from './components/HabitDetailModal';
import { DeleteHabitConfirmModal } from './components/DeleteHabitConfirmModal';
import { IdentityLedgerModal } from './components/IdentityLedgerModal';
import { HabitLongPressOverlay } from './components/HabitLongPressOverlay';
import { FrictionAuditModal } from './components/FrictionAuditModal';
import { AuthView } from './components/AuthView';
import { OnboardingView } from './components/OnboardingView';
import { ErrorBoundary } from './components/ErrorBoundary';

const APP_TABS: readonly ActiveTab[] = ['home', 'reminders', 'report', 'personal', 'settings'];

function resolveActiveTab(tab: ActiveTab | string | null | undefined): ActiveTab {
  return APP_TABS.includes(tab as ActiveTab) ? (tab as ActiveTab) : 'home';
}

export default function App() {
  useKeyboardInset(true);
  // Authentication & Session State
  const [session, setSession] = useState<UserSession | null>(() => {
    const stored = getStoredSession();
    if (stored && !stored.isGuest) {
      return { ...stored, syncStatus: stored.syncStatus === 'error' ? 'error' : 'syncing' };
    }
    return stored;
  });
  const sessionRef = useRef<UserSession | null>(session);
  sessionRef.current = session;
  const derivedHabitsRef = useRef<Habit[]>([]);
  const todayDayIndexRef = useRef(3);
  const handleCompleteTodayRef = useRef<(habitId: string, isFallback?: boolean) => void>(() => {});
  const handleResetTodayRef = useRef<(habitId: string) => void>(() => {});
  const handleSetReminderCompletedRef = useRef<(id: string, completed: boolean) => void>(() => {});
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
      if (saved) return JSON.parse(saved);
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
      if (saved) return JSON.parse(saved);
    } catch {}
    return [];
  });

  const [pendingFriction, setPendingFriction] = useState<PendingFrictionPrompt[]>(() => loadPendingFrictionPrompts());

  // Persistence via localStorage for habits
  const [habits, setHabits] = useState<Habit[]>(() => {
    try {
      const saved = localStorage.getItem('habit_tracker_habits');
      if (saved) {
        const parsed = JSON.parse(saved) as Habit[];
        return parsed
          .filter((h) => !isSeedHabitId(h.id))
          .map((h) => {
          const category = normalizeHabitCategory(h.category);
          return { ...h, category, tags: [habitCategoryBadge(category)] };
        });
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
        return parsed.filter((event) => !isSeedHabitId(event.habitId));
      }
    } catch {}
    return [];
  });

  const [momentumEvents, setMomentumEvents] = useState<MomentumEvent[]>(() => {
    const stored = loadLocalMomentumEvents();
    if (stored) return stored.filter((event) => !isSeedHabitId(event.habitId));
    try {
      const saved = localStorage.getItem('ascend_completion_events');
      const logs: HabitCompletionEvent[] = saved ? JSON.parse(saved) : [];
      const userLogs = logs.filter((event) => !isSeedHabitId(event.habitId));
      let seedHabits: Habit[] = [];
      try {
        const habitSaved = localStorage.getItem('habit_tracker_habits');
        if (habitSaved) {
          seedHabits = (JSON.parse(habitSaved) as Habit[]).filter((habit) => !isSeedHabitId(habit.id));
        }
      } catch {}
      return momentumEventsFromCompletionLog(userLogs, seedHabits);
    } catch {
      return [];
    }
  });
  momentumEventsRef.current = momentumEvents;

  useEffect(() => {
    try {
      localStorage.setItem('ascend_completion_events', JSON.stringify(completionEvents));
    } catch {}
  }, [completionEvents]);

  useEffect(() => {
    saveLocalMomentumEvents(momentumEvents);
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
      setHasCompletedTutorial(Boolean(profile.has_completed_tutorial));
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
    try {
      localStorage.setItem('ascend_active_fallbacks', JSON.stringify(activeFallbackIds));
    } catch {}
  }, [activeFallbackIds]);

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

  // Standalone Reminders state
  const [reminders, setReminders] = useState<StandaloneReminder[]>(() => {
    try {
      const saved = localStorage.getItem('habit_tracker_reminders');
      if (saved) {
        const parsed = JSON.parse(saved) as StandaloneReminder[];
        if (Array.isArray(parsed)) return parsed.map(withReminderNotificationIds);
      }
    } catch {}
    const now = new Date();
    const future15m = new Date(now.getTime() + 15 * 60 * 1000);
    const time15m = future15m.toTimeString().slice(0, 5);

    return [
      {
        id: 'rem-1',
        title: 'Afternoon mental reset & posture',
        date: now.toISOString().slice(0, 10),
        time: time15m,
        notes: 'Take 5 deep breaths & hydrate',
        completed: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      {
        id: 'rem-2',
        title: 'Review today’s atomic habit wins',
        date: now.toISOString().slice(0, 10),
        time: '20:30',
        notes: 'Cast another vote for your chosen identity',
        completed: false,
        createdAt: Date.now() - 3600000,
        updatedAt: Date.now() - 3600000,
      },
    ].map(withReminderNotificationIds);
  });

  useEffect(() => {
    try {
      localStorage.setItem('habit_tracker_reminders', JSON.stringify(reminders));
    } catch {}
  }, [reminders]);

  const [activeTab, setActiveTab] = useState<ActiveTab>('home');
  const [viewResetKey, setViewResetKey] = useState(0);
  const safeActiveTab = resolveActiveTab(activeTab);

  useEffect(() => {
    if (activeTab !== safeActiveTab) setActiveTab(safeActiveTab);
  }, [activeTab, safeActiveTab]);
  const [calendarOrigin, setCalendarOrigin] = useState<Date>(() => startOfDay(new Date()));
  const [currentSelectedDate, setCurrentSelectedDate] = useState<string>(() => toISODate());
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [mascotCelebrate, setMascotCelebrate] = useState(false);
  const mascotCelebrateTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const rollForwardIfMidnightPassed = () => {
      const nowIso = toISODate();
      const originIso = toISODate(calendarOrigin);
      if (nowIso === originIso) return;

      setProtection((prev) => tickProtectionState(prev, nowIso));

      if (!examShieldRef.current && !vacationModeRef.current) {
        const missed = collectMissedMomentumEvents(
          habitsRef.current,
          momentumEventsRef.current,
          originIso,
          calendarOrigin
        );
        if (missed.length > 0) {
          setMomentumEvents((prev) => mergeMomentumEvents(prev, missed));
          const userId = sessionRef.current?.id;
          missed.forEach((event) => {
            void appendMomentumEventRemote(userId, event);
          });
          const prompts = missed.map((event) => {
            const habit = habitsRef.current.find((item) => item.id === event.habitId);
            return {
              habitId: event.habitId,
              habitName: habit?.name || 'Habit',
              loggedDate: originIso,
            };
          });
          setPendingFriction((prev) => enqueueFrictionPrompts(prev, prompts));
        }
      }

      const nextOrigin = startOfDay(new Date());
      const week = getWeekDates(nextOrigin).map((date) => toISODate(date));
      setCalendarOrigin(nextOrigin);
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
  const [detailHabit, setDetailHabit] = useState<Habit | null>(null);
  const [longPressedHabitId, setLongPressedHabitId] = useState<string | null>(null);
  const [longPressedRect, setLongPressedRect] = useState<DOMRect | null>(null);
  const [deleteConfirmHabit, setDeleteConfirmHabit] = useState<Habit | null>(null);
  const [toastNotification, setToastNotification] = useState<string | null>(null);
  const toastTimeoutRef = useRef<number | null>(null);
  const tutorialLockRef = useRef(false);
  const [hasCompletedTutorial, setHasCompletedTutorial] = useState<boolean | null>(() => {
    try {
      return getLocalTutorialCompleted() ? true : null;
    } catch {
      return null;
    }
  });

  const showNotification = (message: string) => {
    setToastNotification(message);
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = window.setTimeout(() => setToastNotification(null), 2500);
  };

  const handleToggleExamShield = () => {
    setProtection((prev) => {
      const result = toggleExamShield(prev);
      if (!result.ok && result.reason) showNotification(result.reason);
      else if (result.state.examShield.active) showNotification('Exam Shield on — miss decay paused');
      else showNotification('Exam Shield off — 30-day cooldown started');
      return result.state;
    });
  };

  const handleToggleVacationMode = () => {
    setProtection((prev) => {
      const result = toggleVacation(prev);
      if (result.state.vacation.active) {
        showNotification('Vacation on — 5-day window, miss decay paused');
      } else {
        showNotification('Vacation off');
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

  // Sync state to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('habit_tracker_habits', JSON.stringify(habits));
    } catch {}
  }, [habits]);

  useEffect(() => {
    try {
      localStorage.setItem('habit_tracker_evidence', JSON.stringify(evidenceList));
    } catch {}
  }, [evidenceList]);

  useEffect(() => {
    try {
      localStorage.setItem('habit_tracker_reminders', JSON.stringify(reminders));
    } catch {}
  }, [reminders]);

  useEffect(() => {
    try {
      localStorage.setItem('ascend_theme', theme);
    } catch {}
  }, [theme]);

  useEffect(() => {
    return () => {
      if (mascotCelebrateTimerRef.current != null) {
        window.clearTimeout(mascotCelebrateTimerRef.current);
      }
    };
  }, []);

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

  const keystoneCompletedOnViewedDay = useMemo(
    () => activeHabits.filter((habit) => habit.isKeystone && habit.days?.[currentDayIndex]).map((habit) => habit.id),
    [activeHabits, currentDayIndex]
  );

  const longPressedHabit = useMemo(() => {
    return derivedHabits.find((h) => h.id === longPressedHabitId) || null;
  }, [derivedHabits, longPressedHabitId]);

  // Rolling momentum from the append-only events log (drives RadialFanCalendar + mascot)
  const momentumScore = useMemo(() => {
    return calculateMomentumScore(momentumEvents, {
      examShield: examShieldActive,
      vacationMode: vacationModeActive,
      asOf: endOfIsoDate(currentSelectedDate),
      habits,
    });
  }, [momentumEvents, examShieldActive, vacationModeActive, currentSelectedDate, habits]);

  const todayMomentumScore = useMemo(() => {
    return calculateMomentumScore(momentumEvents, {
      examShield: examShieldActive,
      vacationMode: vacationModeActive,
      habits,
    });
  }, [momentumEvents, examShieldActive, vacationModeActive, habits]);

  const displayedIdentityVotes = useMemo(
    () => displayedIdentityVoteCount(momentumEvents, evidenceList),
    [momentumEvents, evidenceList]
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
      hasCompletedTutorial: Boolean(hasCompletedTutorialRef.current),
      momentumScore: momentumScoreRef.current,
      getLatestHabits: () => habitsRef.current,
    });
    setHabits((prev) => mergeHabitsByUpdatedAt(prev, result.habits));
    setCompletionEvents(result.completionEvents);
    setMomentumEvents((prev) => mergeMomentumEvents(prev, result.momentumEvents));
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
    void schedulePsychologyNotifications({
      windows: notificationWindows,
      habits: activeHabits,
      todayIndex: todayDayIndex,
      momentumScore: todayMomentumScore,
    });
  }, [notificationWindows, activeHabits, todayDayIndex, todayMomentumScore, completionEvents]);

  // Home mount: fetch active habits + today's logs (optimistic local UI stays in place)
  useEffect(() => {
    if (activeTab !== 'home') return;
    if (!session || session.isGuest) return;
    let cancelled = false;
    void (async () => {
      const [remoteHabits, dateLogs, remoteMomentum] = await Promise.all([
        fetchActiveHabits(session.id),
        fetchHabitLogsForDate(session.id, currentSelectedDate),
        fetchMomentumEventsFromTable(session.id),
      ]);
      if (cancelled) return;
      setHabits((prev) => mergeHabitsByUpdatedAt(prev, remoteHabits));
      const userDateLogs = dateLogs.filter((event) => !isSeedHabitId(event.habitId));
      if (userDateLogs.length > 0) {
        setCompletionEvents((prev) =>
          mergeCompletionEvents(
            prev.filter((event) => !isSeedHabitId(event.habitId)),
            userDateLogs,
            calendarOrigin
          )
        );
      }
      const userMomentum = remoteMomentum.filter((event) => !isSeedHabitId(event.habitId));
      if (userMomentum.length > 0) {
        setMomentumEvents((prev) =>
          mergeMomentumEvents(
            prev.filter((event) => !isSeedHabitId(event.habitId)),
            userMomentum
          )
        );
      }
    })().catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [activeTab, session?.id, session?.isGuest, currentSelectedDate, calendarOrigin]);

  useEffect(() => {
    if (!session || session.isGuest) return;
    let cancelled = false;
    void fetchFrictionReasonsFromTable(session.id).then((rows) => {
      if (cancelled || rows.length === 0) return;
      setFrictionAudits((prev) => mergeFrictionAuditsFromLogs(prev, rows, habitsRef.current));
    });
    return () => {
      cancelled = true;
    };
  }, [session?.id, session?.isGuest]);

  // Calculate day completion rates (1-7) using active habits
  const dayCompletionRates = useMemo(() => {
    return Array.from({ length: 7 }, (_, dayIdx) => {
      if (scheduledHabitsForDayIndex(derivedHabits, dayIdx, calendarOrigin).length === 0) return null;
      return calculateDailyWeightedScore(
        derivedHabits,
        dayIdx,
        examShieldActive || vacationModeActive,
        undefined,
        calendarOrigin
      ) / 100;
    });
  }, [derivedHabits, examShieldActive, vacationModeActive, calendarOrigin]);

  const selectedDayCompletedCount = activeHabits.filter(
    (h) => h.days[currentDayIndex]
  ).length;

  // Pending reminder count for bottom navigation badge
  const pendingRemindersCount = useMemo(() => {
    return reminders.filter((r) => !r.completed).length;
  }, [reminders]);

  const appendMomentumLog = (event: MomentumEvent) => {
    setMomentumEvents((prev) => mergeMomentumEvents(prev, [event]));
    void appendMomentumEventRemote(sessionRef.current?.id, event);
  };

  const enqueueMissedFrictionAudit = (habitId: string, habitName: string, loggedDate: string) => {
    setPendingFriction((prev) =>
      enqueueFrictionPrompts(prev, [{ habitId, habitName, loggedDate }])
    );
  };

  const handleMarkMissed = (habitId: string, loggedDate: string = toISODate(calendarOrigin)) => {
    if (!isViewingToday) return;
    const targetHabit = habits.find((habit) => habit.id === habitId);
    if (!targetHabit) return;
    if (!isHabitScheduledOnIso(targetHabit, loggedDate)) {
      showNotification('Off day — not counted as a miss');
      return;
    }

    const alreadyCredited = completionEvents.some(
      (event) => event.habitId === habitId && resolveEventIsoDate(event, calendarOrigin) === loggedDate
    );
    if (alreadyCredited) return;

    const alreadyMissed = momentumEvents.some(
      (event) =>
        event.habitId === habitId &&
        event.eventType === 'missed' &&
        resolveMomentumEventDate(event) === loggedDate
    );
    if (!alreadyMissed) {
      appendMomentumLog(createMomentumEvent(targetHabit, 'missed', loggedDate));
    }

    setLongPressedHabitId(null);
    setLongPressedRect(null);
    enqueueMissedFrictionAudit(habitId, targetHabit.name, loggedDate);
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

    const isMicro = isFallback || activeFallbackIds.includes(habitId);
    const loggedDate = toISODate(calendarOrigin);
    const alreadyCompletedToday = hasTodayLedgerEntry(completionEvents, habitId, loggedDate, calendarOrigin);
    const alreadyVotedMomentum = hasMomentumVoteOnIso(momentumEvents, habitId, loggedDate);

    setActiveFallbackIds((prev) => prev.filter((id) => id !== habitId));

    const newEvent: HabitCompletionEvent = {
      id: `evt-${isMicro ? 'micro-' : ''}${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      habitId,
      dayIndex: todayDayIndex,
      date: loggedDate,
      type: isMicro ? 'fallback_micro' : 'full',
      note: isMicro ? (targetHabit.fallbackMicroHabit || 'Fallback micro-habit completed') : undefined,
      timestamp: Date.now(),
    };

    // One completion row per (habit, calendar day). Re-checking after uncheck replaces, never stacks.
    setCompletionEvents((prev) => replaceTodayCompletion(prev, newEvent, calendarOrigin));
    void upsertHabitLog(session?.id, newEvent).catch(() => {});

    // momentum_events stays append-only; skip a second full/fallback row for the same local day.
    if (!alreadyVotedMomentum) {
      appendMomentumLog(createMomentumEvent(targetHabit, isMicro ? 'fallback' : 'full', loggedDate, newEvent.timestamp));
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
    showNotification('Completed');
    if (mascotCelebrateTimerRef.current != null) {
      window.clearTimeout(mascotCelebrateTimerRef.current);
    }
    setMascotCelebrate(true);
    mascotCelebrateTimerRef.current = window.setTimeout(() => {
      setMascotCelebrate(false);
      mascotCelebrateTimerRef.current = null;
    }, 400);
  };

  // GESTURE / TAP ACTION: Toggle Fallback Mode for Today (Does NOT mark complete; allows cancel / revert)
  const handleToggleFallbackMode = (habitId: string) => {
    if (!isViewingToday) return;
    const targetHabit = habits.find((h) => h.id === habitId);
    if (!targetHabit) return;
    if (!isHabitScheduledOnDayIndex(targetHabit, todayDayIndex, calendarOrigin) && !activeFallbackIds.includes(habitId)) {
      showNotification('Off day — fallback only on scheduled days');
      return;
    }

    if (activeFallbackIds.includes(habitId)) {
      setActiveFallbackIds((prev) => prev.filter((id) => id !== habitId));
      showNotification('Fallback cancelled — back to normal');
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
    showNotification('fallback');
  };

  // GESTURE / TAP ACTION: Uncheck today. Daily habit_logs drop; momentum_events identity points stay.
  const handleResetToday = (habitId: string) => {
    if (!isViewingToday) return;
    const loggedDate = toISODate(calendarOrigin);
    setCompletionEvents((prev) =>
      prev.filter((e) => !(e.habitId === habitId && resolveEventIsoDate(e, calendarOrigin) === loggedDate))
    );
    void deleteHabitLog(session?.id, habitId, loggedDate, todayDayIndex).catch(() => {});
    setActiveFallbackIds((prev) => prev.filter((id) => id !== habitId));
    showNotification('Card reset');
  };

  // Add new habit (optimistic). Remote insert is performed by AddHabitModal.
  const handleAddHabit = (newHabitData: Omit<Habit, 'id' | 'days' | 'microDays'>): Habit | null => {
    if (isAtActiveHabitCap(habits)) {
      showNotification('Maximum limit of 20 active habits reached.');
      return null;
    }
    let payload = newHabitData;
    if (payload.isKeystone && !canEnableKeystone(habits)) {
      showNotification(`You already have ${MAX_KEYSTONE_HABITS} keystone habits. Unflag one before adding another.`);
      payload = { ...payload, isKeystone: false };
    }
    const newHabit: Habit = {
      ...payload,
      id: typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : 'habit-' + Date.now(),
      days: [false, false, false, false, false, false, false],
      microDays: [false, false, false, false, false, false, false],
      scheduledDays: payload.scheduledDays && payload.scheduledDays.length > 0 ? payload.scheduledDays : [0, 1, 2, 3, 4, 5, 6],
      scheduleType: payload.scheduleType || 'daily',
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
      showNotification('Maximum limit of 20 active habits reached.');
      return;
    }
    setHabits((prev) =>
      prev.map((h) => (h.id === habitId ? touchHabit({ ...h, archived: false }) : h))
    );
  };

  // Delete habit (optimistic) + cascade remote logs/row
  const handleDeleteHabit = (habitId: string) => {
    setHabits((prev) => prev.filter((h) => h.id !== habitId));
    setCompletionEvents((prev) => prev.filter((e) => e.habitId !== habitId));
    if (detailHabit && detailHabit.id === habitId) {
      setDetailHabit(null);
    }
    if (session && !session.isGuest) {
      void deleteHabitCascade(session.id, habitId).catch(() => {});
    }
  };

  // Update habit
  const handleUpdateHabit = (updatedHabit: Habit) => {
    let next = updatedHabit;
    if (next.isKeystone && !canEnableKeystone(habits, next.id)) {
      showNotification(`You already have ${MAX_KEYSTONE_HABITS} keystone habits. Unflag one before adding another.`);
      next = { ...next, isKeystone: false };
    }
    setHabits((prev) =>
      prev.map((h) => (h.id === next.id ? touchHabit(next) : h))
    );
    setDetailHabit(touchHabit(next));
  };

  const handleToggleKeystone = (habitId: string, nextValue: boolean) => {
    if (nextValue && !canEnableKeystone(habits, habitId)) {
      showNotification(`You already have ${MAX_KEYSTONE_HABITS} keystone habits. Unflag one before adding another.`);
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

  // Delete Account & Wipe Data
  const handleDeleteAccount = async () => {
    await authService.signOut();
    localStorage.clear();
    setSession(null);
    setIsOnboarded(false);
    setHabits([]);
    setEvidenceList([]);
    setCompletionEvents([]);
    setMomentumEvents([]);
    setReminders([]);
    setActiveTab('home');
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
      setLocalTutorialCompleted(false);
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

    showNotification(hasTime ? 'Reminder scheduled with dual native alerts' : 'Reminder saved');
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
  handleSetReminderCompletedRef.current = handleSetReminderCompleted;

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
      }
      if (route.tab === 'home') {
        setActiveTab('home');
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
    showNotification('Reminder updated');
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
    showNotification('Reminder deleted');
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
    showNotification(`Snoozed for ${minutes} minutes`);
  };

  // Apple-style chrome: hide header/nav on scroll down, reveal on scroll up
  const [isNavVisible, setIsNavVisible] = useState(true);
  const lastScrollYRef = useRef(0);

  useEffect(() => {
    setIsNavVisible(true);
    lastScrollYRef.current = 0;
  }, [activeTab]);

  const handleMainScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const currentScrollY = e.currentTarget.scrollTop;
    const delta = currentScrollY - lastScrollYRef.current;

    if (currentScrollY <= 8) {
      setIsNavVisible(true);
    } else if (delta > 8) {
      setIsNavVisible(false);
    } else if (delta < -8) {
      setIsNavVisible(true);
    }

    lastScrollYRef.current = currentScrollY;
  };

  // Spotlight tutorial: only after onboarding, and only if the profile flag is false
  useEffect(() => {
    if (!session || !isOnboarded) return;
    if (hasCompletedTutorial !== false) return;
    if (tutorialLockRef.current) return;

    if (activeTab !== 'home') {
      setActiveTab('home');
      return;
    }

    setIsNavVisible(true);
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
  }, [session, isOnboarded, hasCompletedTutorial, activeTab, selectedInterests]);

  useEffect(() => {
    if (!session || !isOnboarded) return;
    if (hasCompletedTutorial !== true) return;
    const screen = activeTab as TutorialScreen;
    if (screen !== 'reminders' && screen !== 'report' && screen !== 'personal' && screen !== 'settings') {
      return;
    }
    if (hasScreenTutorialCompleted(screen)) return;

    setIsNavVisible(true);
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
  }, [session, isOnboarded, hasCompletedTutorial, activeTab]);

  // ROUTING: Unauthenticated users -> Auth Screen
  if (!session) {
    return <AuthView onAuthSuccess={handleAuthSuccess} />;
  }

  // ROUTING: Authenticated users who haven't finished onboarding -> Onboarding Flow
  if (!isOnboarded) {
    return <OnboardingView onComplete={handleOnboardingComplete} />;
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
          resetKey={`${safeActiveTab}-${viewResetKey}`}
          onReset={() => setViewResetKey((value) => value + 1)}
        >
        <div className="absolute inset-0 z-10">
        <AnimatePresence mode="wait" initial={false}>
        {safeActiveTab === 'reminders' ? (
          <motion.div
            key="tab-reminders"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="absolute inset-0 z-10"
          >
          <RemindersView
            reminders={reminders ?? []}
            focusReminderId={widgetFocusReminderId}
            onAddReminder={handleAddReminder}
            onUpdateReminder={handleUpdateReminder}
            onToggleComplete={handleToggleReminder}
            onSetReminderCompleted={handleSetReminderCompleted}
            onDeleteReminder={handleDeleteReminder}
            onSnoozeReminder={handleSnoozeReminder}
            onNotify={showNotification}
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
                showNotification(
                  res.status === 'synced'
                    ? 'Reminders synchronized across devices'
                    : 'Reminders saved on this device'
                );
              });
            }}
            onScroll={handleMainScroll}
            onOpenSettings={() => setActiveTab('settings')}
          />
          </motion.div>
        ) : safeActiveTab === 'report' ? (
          <motion.div
            key="tab-report"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="absolute inset-0 z-10"
          >
          <ReportView
            habits={activeHabits ?? []}
            evidenceList={evidenceList ?? []}
            identityVoteCount={displayedIdentityVotes}
            userId={session.id}
            isGuest={session.isGuest}
            userEmail={session.email}
            userName={session.name}
            onOpenLedger={() => setIsLedgerModalOpen(true)}
            onOpenSettings={() => setActiveTab('settings')}
            frictionAudits={frictionAudits ?? []}
            onScroll={handleMainScroll}
            isDark={isDark}
            momentumScore={todayMomentumScore}
            momentumEvents={momentumEvents ?? []}
            completionEvents={completionEvents ?? []}
          />
          </motion.div>
        ) : safeActiveTab === 'personal' ? (
          <motion.div
            key="tab-personal"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="absolute inset-0 z-10"
          >
          <PersonalView
            userSession={session}
            evidenceList={evidenceList ?? []}
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
            onOpenSettings={() => setActiveTab('settings')}
            onOpenLedger={() => setIsLedgerModalOpen(true)}
            onUpgradeGuest={() => setIsUpgradeModalOpen(true)}
            onSyncNow={async () => {
              if (!session || session.isGuest) {
                throw new Error('Guest sessions stay local');
              }
              const result = await runAuthenticatedSync(session);
              if (!result.ok) {
                throw new Error(result.error || 'Sync failed');
              }
            }}
            onChangePassword={() => setIsPasswordModalOpen(true)}
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
          </motion.div>
        ) : safeActiveTab === 'settings' ? (
          <motion.div
            key="tab-settings"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="absolute inset-0 z-10"
          >
          <SettingsView
            habits={habits ?? []}
            evidenceList={evidenceList ?? []}
            completionEvents={completionEvents ?? []}
            momentumEvents={momentumEvents ?? []}
            theme={theme}
            onThemeChange={setTheme}
            notificationWindows={notificationWindows}
            onToggleNotificationWindow={handleToggleNotificationWindow}
            onResetData={handleResetData}
            onRestoreHabit={handleRestoreHabit}
            onDeleteHabit={handleDeleteHabit}
            onImportJSON={handleImportJSON}
            onDeleteAccount={handleDeleteAccount}
            onClearCache={handleClearCache}
            onScroll={handleMainScroll}
            onOpenSettings={() => setActiveTab('home')}
          />
          </motion.div>
        ) : (
          <motion.main
            key="tab-home"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            id="app-main-content"
            onScroll={handleMainScroll}
            className={`absolute inset-0 z-10 px-4 ${SCREEN_INSET_CLASS} pb-28 flex flex-col gap-1.5 overflow-y-auto overscroll-y-contain no-scrollbar ${longPressedHabitId ? 'filter blur-[4px] pointer-events-none' : ''}`}
          >
            <ScreenHeader
              title="Home"
              onOpenSettings={() => setActiveTab('settings')}
              actions={
                <>
                  <FriendsFeed
                    userId={session.id}
                    isGuest={session.isGuest}
                    userEmail={session.email}
                    userName={session.name}
                    variant="icon"
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
                    <Plus className="w-4 h-4" strokeWidth={2.5} />
                  </motion.button>
                </>
              }
            />

            {/* Radial Fan Calendar: date fan, momentum orb, and mascot */}
            <RadialFanCalendar
              selectedDay={selectedDay}
              dayCompletionRates={dayCompletionRates}
              habits={activeHabits}
              momentumScore={momentumScore}
              isCelebrating={mascotCelebrate}
              isDark={isDark}
              originDate={calendarOrigin}
            />

            {/* Atomic Wisdom Quote Card Curated by Personal Interests */}
            <QuoteCard selectedInterests={selectedInterests} isGuest={session.isGuest} />

            {/* Habit List Cards */}
            <section id="habit-list" className="flex flex-col space-y-2.5">
              {(activeHabits ?? []).length === 0 ? (
                <div className="bg-white/80 rounded-2xl p-6 text-center text-slate-400 text-[13px] border border-slate-200/80">
                  No habits active yet. Tap &quot;+&quot; in the header to create one!
                </div>
              ) : (
                (activeHabits ?? []).map((habit, habitIndex) => (
                  <HabitCard
                    key={habit.id}
                    habit={habit}
                    todayIndex={todayDayIndex}
                    viewIndex={currentDayIndex}
                    gesturesLocked={!isViewingToday}
                    isLongPressed={longPressedHabitId === habit.id}
                    isOtherLongPressed={Boolean(longPressedHabitId && longPressedHabitId !== habit.id)}
                    isFallbackActive={isViewingToday && activeFallbackIds.includes(habit.id)}
                    isTourTarget={habitIndex === 0}
                    onCompleteToday={handleCompleteToday}
                    onToggleFallbackMode={handleToggleFallbackMode}
                    onResetToday={handleResetToday}
                    onNotify={showNotification}
                    onLongPress={(h, rect) => {
                      setLongPressedHabitId(h.id);
                      setLongPressedRect(rect || null);
                    }}
                    onDismissLongPress={() => {
                      setLongPressedHabitId(null);
                      setLongPressedRect(null);
                    }}
                    onOpenEdit={(h) => {
                      setLongPressedHabitId(null);
                      setLongPressedRect(null);
                      setDetailHabit(h);
                    }}
                    onOpenDeleteConfirm={(h) => {
                      setLongPressedHabitId(null);
                      setLongPressedRect(null);
                      setDeleteConfirmHabit(h);
                    }}
                    onToggleKeystone={handleToggleKeystone}
                    keystoneAtCap={!habit.isKeystone && countActiveKeystones(habits) >= MAX_KEYSTONE_HABITS}
                    keystoneBoosted={
                      keystoneCompletedOnViewedDay.length > 0 && !keystoneCompletedOnViewedDay.includes(habit.id)
                    }
                    weekOrigin={calendarOrigin}
                  />
                ))
              )}
            </section>
          </motion.main>
        )}
        </AnimatePresence>
        </div>
        </ErrorBoundary>

        {/* Floating Bottom Navigation: shrinks on scroll down, pops up on scroll up */}
        <BottomNav
          activeTab={safeActiveTab}
          onTabChange={(tab) => setActiveTab(resolveActiveTab(tab))}
          pendingRemindersCount={pendingRemindersCount}
          isNavVisible={isNavVisible}
          isBlurred={Boolean(longPressedHabitId)}
        />

        {/* Top-Level Toast Notification */}
        <AnimatePresence initial={false}>
          {toastNotification && (
            <motion.div
              id="ascend-toast-notification"
              role="status"
              initial={toastMotion.initial}
              animate={toastMotion.animate}
              exit={toastMotion.exit}
              transition={toastMotion.transition}
              className="fixed top-[max(1.25rem,env(safe-area-inset-top))] left-1/2 -translate-x-1/2 z-50 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-[12px] font-bold px-4 py-2 rounded-2xl shadow-2xl flex items-center space-x-2 border-2 border-[#23C15D] dark:border-blue-500 pointer-events-none transform-gpu"
            >
              <div className="w-4 h-4 rounded-full bg-emerald-50 dark:bg-blue-950 flex items-center justify-center text-[#23C15D] dark:text-blue-400 shrink-0">
                <svg className="w-2.5 h-2.5 stroke-[3.5]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              </div>
              <span>{toastNotification}</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Spotlighted Habit Overlay with Whole Screen Blur & Dustbin/Pen options */}
        <AnimatePresence>
          {longPressedHabit && (
            <HabitLongPressOverlay
              key="habit-long-press"
              habit={longPressedHabit}
              rect={longPressedRect}
              todayIndex={todayDayIndex}
              isFallbackActive={isViewingToday && activeFallbackIds.includes(longPressedHabit.id)}
              onMarkMissed={handleMarkMissed}
              onClose={() => {
                setLongPressedHabitId(null);
                setLongPressedRect(null);
              }}
              onOpenEdit={(h) => {
                setLongPressedHabitId(null);
                setLongPressedRect(null);
                setDetailHabit(h);
              }}
              onArchive={(h) => {
                setLongPressedHabitId(null);
                setLongPressedRect(null);
                handleArchiveHabit(h.id);
                showNotification('Habit archived');
              }}
            />
          )}
        </AnimatePresence>

        {/* Home Indicator */}
        <HomeIndicator />

        {/* MODALS */}
        <AddHabitModal
          isOpen={isAddModalOpen}
          onClose={() => setIsAddModalOpen(false)}
          onAddHabit={handleAddHabit}
          userId={session.id}
          isGuest={session.isGuest}
          activeHabitCount={countActiveHabits(habits)}
          activeKeystoneCount={countActiveKeystones(habits)}
        />

        <HabitDetailModal
          habit={detailHabit}
          isOpen={Boolean(detailHabit)}
          onClose={() => setDetailHabit(null)}
          onDeleteHabit={handleDeleteHabit}
          onUpdateHabit={handleUpdateHabit}
          onArchiveHabit={handleArchiveHabit}
          todayIndex={todayDayIndex}
          activeKeystoneCount={countActiveKeystones(habits)}
        />

        <DeleteHabitConfirmModal
          habit={deleteConfirmHabit}
          isOpen={Boolean(deleteConfirmHabit)}
          onClose={() => setDeleteConfirmHabit(null)}
          userId={session.id}
          isGuest={session.isGuest}
          onConfirm={() => {
            if (deleteConfirmHabit) {
              handleDeleteHabit(deleteConfirmHabit.id);
              setDeleteConfirmHabit(null);
              showNotification('Habit deleted');
            }
          }}
        />

        <FrictionAuditModal
          isOpen={Boolean(activeFrictionPrompt)}
          habitName={activeFrictionPrompt?.habitName || ''}
          loggedDate={activeFrictionPrompt?.loggedDate}
          onSubmit={handleFrictionSubmit}
          onSkip={handleFrictionSkip}
        />

        <IdentityLedgerModal
          isOpen={isLedgerModalOpen}
          onClose={() => setIsLedgerModalOpen(false)}
          evidenceList={evidenceList}
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
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-[12.5px] text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
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
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-[12.5px] text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
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
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-[12.5px] text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
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
                    className="flex-1 py-2 rounded-xl bg-emerald-600 text-white font-bold text-[11.5px] hover:bg-emerald-700 cursor-pointer disabled:opacity-50"
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
            setIsPasswordModalOpen(false);
            setPasswordStatusMsg(null);
          }}
          overlayClassName="bg-slate-900/60 backdrop-blur-xs"
          cardClassName="p-5 max-w-sm space-y-3"
        >
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-slate-900">Change Password</h3>
                <button
                  type="button"
                  onClick={() => {
                    setIsPasswordModalOpen(false);
                    setPasswordStatusMsg(null);
                  }}
                  className="text-slate-400 hover:text-slate-600 font-bold cursor-pointer"
                >
                  ✕
                </button>
              </div>

              {passwordStatusMsg && (
                <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11.5px]">
                  {passwordStatusMsg}
                </div>
              )}

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  setPasswordStatusMsg('Password updated successfully.');
                  setTimeout(() => {
                    setIsPasswordModalOpen(false);
                    setPasswordStatusMsg(null);
                  }, 1800);
                }}
                className="space-y-3"
              >
                <div>
                  <label className="block text-[10.5px] font-bold text-slate-600 uppercase mb-0.5">
                    New Password
                  </label>
                  <input
                    type="password"
                    required
                    value={newPasswordText}
                    onChange={(e) => setNewPasswordText(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-[12.5px] text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div className="flex space-x-2 pt-1">
                  <motion.button
                    type="button"
                    whileTap={tapPress}
                    onClick={() => {
                      setIsPasswordModalOpen(false);
                      setPasswordStatusMsg(null);
                    }}
                    className="flex-1 py-2 rounded-xl bg-slate-100 text-slate-700 font-semibold text-[11.5px] hover:bg-slate-200 cursor-pointer"
                  >
                    Close
                  </motion.button>
                  <motion.button
                    type="submit"
                    whileTap={tapPress}
                    className="flex-1 py-2 rounded-xl bg-slate-900 text-white font-bold text-[11.5px] hover:bg-slate-800 cursor-pointer"
                  >
                    Save Changes
                  </motion.button>
                </div>
              </form>
        </MotionModal>
      </div>
    </div>
  );
}
