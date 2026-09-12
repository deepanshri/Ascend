import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Habit,
  IdentityEvidence,
  ActiveTab,
  StandaloneReminder,
  UserSession,
  ThemeMode,
  FrictionAudit,
  HabitCompletionEvent,
} from './types';
import { INITIAL_HABITS, INITIAL_EVIDENCE, INITIAL_COMPLETION_EVENTS } from './data/initialHabits';
import { calculateMomentumScore, deriveHabitsFromEventLog, fetchHabitLogsFromTable, mergeCompletionEvents, upsertHabitLog, deleteHabitLog } from './utils/momentum';
import { formatEvidenceDate, getTodayDayIndex } from './utils/dates';
import { habitCategoryBadge, normalizeHabitCategory } from './utils/categories';
import { applyNativeChrome } from './lib/nativeChrome';
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
} from './lib/supabase';
import { fetchUserProfile, persistUserProfile, setLocalTutorialCompleted, getLocalTutorialCompleted } from './lib/profile';
import { startAscendSpotlightTutorial, destroyAscendSpotlightTutorial } from './lib/tutorial';
import { HomeIndicator } from './components/HomeIndicator';
import { BottomNav } from './components/BottomNav';
import { RadialFanCalendar } from './components/RadialFanCalendar';
import { HabitCard } from './components/HabitCard';
import { QuoteCard } from './components/QuoteCard';
import { RemindersView } from './components/RemindersView';
import { ReportView } from './components/ReportView';
import { PersonalView } from './components/PersonalView';
import { SettingsView } from './components/SettingsView';
import { AddHabitModal } from './components/AddHabitModal';
import { HabitDetailModal } from './components/HabitDetailModal';
import { DeleteHabitConfirmModal } from './components/DeleteHabitConfirmModal';
import { IdentityLedgerModal } from './components/IdentityLedgerModal';
import { HabitLongPressOverlay } from './components/HabitLongPressOverlay';
import { AuthView } from './components/AuthView';
import { OnboardingView } from './components/OnboardingView';

