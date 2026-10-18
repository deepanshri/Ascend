import React, { createContext, startTransition, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { Habit, HabitCategory, HabitCompletionEvent, MomentumEvent } from '../types';
import { usePersistEffect } from '../hooks/usePersistedState';
import { readStorage, removeStorage, writeJson, writeStorage } from '../lib/storage';
import {
  ACTIVE_FALLBACKS_STORAGE_KEY,
  COMPLETION_EVENTS_STORAGE_KEY,
  EVIDENCE_STORAGE_KEY,
  FRICTION_AUDITS_STORAGE_KEY,
  HABITS_STORAGE_KEY,
} from '../lib/ledgerStorage';
import {
  loadStoredActiveFallbackIds,
  loadStoredCompletionEvents,
  loadStoredEvidence,
  loadStoredFrictionAudits,
  loadStoredHabits,
  loadStoredMomentumEvents,
  loadStoredRolledOverHabits,
  saveRolledOverHabits,
} from '../lib/ledgerStorageLoaders';
import {
  appendMomentumEventRemote,
  appendMomentumEventsRemote,
  MOMENTUM_EVENTS_STORAGE_KEY,
  saveLocalMomentumEvents,
} from '../lib/momentumEvents';
import {
  deleteHabitLog,
  newMomentumEventId,
  upsertHabitLog,
  upsertHabitLogs,
} from '../utils/momentum';
import { addDaysIso, getLocalDateString } from '../utils/dates';
import { computeDayRollover, missedMomentumEvents } from '../lib/dayRollover';
import {
  createMissedFrictionAudit,
  loadPendingFrictionPrompts,
  markFrictionPrompted,
  savePendingFrictionPrompts,
  unansweredFrictionPrompts,
} from '../lib/frictionAudit';
import { deletedHabitIdSet, persistHabitLogFrictionReason } from '../lib/habitsApi';
import { touchHabit } from '../lib/habitMerge';
import { hasLogOn } from '../lib/habitLogs';
import { registerBeforeSignOut } from '../lib/syncState';
import { cancelHabitTargetTimeNotification, scheduleHabitTargetTimeNotification } from '../lib/notifications';
import { deleteHabit as deleteHabitRemote } from '../services/habitService';
import { displayedIdentityVoteCount } from '../services/ledgerService';
import {
  ledgerReducer,
  EMPTY_LEDGER,
  type AccountSyncResult,
  type BackupContents,
  type LedgerAction,
  type LedgerState,
} from './ledgerReducer';
import {
  planCompletion,
  planGraceRollover,
  planManualVote,
  planNewHabit,
  planResetToday,
  planToggleFallback,
  type GraceRolloverPlan,
  type LedgerClock,
} from './ledgerPlans';
import { selectActiveHabits, selectDerivedHabits, selectTodayMomentumEvents, selectTodayMomentumScore } from './ledgerSelectors';
import { useCalendar } from './CalendarProvider';
import { useOnboarding } from './OnboardingProvider';
import { useProtection } from './ProtectionProvider';
import { useSession, useUserDataReset } from './SessionProvider';

/** Debounce for ledger writes so swipe-complete doesn't block the main thread. */
const STORAGE_DEBOUNCE_MS = 320;
/** Furthest calendar day the rollover has processed. */
const LAST_ACTIVE_STORAGE_KEY = 'ascend_last_active_date';
/** Undo window: a completion's momentum vote uploads after this, unless unchecked first. */
const GRACE_UPLOAD_DELAY_MS = 3000;

export interface LedgerContextState extends LedgerState {
  /** Habits with this week's days / microDays replayed from the completion log. */
  derivedHabits: Habit[];
  /** derivedHabits that are not archived. */
  activeHabits: Habit[];
  /** The momentum log merged with votes implied by the completion log. */
  todayMomentumEvents: MomentumEvent[];
  todayMomentumScore: number;
  /** Identity Ledger tally: one vote per habit per day, plus manual entries. */
  identityVoteCount: number;
}

export interface CompletionResult {
  newlyCompleted: boolean;
  isMicro: boolean;
  loggedDate: string;
}

export interface LedgerActions {
  /** Log today's completion (full, or micro when `isFallback` or fallback mode is on). Null when nothing changed. */
  completeToday: (habitId: string, isFallback?: boolean) => CompletionResult | null;
  toggleFallbackMode: (habitId: string) => void;
  resetToday: (habitId: string) => void;
  /** Grace-rollover every habit on today's banner. Returns how many were logged. */
  rolloverAll: () => number;
  /** Answer the current friction prompt with a grace rollover. Returns how many were logged. */
  frictionRolloverMicro: () => number;
  submitFriction: (reason: string) => void;
  skipFriction: () => void;
  addManualVote: (habitName: string, identityStatement: string, category: HabitCategory) => void;
  /** Null when the active-habit cap is reached. */
  addHabit: (data: Omit<Habit, 'id' | 'days' | 'microDays'>) => Habit | null;
  archiveHabit: (habitId: string) => void;
  restoreHabit: (habitId: string) => void;
  deleteHabit: (habitId: string) => void;
  /** Returns the stored (touched) habit. */
  updateHabit: (habit: Habit) => Habit;
  setKeystone: (habitId: string, value: boolean) => void;
  clearWorkspace: () => void;
  importBackup: (backup: BackupContents) => void;
  /** Sign-in: a new account starts empty, a returning one drops demo habits. */
  startAuth: (clearAll: boolean) => void;
  // Account sync
  applySync: (result: AccountSyncResult) => void;
  loadCompletionEvents: (events: HabitCompletionEvent[]) => void;
  mergeCycleLogs: (logs: HabitCompletionEvent[]) => void;
  mergeFrictionReasons: (rows: Array<{ habitId: string; loggedDate: string; reason: string }>) => void;
  pulseMomentum: () => void;
  /** The latest ledger, including changes not rendered yet. */
  getSnapshot: () => LedgerState;
  /** Called synchronously after every change is applied, before React renders it. */
  subscribe: (listener: () => void) => () => void;
}

const LedgerStateContext = createContext<LedgerContextState | null>(null);
const LedgerActionsContext = createContext<LedgerActions | null>(null);

function loadLedger(): LedgerState {
  return {
    ...EMPTY_LEDGER,
    habits: loadStoredHabits(),
    completionEvents: loadStoredCompletionEvents(),
    momentumEvents: loadStoredMomentumEvents(),
    evidenceList: loadStoredEvidence(),
    frictionAudits: loadStoredFrictionAudits(),
    pendingFriction: loadPendingFrictionPrompts(),
    activeFallbackIds: loadStoredActiveFallbackIds(),
    rolledOverHabits: loadStoredRolledOverHabits(getLocalDateString()),
  };
}

function newHabitId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `habit-${Date.now()}`;
}