export default function App() {
  // Authentication & Session State
  const [session, setSession] = useState<UserSession | null>(() => getStoredSession());
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

  useEffect(() => {
    try {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      const onChange = (e: MediaQueryListEvent) => setSystemPrefersDark(e.matches);
      mq.addEventListener('change', onChange);
      return () => mq.removeEventListener('change', onChange);
    } catch {}
  }, []);

  // Exam Shield / Vacation Mode state
  const [examShieldActive, setExamShieldActive] = useState<boolean>(() => {
    try {
      return localStorage.getItem('ascend_exam_shield') === 'true';
    } catch {
      return false;
    }
  });

  const [vacationModeActive, setVacationModeActive] = useState<boolean>(() => {
    try {
      return localStorage.getItem('ascend_vacation_mode') === 'true';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('ascend_exam_shield', examShieldActive ? 'true' : 'false');
    } catch {}
  }, [examShieldActive]);

  useEffect(() => {
    try {
      localStorage.setItem('ascend_vacation_mode', vacationModeActive ? 'true' : 'false');
    } catch {}
  }, [vacationModeActive]);

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
        void persistUserProfile(session, { interests: next });
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
    return [
      {
        id: 'fa-1',
        date: 'Yesterday',
        dayNumber: 3,
        habitName: 'Deep Work & Flow',
        type: 'fallback_used',
        note: 'Low energy after travel — executed 2-min micro-habit write session instead of quitting.',
        timestamp: Date.now() - 86400000,
      },
    ];
  });

  // Persistence via localStorage for habits
  const [habits, setHabits] = useState<Habit[]>(() => {
    try {
      const saved = localStorage.getItem('habit_tracker_habits');
      if (saved) {
        const parsed = JSON.parse(saved) as Habit[];
        return parsed.map((h) => {
          const category = normalizeHabitCategory(h.category);
          return { ...h, category, tags: [habitCategoryBadge(category)] };
        });
      }
    } catch {}
    return INITIAL_HABITS;
  });

  // Append-only immutable completion event log (ground truth for habit history)
  const [completionEvents, setCompletionEvents] = useState<HabitCompletionEvent[]>(() => {
    try {
      const saved = localStorage.getItem('ascend_completion_events');
      if (saved) return JSON.parse(saved);
    } catch {}
    return INITIAL_COMPLETION_EVENTS;
  });

  useEffect(() => {
    try {
      localStorage.setItem('ascend_completion_events', JSON.stringify(completionEvents));
    } catch {}
  }, [completionEvents]);

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
      setHasCompletedTutorial(Boolean(profile.has_completed_tutorial));
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.id, session?.isGuest]);

  // Hydrate completion logs from Supabase `habit_logs` (ground truth for momentum)
  useEffect(() => {
    if (!session || session.isGuest) return;
    let cancelled = false;
    void (async () => {
      const remoteLogs = await fetchHabitLogsFromTable(session.id);
      if (cancelled || remoteLogs.length === 0) return;
      setCompletionEvents((prev) => mergeCompletionEvents(prev, remoteLogs));
    })();
    return () => {
      cancelled = true;
    };
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
        return parsed.map((item) => ({
          ...item,
          category: normalizeHabitCategory(item.category),
        }));
      }
    } catch {}
    return INITIAL_EVIDENCE;
  });

  // Standalone Reminders state
  const [reminders, setReminders] = useState<StandaloneReminder[]>(() => {
    try {
      const saved = localStorage.getItem('habit_tracker_reminders');
      if (saved) return JSON.parse(saved);
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
    ];
  });

  useEffect(() => {
    try {
      localStorage.setItem('habit_tracker_reminders', JSON.stringify(reminders));
    } catch {}
  }, [reminders]);

  const [activeTab, setActiveTab] = useState<ActiveTab>('home');
  const [selectedDay, setSelectedDay] = useState<number>(() => getTodayDayIndex() + 1);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isLedgerModalOpen, setIsLedgerModalOpen] = useState(false);
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
    if (isSupabaseConfigured && supabase) {
      supabase.auth.getSession().then(({ data }) => {
        if (data?.session?.user) {
          const user = data.session.user;
          const restoredSession: UserSession = {
            id: user.id,
            email: user.email || '',
            name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'Ascender',
            avatarUrl: user.user_metadata?.avatar_url || generateAvatarUrl(user.email || 'User'),
            isGuest: false,
            memberSince: new Date(user.created_at || Date.now()).toLocaleDateString('en-US', {
              month: 'short',
              year: 'numeric',
            }),
            syncStatus: 'synced',
          };
          setSession(restoredSession);
          setStoredSession(restoredSession);
        }
      }).catch(() => {});

      const { data: authListener } = supabase.auth.onAuthStateChange((_event, supabaseSession) => {
        if (supabaseSession?.user) {
          const user = supabaseSession.user;
          const updatedSession: UserSession = {
            id: user.id,
            email: user.email || '',
            name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'Ascender',
            avatarUrl: user.user_metadata?.avatar_url || generateAvatarUrl(user.email || 'User'),
            isGuest: false,
            memberSince: new Date(user.created_at || Date.now()).toLocaleDateString('en-US', {
              month: 'short',
              year: 'numeric',
            }),
            syncStatus: 'synced',
          };
          setSession(updatedSession);
          setStoredSession(updatedSession);
        }
      });

      return () => {
        authListener?.subscription?.unsubscribe();
      };
    }
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
    const dark = theme === 'dark' || (theme === 'system' && systemPrefersDark);
    void applyNativeChrome(dark);
  }, [theme, systemPrefersDark]);

  useEffect(() => {
    try {
      localStorage.setItem('ascend_exam_shield', examShieldActive ? 'true' : 'false');
    } catch {}
  }, [examShieldActive]);

  useEffect(() => {
    try {
      localStorage.setItem('ascend_friction_audits', JSON.stringify(frictionAudits));
    } catch {}
  }, [frictionAudits]);

  const todayDayIndex = getTodayDayIndex();
  const currentDayIndex = selectedDay - 1;

  // Derive habit states (days, microDays) by replaying the append-only event log
  const derivedHabits = useMemo(() => {
    return deriveHabitsFromEventLog(habits, completionEvents, todayDayIndex);
  }, [habits, completionEvents, todayDayIndex]);

  // Non-archived habits for core active calculations
  const activeHabits = useMemo(() => {
    return derivedHabits.filter((h) => !h.archived);
  }, [derivedHabits]);

  const longPressedHabit = useMemo(() => {
    return derivedHabits.find((h) => h.id === longPressedHabitId) || null;
  }, [derivedHabits, longPressedHabitId]);

  // Momentum Engine Score (0 to 100) based on habit_logs + local completion events
  const momentumScore = useMemo(() => {
    return calculateMomentumScore(habits, currentDayIndex, examShieldActive, completionEvents);
  }, [habits, currentDayIndex, examShieldActive, completionEvents]);

  // Calculate day completion rates (1-7) using active habits
  const dayCompletionRates = Array.from({ length: 7 }, (_, dayIdx) => {
    if (activeHabits.length === 0) return 0;
    const completedCount = activeHabits.filter((h) => h.days[dayIdx]).length;
    return completedCount / activeHabits.length;
  });

  const selectedDayCompletedCount = activeHabits.filter(
    (h) => h.days[currentDayIndex]
  ).length;

  // Pending reminder count for bottom navigation badge
  const pendingRemindersCount = useMemo(() => {
    return reminders.filter((r) => !r.completed).length;
  }, [reminders]);

  // GESTURE / TAP ACTION: Complete Today (Full 100% or Fallback Micro 50%)
  const handleCompleteToday = (habitId: string, isFallback: boolean = false) => {
    const targetHabit = habits.find((h) => h.id === habitId);
    if (!targetHabit) return;

    const isMicro = isFallback || activeFallbackIds.includes(habitId);

    // Clear any previous today completion event for this habit to allow switching / updating cleanly
    setCompletionEvents((prev) =>
      prev.filter((e) => !(e.habitId === habitId && e.dayIndex === todayDayIndex))
    );

    // Remove from active fallback state
    setActiveFallbackIds((prev) => prev.filter((id) => id !== habitId));

    const newEvent: HabitCompletionEvent = {
      id: `evt-${isMicro ? 'micro-' : ''}${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      habitId,
      dayIndex: todayDayIndex,
      date: new Date().toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      }),
      type: isMicro ? 'fallback_micro' : 'full',
      note: isMicro ? (targetHabit.fallbackMicroHabit || 'Fallback micro-habit completed') : undefined,
      timestamp: Date.now(),
    };

    setCompletionEvents((prev) => [...prev, newEvent]);
    void upsertHabitLog(session?.id, newEvent);

    // Clean up previous today's evidence for this habit
    setEvidenceList((prev) =>
      prev.filter((e) => !(e.habitId === habitId && e.dayNumber === todayDayIndex + 1))
    );

    const newEvidence: IdentityEvidence = {
      id: `ev-${isMicro ? 'micro-' : ''}${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      habitId,
      habitName: isMicro ? `${targetHabit.name} (Micro-Habit)` : targetHabit.name,
      identityStatement: isMicro
        ? `Micro-Habit vote: ${targetHabit.identityStatement || 'Non-zero progress'}`
        : (targetHabit.identityStatement || 'I am consistent and disciplined'),
      category: targetHabit.category || 'work',
      date: `${formatEvidenceDate()} • ${isMicro ? 'Fallback micro (50%)' : 'Completed (100%)'}`,
      dayNumber: todayDayIndex + 1,
    };
    setEvidenceList((evPrev) => [newEvidence, ...evPrev]);

    if (isMicro) {
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
      showNotification('Completed');
    } else {
      showNotification('Completed');
    }
  };

  // GESTURE / TAP ACTION: Toggle Fallback Mode for Today (Does NOT mark complete; allows cancel / revert)
  const handleToggleFallbackMode = (habitId: string) => {
    const targetHabit = habits.find((h) => h.id === habitId);
    if (!targetHabit) return;

    if (activeFallbackIds.includes(habitId)) {
      // If already in fallback mode -> cancel it and return to normal
      setActiveFallbackIds((prev) => prev.filter((id) => id !== habitId));
      showNotification('Fallback cancelled — back to normal');
      return;
    }

    // If habit was already completed today, unmark it so it can transition to fallback
    const alreadyLogged = completionEvents.some(
      (e) => e.habitId === habitId && e.dayIndex === todayDayIndex
    );
    if (alreadyLogged) {
      setCompletionEvents((prev) =>
        prev.filter((e) => !(e.habitId === habitId && e.dayIndex === todayDayIndex))
      );
      setEvidenceList((prev) =>
        prev.filter((e) => !(e.habitId === habitId && e.dayNumber === todayDayIndex + 1))
      );
      void deleteHabitLog(session?.id, habitId, todayDayIndex);
    }

    // Activate fallback mode (not complete yet!)
    setActiveFallbackIds((prev) => [...prev, habitId]);
    showNotification('fallback');
  };

  // GESTURE / TAP ACTION: Cancel / Reset Today's completion or fallback back to normal
  const handleResetToday = (habitId: string) => {
    // Remove completion event for today
    setCompletionEvents((prev) =>
      prev.filter((e) => !(e.habitId === habitId && e.dayIndex === todayDayIndex))
    );
    void deleteHabitLog(session?.id, habitId, todayDayIndex);

    // Remove evidence for today
    setEvidenceList((prev) =>
      prev.filter((e) => !(e.habitId === habitId && e.dayNumber === todayDayIndex + 1))
    );

    // Remove friction audit for today
    const habitName = habits.find((h) => h.id === habitId)?.name;
    if (habitName) {
      setFrictionAudits((prev) =>
        prev.filter((a) => !(a.habitName === habitName && a.dayNumber === todayDayIndex + 1))
      );
    }

    // Deactivate fallback mode
    setActiveFallbackIds((prev) => prev.filter((id) => id !== habitId));

    showNotification('Habit reset to normal');
  };

  // Add new habit
  const handleAddHabit = (newHabitData: Omit<Habit, 'id' | 'days' | 'microDays'>) => {
    const newHabit: Habit = {
      ...newHabitData,
      id: 'habit-' + Date.now(),
      days: [false, false, false, false, false, false, false],
      microDays: [false, false, false, false, false, false, false],
    };
    setHabits((prev) => [newHabit, ...prev]);
  };

  // Archive habit
  const handleArchiveHabit = (habitId: string) => {
    setHabits((prev) =>
      prev.map((h) => (h.id === habitId ? { ...h, archived: true } : h))
    );
    if (detailHabit && detailHabit.id === habitId) {
      setDetailHabit(null);
    }
  };

  // Restore archived habit
  const handleRestoreHabit = (habitId: string) => {
    setHabits((prev) =>
      prev.map((h) => (h.id === habitId ? { ...h, archived: false } : h))
    );
  };

  // Delete habit
  const handleDeleteHabit = (habitId: string) => {
    setHabits((prev) => prev.filter((h) => h.id !== habitId));
    if (detailHabit && detailHabit.id === habitId) {
      setDetailHabit(null);
    }
  };

  // Update habit
  const handleUpdateHabit = (updatedHabit: Habit) => {
    setHabits((prev) =>
      prev.map((h) => (h.id === updatedHabit.id ? updatedHabit : h))
    );
    setDetailHabit(updatedHabit);
  };

  // Reset demo data
  const handleResetData = () => {
    setHabits(INITIAL_HABITS);
    setEvidenceList(INITIAL_EVIDENCE);
    setCompletionEvents(INITIAL_COMPLETION_EVENTS);
    setActiveFallbackIds([]);
    localStorage.removeItem('habit_tracker_habits');
    localStorage.removeItem('habit_tracker_evidence');
    localStorage.removeItem('ascend_completion_events');
    localStorage.removeItem('ascend_active_fallbacks');
  };

  // Import JSON backup
  const handleImportJSON = (
    importedHabits: Habit[],
    importedEvidence?: IdentityEvidence[],
    importedEvents?: HabitCompletionEvent[]
  ) => {
    setHabits(importedHabits);
    if (importedEvidence && Array.isArray(importedEvidence)) {
      setEvidenceList(importedEvidence);
    }
    if (importedEvents && Array.isArray(importedEvents)) {
      setCompletionEvents(importedEvents);
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
    setHabits(INITIAL_HABITS);
    setEvidenceList(INITIAL_EVIDENCE);
    setCompletionEvents(INITIAL_COMPLETION_EVENTS);
    setReminders([]);
    setActiveTab('home');
  };

  // Auth Success handler
  const handleAuthSuccess = (newSession: UserSession, isNewUser?: boolean) => {
    setSession(newSession);
    setStoredSession(newSession);
    if (isNewUser) {
      setIsOnboarded(false);
      setOnboardingCompleted(false);
      setHasCompletedTutorial(false);
      setLocalTutorialCompleted(false);
      tutorialLockRef.current = false;
    } else {
      setIsOnboarded(true);
      setOnboardingCompleted(true);
    }
  };

  // Onboarding Complete handler
  const handleOnboardingComplete = (firstHabit?: Habit) => {
    if (firstHabit) {
      setHabits((prev) => [firstHabit, ...prev]);
    }
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

  // Boot-Completed Alert Re-scheduler: survives app force-quit & reboot
  useEffect(() => {
    notificationScheduler.bootReschedulePendingAlerts((title, message) => {
      showNotification(`${title}: ${message}`);
    });
  }, []);

  // Standalone Reminders Handlers with Supabase LWW sync and OS-level alerts
  const handleAddReminder = (
    newRem: Omit<StandaloneReminder, 'id' | 'completed' | 'createdAt' | 'updatedAt'>
  ) => {
    const now = Date.now();
    const item: StandaloneReminder = {
      ...newRem,
      id: 'rem-' + now + '-' + Math.random().toString(36).substring(2, 6),
      completed: false,
      alert10Min: newRem.alert10Min !== false,
      alertExact: newRem.alertExact !== false,
      createdAt: now,
      updatedAt: now,
    };

    // Schedule OS-level alerts at creation time (10min prior + exact time)
    notificationScheduler.scheduleReminderAlerts(item, (title, message) => {
      showNotification(`${title}: ${message}`);
    });

    setReminders((prev) => {
      const updated = [item, ...prev];
      // Sync via Supabase Last-Write-Wins module
      remindersSyncService.syncReminders(updated, session);
      return updated;
    });

    showNotification('Reminder scheduled with alerts');
  };

  const handleToggleReminder = (id: string) => {
    const now = Date.now();
    setReminders((prev) => {
      const updated = prev.map((r) => {
        if (r.id === id) {
          const nextCompleted = !r.completed;
          if (nextCompleted) {
            notificationScheduler.cancelReminderAlerts(id);
          } else {
            notificationScheduler.scheduleReminderAlerts(
              { ...r, completed: false, updatedAt: now },
              (title, message) => showNotification(`${title}: ${message}`)
            );
          }
          return { ...r, completed: nextCompleted, updatedAt: now };
        }
        return r;
      });
      remindersSyncService.syncReminders(updated, session);
      return updated;
    });
  };

  const handleSetReminderCompleted = (id: string, completed: boolean) => {
    const now = Date.now();
    setReminders((prev) => {
      const updated = prev.map((r) => {
        if (r.id === id) {
          if (r.completed === completed) return r;
          if (completed) {
            notificationScheduler.cancelReminderAlerts(id);
          } else {
            notificationScheduler.scheduleReminderAlerts(
              { ...r, completed: false, updatedAt: now },
              (title, message) => showNotification(`${title}: ${message}`)
            );
          }
          return { ...r, completed, updatedAt: now };
        }
        return r;
      });
      remindersSyncService.syncReminders(updated, session);
      return updated;
    });
  };

  const handleUpdateReminder = (
    id: string,
    updates: Partial<Omit<StandaloneReminder, 'id' | 'createdAt'>>
  ) => {
    const now = Date.now();
    setReminders((prev) => {
      const updated = prev.map((r) => {
        if (r.id === id) {
          const revised = { ...r, ...updates, updatedAt: now };
          notificationScheduler.cancelReminderAlerts(id);
          if (!revised.completed) {
            notificationScheduler.scheduleReminderAlerts(revised, (title, message) => {
              showNotification(`${title}: ${message}`);
            });
          }
          return revised;
        }
        return r;
      });
      remindersSyncService.syncReminders(updated, session);
      return updated;
    });
    showNotification('Reminder updated');
  };

  const handleDeleteReminder = (id: string) => {
    const now = Date.now();
    notificationScheduler.cancelReminderAlerts(id);
    setReminders((prev) => {
      const itemToDelete = prev.find((r) => r.id === id);
      const updated = prev.filter((r) => r.id !== id);
      if (itemToDelete) {
        // Last-Write-Wins tombstone sync
        remindersSyncService.syncReminders(
          [...updated, { ...itemToDelete, deleted: true, updatedAt: now }],
          session
        );
      }
      return updated;
    });
    showNotification('Reminder deleted');
  };

  const handleSnoozeReminder = (id: string, minutes: number) => {
    const now = new Date();
    const nowTimestamp = Date.now();
    now.setMinutes(now.getMinutes() + minutes);
    const newTime = now.toTimeString().slice(0, 5);

    setReminders((prev) => {
      const updated = prev.map((r) => {
        if (r.id === id) {
          const snoozed = { ...r, time: newTime, updatedAt: nowTimestamp };
          notificationScheduler.scheduleReminderAlerts(snoozed, (title, message) => {
            showNotification(`${title}: ${message}`);
          });
          return snoozed;
        }
        return r;
      });
      remindersSyncService.syncReminders(updated, session);
      return updated;
    });
    showNotification(`Snoozed for ${minutes} minutes`);
  };

  const handleAddFrictionNote = (habitName: string, note: string) => {
    const newAudit: FrictionAudit = {
      id: 'fa-' + Date.now(),
      date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      dayNumber: selectedDay,
      habitName,
      type: 'fallback_used',
      note,
      timestamp: Date.now(),
    };
    setFrictionAudits((prev) => [newAudit, ...prev]);
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
        if (!session.isGuest) {
          void persistUserProfile(session, {
            has_completed_tutorial: true,
            interests: selectedInterests,
          });
        }
      });
    }, 700);

    return () => window.clearTimeout(timer);
  }, [session, isOnboarded, hasCompletedTutorial, activeTab, selectedInterests]);

  // ROUTING: Unauthenticated users -> Auth Screen
  if (!session) {
    return <AuthView onAuthSuccess={handleAuthSuccess} />;
  }

  // ROUTING: Authenticated users who haven't finished onboarding -> Onboarding Flow
  if (!isOnboarded) {
    return <OnboardingView onComplete={handleOnboardingComplete} />;
  }

  // Theme styling classes (system follows OS preference)
  const isDark = theme === 'dark' || (theme === 'system' && systemPrefersDark);
  const themeBgClass = isDark
    ? 'dark bg-slate-950 text-slate-100'
    : 'bg-[#F8FAF9] text-slate-900';

  return (
    <div
      id="app-root"
      className={`w-full h-full overflow-hidden select-none font-sans transition-colors duration-200 ${themeBgClass}`}
    >
      <div
        id="mobile-viewport"
        className="relative w-full h-full overflow-hidden"
      >
        <header
          className={`absolute top-0 left-0 right-0 z-30 px-4 pt-[max(0.25rem,env(safe-area-inset-top))] bg-[#F8FAF9]/95 dark:bg-slate-950/95 backdrop-blur-md ${longPressedHabitId ? 'filter blur-[4px] pointer-events-none' : ''}`}
          style={{
            transform: isNavVisible ? 'translateY(0)' : 'translateY(-100%)',
            transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            pointerEvents: isNavVisible && !longPressedHabitId ? 'auto' : 'none',
          }}
        >
          <div
            id="top-brand-settings-bar"
            className="flex items-center justify-between px-1 mt-2 mb-2 h-[44px]"
          >
            <div className="flex items-center space-x-2">
              <h1 className="text-[20px] font-black tracking-tight text-slate-900 dark:text-white flex items-center space-x-1.5">
                <span className="text-emerald-800 dark:text-blue-400">Ascend</span>
              </h1>
              {session.isGuest ? (
                <span className="text-[9.5px] px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 font-bold">
                  Guest
                </span>
              ) : (
                <span className="text-[9.5px] px-1.5 py-0.5 rounded-full bg-emerald-50 dark:bg-blue-950/60 text-emerald-800 dark:text-blue-300 border border-emerald-200 dark:border-blue-800 font-bold">
                  Synced
                </span>
              )}
              {examShieldActive && (
                <span className="text-[9.5px] px-1.5 py-0.5 rounded-full bg-emerald-100 dark:bg-blue-950 text-emerald-900 dark:text-blue-200 font-bold">
                  🛡️ Shield Active
                </span>
              )}
            </div>

            {/* Settings button in header */}
            <button
              id="top-settings-btn"
              type="button"
              onClick={() => setActiveTab(activeTab === 'settings' ? 'home' : 'settings')}
              title="Settings & Preferences"
              aria-label="Settings"
              className={`p-2 rounded-xl transition cursor-pointer ${
                activeTab === 'settings'
                  ? 'bg-slate-900 dark:bg-blue-600 text-white'
                  : 'bg-white/90 dark:bg-slate-900/90 border border-slate-200/90 dark:border-slate-800 text-slate-700 dark:text-slate-200 hover:bg-white dark:hover:bg-slate-800 shadow-xs'
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
            </button>
          </div>
        </header>

        {/* HOME TAB CONTENT */}
        {activeTab === 'home' && (
          <main
            id="app-main-content"
            onScroll={handleMainScroll}
            className={`absolute inset-0 z-10 px-4 pt-[calc(env(safe-area-inset-top)+4.25rem)] pb-28 flex flex-col gap-3 overflow-y-auto overscroll-y-contain no-scrollbar ${longPressedHabitId ? 'filter blur-[4px] pointer-events-none' : ''}`}
          >
            {/* Radial Fan Calendar: date fan, momentum orb, and mascot */}
            <RadialFanCalendar
              selectedDay={selectedDay}
              onSelectDay={setSelectedDay}
              dayCompletionRates={dayCompletionRates}
              habits={activeHabits}
              momentumScore={momentumScore}
              isCelebrating={false}
              isDark={isDark}
            />

            {/* Atomic Wisdom Quote Card Curated by Personal Interests */}
            <QuoteCard selectedInterests={selectedInterests} isGuest={session.isGuest} />

            {/* Habit List Header: "+" Button positioned directly above the habit list */}
            <div className="flex items-center justify-end pt-1 pb-0.5 px-0.5">
              {/* Add Habit Button: icon-only plus symbol with clean light styling */}
              <button
                id="add-habit-btn-above-list"
                type="button"
                onClick={() => setIsAddModalOpen(true)}
                aria-label="Add Habit"
                title="Add Habit"
                className="w-8 h-8 rounded-xl bg-white dark:bg-slate-900 border border-emerald-300 dark:border-blue-500 text-emerald-800 dark:text-blue-400 shadow-xs hover:bg-emerald-50 dark:hover:bg-blue-950 active:scale-95 transition cursor-pointer flex items-center justify-center"
              >
                <svg
                  className="w-4 h-4 stroke-[2.5] text-emerald-700 dark:text-blue-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
              </button>
            </div>

            {/* Habit List Cards */}
            <section id="habit-list" className="flex flex-col space-y-2.5">
              {activeHabits.length === 0 ? (
                <div className="bg-white/80 rounded-2xl p-6 text-center text-slate-400 text-[13px] border border-slate-200/80">
                  No habits active yet. Tap &quot;+&quot; above to create one!
                </div>
              ) : (
                activeHabits.map((habit, habitIndex) => (
                  <HabitCard
                    key={habit.id}
                    habit={habit}
                    todayIndex={todayDayIndex}
                    isLongPressed={longPressedHabitId === habit.id}
                    isOtherLongPressed={Boolean(longPressedHabitId && longPressedHabitId !== habit.id)}
                    isFallbackActive={activeFallbackIds.includes(habit.id)}
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
                  />
                ))
              )}
            </section>
          </main>
        )}

        {/* REMINDERS TAB */}
        {activeTab === 'reminders' && (
          <RemindersView
            reminders={reminders}
            onAddReminder={handleAddReminder}
            onUpdateReminder={handleUpdateReminder}
            onToggleComplete={handleToggleReminder}
            onSetReminderCompleted={handleSetReminderCompleted}
            onDeleteReminder={handleDeleteReminder}
            onSnoozeReminder={handleSnoozeReminder}
            onNotify={showNotification}
            userSession={session}
            onSyncReminders={() => {
              remindersSyncService.syncReminders(reminders, session).then((res) => {
                setReminders(res.reminders);
                showNotification('Reminders synchronized with Supabase');
              });
            }}
            onScroll={handleMainScroll}
          />
        )}

        {/* REPORT TAB */}
        {activeTab === 'report' && (
          <ReportView
            habits={activeHabits}
            evidenceList={evidenceList}
            onOpenLedger={() => setIsLedgerModalOpen(true)}
            examShieldActive={examShieldActive}
            onToggleExamShield={() => setExamShieldActive(!examShieldActive)}
            frictionAudits={frictionAudits}
            onAddFrictionNote={handleAddFrictionNote}
            onScroll={handleMainScroll}
            isDark={isDark}
            momentumScore={momentumScore}
          />
        )}

        {/* PERSONAL TAB */}
        {activeTab === 'personal' && (
          <PersonalView
            userSession={session}
            evidenceList={evidenceList}
            selectedInterests={selectedInterests}
            onToggleInterest={handleToggleInterest}
            examShieldActive={examShieldActive}
            onToggleExamShield={() => setExamShieldActive(!examShieldActive)}
            vacationModeActive={vacationModeActive}
            onToggleVacationMode={() => setVacationModeActive(!vacationModeActive)}
            onOpenLedger={() => setIsLedgerModalOpen(true)}
            onUpgradeGuest={() => setIsUpgradeModalOpen(true)}
            onSyncNow={async () => {
              if (isSupabaseConfigured && supabase && !session.isGuest) {
                try {
                  await supabase.auth.getUser();
                } catch {}
              }
              await new Promise<void>((r) => setTimeout(r, 600));
            }}
            onChangePassword={() => setIsPasswordModalOpen(true)}
            onLogout={handleDeleteAccount}
            onUpdateName={(newName) => {
              setSession((prev) => (prev ? { ...prev, name: newName } : prev));
            }}
            onScroll={handleMainScroll}
          />
        )}

        {/* SETTINGS TAB */}
        {activeTab === 'settings' && (
          <SettingsView
            habits={habits}
            evidenceList={evidenceList}
            completionEvents={completionEvents}
            theme={theme}
            onThemeChange={setTheme}
            onResetData={handleResetData}
            onRestoreHabit={handleRestoreHabit}
            onDeleteHabit={handleDeleteHabit}
            onImportJSON={handleImportJSON}
            onDeleteAccount={handleDeleteAccount}
            onClearCache={handleClearCache}
            onScroll={handleMainScroll}
          />
        )}

        {/* Floating Bottom Navigation: shrinks on scroll down, pops up on scroll up */}
        <BottomNav
          activeTab={activeTab}
          onTabChange={setActiveTab}
          pendingRemindersCount={pendingRemindersCount}
          isNavVisible={isNavVisible}
          isBlurred={Boolean(longPressedHabitId)}
        />

        {/* Top-Level Toast Notification */}
        {toastNotification && (
          <div
            id="ascend-toast-notification"
            className="fixed top-[max(1.25rem,env(safe-area-inset-top))] left-1/2 -translate-x-1/2 z-50 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-[12px] font-bold px-4 py-2 rounded-full shadow-2xl flex items-center space-x-2 border-2 border-[#23C15D] dark:border-blue-500 animate-in fade-in slide-in-from-top-2 duration-200 pointer-events-none"
          >
            <div className="w-4 h-4 rounded-full bg-emerald-50 dark:bg-blue-950 flex items-center justify-center text-[#23C15D] dark:text-blue-400 shrink-0">
              <svg className="w-2.5 h-2.5 stroke-[3.5]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            </div>
            <span>{toastNotification}</span>
          </div>
        )}

        {/* Spotlighted Habit Overlay with Whole Screen Blur & Dustbin/Pen options */}
        {longPressedHabit && (
          <HabitLongPressOverlay
            habit={longPressedHabit}
            rect={longPressedRect}
            todayIndex={todayDayIndex}
            isFallbackActive={activeFallbackIds.includes(longPressedHabit.id)}
            onToggleFallbackMode={handleToggleFallbackMode}
            onClose={() => {
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
          />
        )}

        {/* Home Indicator */}
        <HomeIndicator />

        {/* MODALS */}
        <AddHabitModal
          isOpen={isAddModalOpen}
          onClose={() => setIsAddModalOpen(false)}
          onAddHabit={handleAddHabit}
        />

        <HabitDetailModal
          habit={detailHabit}
          isOpen={Boolean(detailHabit)}
          onClose={() => setDetailHabit(null)}
          onDeleteHabit={handleDeleteHabit}
          onUpdateHabit={handleUpdateHabit}
          onArchiveHabit={handleArchiveHabit}
          todayIndex={todayDayIndex}
        />

        <DeleteHabitConfirmModal
          habit={deleteConfirmHabit}
          isOpen={Boolean(deleteConfirmHabit)}
          onClose={() => setDeleteConfirmHabit(null)}
          onConfirm={() => {
            if (deleteConfirmHabit) {
              handleDeleteHabit(deleteConfirmHabit.id);
              setDeleteConfirmHabit(null);
              showNotification('Habit deleted');
            }
          }}
        />

        <IdentityLedgerModal
          isOpen={isLedgerModalOpen}
          onClose={() => setIsLedgerModalOpen(false)}
          evidenceList={evidenceList}
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
            };
            setEvidenceList((prev) => [newEv, ...prev]);
          }}
        />

        {/* Upgrade Guest Modal */}
        {isUpgradeModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in">
            <div className="bg-white rounded-3xl p-5 max-w-sm w-full border border-slate-200 shadow-2xl space-y-3">
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
                  <button
                    type="button"
                    onClick={() => setIsUpgradeModalOpen(false)}
                    className="flex-1 py-2 rounded-xl bg-slate-100 text-slate-700 font-semibold text-[11.5px] hover:bg-slate-200 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={upgradeLoading}
                    className="flex-1 py-2 rounded-xl bg-emerald-600 text-white font-bold text-[11.5px] hover:bg-emerald-700 cursor-pointer disabled:opacity-50"
                  >
                    {upgradeLoading ? 'Saving...' : 'Upgrade Now'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Change Password Modal */}
        {isPasswordModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in">
            <div className="bg-white rounded-3xl p-5 max-w-sm w-full border border-slate-200 shadow-2xl space-y-3">
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
                  <button
                    type="button"
                    onClick={() => {
                      setIsPasswordModalOpen(false);
                      setPasswordStatusMsg(null);
                    }}
                    className="flex-1 py-2 rounded-xl bg-slate-100 text-slate-700 font-semibold text-[11.5px] hover:bg-slate-200 cursor-pointer"
                  >
                    Close
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-2 rounded-xl bg-slate-900 text-white font-bold text-[11.5px] hover:bg-slate-800 cursor-pointer"
                  >
                    Save Changes
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