export function HabitLedgerProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<LedgerState>(loadLedger);
  const stateRef = useRef(state);

  const { session } = useSession();
  const sessionIdRef = useRef(session?.id);
  sessionIdRef.current = session?.id;

  const calendar = useCalendar();
  const calendarRef = useRef(calendar);
  calendarRef.current = calendar;
  const { todayIso, calendarOrigin } = calendar;

  const { protectionWindows, paused } = useProtection();
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  const { isOnboarded, onboardingStep } = useOnboarding();
  /** Missed days are processed once onboarding is done or at its last step, like every other sync gate. */
  const processMissedDays = isOnboarded || onboardingStep >= 3;

  const listenersRef = useRef(new Set<() => void>());

  /** Apply an action now (the ref always holds the latest ledger) and schedule the render. */
  const commit = useCallback((action: LedgerAction, transition = false): LedgerState => {
    const next = ledgerReducer(stateRef.current, action);
    if (next !== stateRef.current) {
      stateRef.current = next;
      if (transition) startTransition(() => setState(next));
      else setState(next);
      for (const listener of listenersRef.current) listener();
    }
    return next;
  }, []);

  usePersistEffect(state.habits, (value) => writeJson(HABITS_STORAGE_KEY, value), STORAGE_DEBOUNCE_MS);
  usePersistEffect(state.completionEvents, (value) => writeJson(COMPLETION_EVENTS_STORAGE_KEY, value), STORAGE_DEBOUNCE_MS);
  usePersistEffect(state.momentumEvents, saveLocalMomentumEvents, STORAGE_DEBOUNCE_MS);
  usePersistEffect(state.evidenceList, (value) => writeJson(EVIDENCE_STORAGE_KEY, value), STORAGE_DEBOUNCE_MS);
  usePersistEffect(state.activeFallbackIds, (value) => writeJson(ACTIVE_FALLBACKS_STORAGE_KEY, value), STORAGE_DEBOUNCE_MS);
  usePersistEffect(state.frictionAudits, (value) => writeJson(FRICTION_AUDITS_STORAGE_KEY, value));
  usePersistEffect(state.pendingFriction, savePendingFrictionPrompts);
  usePersistEffect(state.rolledOverHabits, (value) => saveRolledOverHabits(getLocalDateString(), value));

  // Day rollover: decided by the pure computeDayRollover, applied as one action.
  useEffect(() => {
    const current = stateRef.current;
    const result = computeDayRollover({
      todayIso,
      lastActiveIso: readStorage(LAST_ACTIVE_STORAGE_KEY),
      habits: current.habits,
      momentumEvents: current.momentumEvents,
      protectionPaused: pausedRef.current,
      processMissedDays,
    });
    writeStorage(LAST_ACTIVE_STORAGE_KEY, result.lastActiveIso);
    const missedEvents = missedMomentumEvents(current.habits, result.missed);
    commit({
      type: 'DAY_ROLLOVER',
      dayChanged: result.dayChanged,
      clearActiveFallbacks: result.clearActiveFallbacks,
      graceHabitIds: result.graceHabitIds,
      missedEvents,
      frictionPrompts: unansweredFrictionPrompts(result.frictionPrompts),
    });
    // One request for every missed day, not one per event.
    if (missedEvents.length > 0) {
      void appendMomentumEventsRemote(sessionIdRef.current, missedEvents).catch(() => {});
    }
  }, [todayIso, processMissedDays, commit]);

  // Queued writes reaching the server can change momentum: pulse the score.
  useEffect(() => {
    const onSynced = () => commit({ type: 'MOMENTUM_PULSED' });
    window.addEventListener('ascend_offline_sync_completed', onSynced);
    return () => window.removeEventListener('ascend_offline_sync_completed', onSynced);
  }, [commit]);

  /** Momentum votes held back for the undo window, by habit. */
  const pendingGraceRef = useRef(new Map<string, { event: MomentumEvent; timer: number }>());

  const holdGraceUpload = useCallback((habitId: string, event: MomentumEvent) => {
    const pending = pendingGraceRef.current;
    const existing = pending.get(habitId);
    if (existing) window.clearTimeout(existing.timer);
    const timer = window.setTimeout(() => {
      pending.delete(habitId);
      void appendMomentumEventRemote(sessionIdRef.current, event).catch(() => {});
    }, GRACE_UPLOAD_DELAY_MS);
    pending.set(habitId, { event, timer });
  }, []);

  // Sign-out: send votes still inside the undo window now (queued if offline) instead of dropping them.
  useEffect(
    () =>
      registerBeforeSignOut(async () => {
        const held = [...pendingGraceRef.current.values()];
        pendingGraceRef.current.clear();
        for (const { timer } of held) window.clearTimeout(timer);
        await Promise.all(
          held.map(({ event }) => appendMomentumEventRemote(sessionIdRef.current, event).catch(() => {}))
        );
      }),
    []
  );

  useUserDataReset(() => {
    for (const pending of pendingGraceRef.current.values()) window.clearTimeout(pending.timer);
    pendingGraceRef.current.clear();
    // The previous user's habit alarms must not keep firing on this device.
    for (const habit of stateRef.current.habits) void cancelHabitTargetTimeNotification(habit.id);
    commit({ type: 'RESET_ALL' });
  });

  const actions = useMemo<LedgerActions>(() => {
    const clock = (): LedgerClock => ({
      now: Date.now(),
      nonce: Math.random().toString(36).slice(2, 6),
      origin: calendarRef.current.calendarOrigin,
      todayDayIndex: calendarRef.current.todayDayIndex,
    });

    const uploadGrace = (plan: GraceRolloverPlan) => {
      if (plan.items.length === 0) return;
      const userId = sessionIdRef.current;
      // One request per table for the whole rollover.
      void upsertHabitLogs(userId, plan.items.map((item) => item.completionEvent)).catch(() => {});
      void appendMomentumEventsRemote(userId, plan.items.map((item) => item.momentumEvent)).catch(() => {});
    };

    return {
      completeToday(habitId, isFallback = false) {
        if (!calendarRef.current.isViewingToday) return null;
        const c = clock();
        const plan = planCompletion(stateRef.current, habitId, isFallback, c);
        if (!plan) return null;
        commit({ type: 'COMPLETED', plan, origin: c.origin }, true);
        // Today's reminder is moot once completed; the coming days stay queued.
        const completed = stateRef.current.habits.find((h) => h.id === habitId);
        if (completed?.targetTime && !completed.archived) void scheduleHabitTargetTimeNotification(completed, true);
        if (plan.momentumEvent) holdGraceUpload(habitId, plan.momentumEvent);
        void upsertHabitLog(sessionIdRef.current, plan.completionEvent).catch(() => {});
        return { newlyCompleted: plan.newlyCompleted, isMicro: plan.isMicro, loggedDate: plan.loggedDate };
      },

      toggleFallbackMode(habitId) {
        if (!calendarRef.current.isViewingToday) return;
        const c = clock();
        const plan = planToggleFallback(stateRef.current, habitId, c);
        if (!plan) return;
        commit({ type: 'FALLBACK_TOGGLED', plan, origin: c.origin }, true);
        if (plan.activate && plan.removesLog) {
          void deleteHabitLog(sessionIdRef.current, habitId, plan.loggedDate, c.todayDayIndex).catch(() => {});
        }
      },

      resetToday(habitId) {
        if (!calendarRef.current.isViewingToday) return;
        const c = clock();
        // A vote still inside its undo window is dropped instead of reversed.
        const pending = pendingGraceRef.current.get(habitId);
        if (pending) {
          window.clearTimeout(pending.timer);
          pendingGraceRef.current.delete(habitId);
        }
        const before = stateRef.current;
        const plan = planResetToday(before, habitId, pending?.event.id ?? null, c);
        commit({ type: 'TODAY_RESET', plan, origin: c.origin }, true);
        if (plan.reversal) void appendMomentumEventRemote(sessionIdRef.current, plan.reversal).catch(() => {});
        void deleteHabitLog(sessionIdRef.current, habitId, plan.loggedDate, c.todayDayIndex).catch(() => {});
        // Unchecked: today's reminder applies again.
        const habit = before.habits.find((h) => h.id === habitId);
        if (habit?.targetTime && !habit.archived) void scheduleHabitTargetTimeNotification(habit);
      },

      rolloverAll() {
        const current = stateRef.current;
        if (current.rolledOverHabits.length === 0) return 0;
        const yesterdayIso = addDaysIso(getLocalDateString(), -1);
        const byId = new Map(current.habits.map((habit) => [habit.id, habit]));
        const c = clock();
        const plan = planGraceRollover(
          current.rolledOverHabits.flatMap((id) => byId.get(id) ?? []),
          yesterdayIso,
          c
        );
        commit(
          {
            type: 'GRACE_ROLLOVER',
            plan,
            origin: c.origin,
            resolvedPrompts: current.rolledOverHabits.map((habitId) => ({ habitId, loggedDate: yesterdayIso })),
            clearRolledOverIds: current.rolledOverHabits,
          },
          true
        );
        uploadGrace(plan);
        return plan.items.length;
      },

      frictionRolloverMicro() {
        const current = stateRef.current;
        const prompt = current.pendingFriction[0];
        if (!prompt) return 0;
        const habit = current.habits.find((h) => h.id === prompt.habitId);
        const c = clock();
        const plan = planGraceRollover(habit ? [habit] : [], prompt.loggedDate, c);
        markFrictionPrompted(prompt.habitId, prompt.loggedDate);
        commit(
          { type: 'GRACE_ROLLOVER', plan, origin: c.origin, resolvedPrompts: [prompt], clearRolledOverIds: [prompt.habitId] },
          true
        );
        uploadGrace(plan);
        return plan.items.length;
      },

      submitFriction(reason) {
        const prompt = stateRef.current.pendingFriction[0];
        if (!prompt) return;
        markFrictionPrompted(prompt.habitId, prompt.loggedDate);
        commit({
          type: 'FRICTION_RESOLVED',
          habitId: prompt.habitId,
          loggedDate: prompt.loggedDate,
          audit: createMissedFrictionAudit(prompt, reason, Date.now()),
        });
        void persistHabitLogFrictionReason(sessionIdRef.current, prompt.habitId, prompt.loggedDate, reason).catch(() => {});
      },

      skipFriction() {
        const prompt = stateRef.current.pendingFriction[0];
        if (!prompt) return;
        markFrictionPrompted(prompt.habitId, prompt.loggedDate);
        commit({ type: 'FRICTION_RESOLVED', habitId: prompt.habitId, loggedDate: prompt.loggedDate, audit: null });
      },

      addManualVote(habitName, identityStatement, category) {
        const plan = planManualVote(habitName, identityStatement, category, {
          now: Date.now(),
          dayNumber: calendarRef.current.currentDayIndex + 1,
          momentumEventId: newMomentumEventId(),
        });
        commit({ type: 'MANUAL_VOTE', evidence: plan.evidence, momentumEvent: plan.momentumEvent });
        void appendMomentumEventRemote(sessionIdRef.current, plan.momentumEvent).catch(() => {});
      },

      addHabit(data) {
        const now = Date.now();
        const habit = planNewHabit(stateRef.current.habits, data, { now, id: newHabitId() });
        if (!habit) return null;
        commit({ type: 'HABIT_ADDED', habit, now });
        if (habit.targetTime) void scheduleHabitTargetTimeNotification(habit);
        return habit;
      },

      archiveHabit(habitId) {
        commit({ type: 'HABIT_ARCHIVED', habitId, now: Date.now() });
        void cancelHabitTargetTimeNotification(habitId);
      },

      restoreHabit(habitId) {
        const before = stateRef.current;
        const next = commit({ type: 'HABIT_RESTORED', habitId, now: Date.now() });
        if (next === before) return;
        const restored = next.habits.find((h) => h.id === habitId);
        if (restored?.targetTime) void scheduleHabitTargetTimeNotification(restored);
      },

      deleteHabit(habitId) {
        void cancelHabitTargetTimeNotification(habitId);
        commit({ type: 'HABIT_DELETED', habitId });
        // Cascade delete via RPC.
        void deleteHabitRemote(habitId).catch(() => {});
      },

      updateHabit(habit) {
        const now = Date.now();
        commit({ type: 'HABIT_UPDATED', habit, now });
        if (habit.targetTime && !habit.archived) {
          const doneToday = hasLogOn(stateRef.current.completionEvents, habit.id, calendarRef.current.todayIso);
          void scheduleHabitTargetTimeNotification(habit, doneToday);
        } else {
          void cancelHabitTargetTimeNotification(habit.id);
        }
        return touchHabit(habit, now);
      },

      setKeystone(habitId, value) {
        commit({ type: 'KEYSTONE_SET', habitId, value, now: Date.now() });
      },

      clearWorkspace() {
        commit({ type: 'CLEAR_WORKSPACE' });
        removeStorage(HABITS_STORAGE_KEY);
        removeStorage(EVIDENCE_STORAGE_KEY);
        removeStorage(COMPLETION_EVENTS_STORAGE_KEY);
        removeStorage(ACTIVE_FALLBACKS_STORAGE_KEY);
        removeStorage(MOMENTUM_EVENTS_STORAGE_KEY);
        removeStorage('ascend_identity_vote_floor');
      },

      importBackup(backup) {
        commit({ type: 'BACKUP_IMPORTED', backup, origin: new Date() });
      },

      startAuth(clearAll) {
        commit({ type: 'AUTH_STARTED', clearAll });
      },

      applySync(result) {
        commit({ type: 'SYNC_APPLIED', result, deletedHabitIds: deletedHabitIdSet() });
      },

      loadCompletionEvents(events) {
        commit({ type: 'COMPLETION_EVENTS_LOADED', events });
      },

      mergeCycleLogs(logs) {
        commit({
          type: 'CYCLE_LOGS_MERGED',
          logs,
          origin: calendarRef.current.calendarOrigin,
          deletedHabitIds: deletedHabitIdSet(),
        });
      },

      mergeFrictionReasons(rows) {
        commit({ type: 'FRICTION_REASONS_MERGED', rows, deletedHabitIds: deletedHabitIdSet(), now: Date.now() });
      },

      pulseMomentum() {
        commit({ type: 'MOMENTUM_PULSED' });
      },

      getSnapshot: () => stateRef.current,

      subscribe(listener) {
        const listeners = listenersRef.current;
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
    };
  }, [commit, holdGraceUpload]);

  // Derived views of the ledger.
  const derivedHabits = useMemo(
    () => selectDerivedHabits(state, calendarOrigin),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only these slices feed it
    [state.habits, state.completionEvents, calendarOrigin]
  );
  const activeHabits = useMemo(() => selectActiveHabits(derivedHabits), [derivedHabits]);
  const todayMomentumEvents = useMemo(
    () => selectTodayMomentumEvents(state, calendarOrigin),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only these slices feed it
    [state.momentumEvents, state.completionEvents, state.habits, calendarOrigin]
  );
  const todayMomentumScore = useMemo(
    () => selectTodayMomentumScore(todayMomentumEvents, state.habits, protectionWindows),
    [todayMomentumEvents, state.habits, protectionWindows]
  );

  const identityVoteCount = useMemo(
    () => displayedIdentityVoteCount(state.momentumEvents, state.evidenceList),
    [state.momentumEvents, state.evidenceList]
  );

  const value = useMemo<LedgerContextState>(
    () => ({ ...state, derivedHabits, activeHabits, todayMomentumEvents, todayMomentumScore, identityVoteCount }),
    [state, derivedHabits, activeHabits, todayMomentumEvents, todayMomentumScore, identityVoteCount]
  );

  return (
    <LedgerActionsContext.Provider value={actions}>
      <LedgerStateContext.Provider value={value}>{children}</LedgerStateContext.Provider>
    </LedgerActionsContext.Provider>
  );
}

export function useLedger(): LedgerContextState {
  const value = useContext(LedgerStateContext);
  if (!value) throw new Error('useLedger must be used inside HabitLedgerProvider');
  return value;
}

export function useLedgerActions(): LedgerActions {
  const value = useContext(LedgerActionsContext);
  if (!value) throw new Error('useLedgerActions must be used inside HabitLedgerProvider');
  return value;
}
