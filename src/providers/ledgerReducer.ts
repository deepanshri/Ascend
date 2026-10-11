/**
 * The habit ledger as one pure reducer: habits, the completion log, the
 * momentum log, identity evidence, friction audits and prompts, fallback mode
 * and grace rollover. Every input that would otherwise come from the clock,
 * randomness or storage (now, ids, the device's deleted-habit set, answered
 * friction prompts) arrives in the action, so a transition depends only on
 * (state, action).
 */
import type { FrictionAudit, Habit, HabitCompletionEvent, IdentityEvidence, MomentumEvent } from '../types';
import { isSeedHabitId } from '../data/initialHabits';
import { mergeCompletionEvents, mergeMomentumEvents, momentumEventsFromCompletionLog } from '../utils/momentumCore';
import { resolveEventIsoDate } from '../utils/dates';
import { removeTodayEvidence, replaceTodayCompletion, upsertTodayEvidence } from '../services/ledgerService';
import { isAtActiveHabitCap } from '../lib/protection';
import { mergeHabitRevisions, omitDeletedRefs, touchHabit } from '../lib/habitMerge';
import {
  appendFrictionPrompts,
  frictionPromptKey,
  mergeFrictionAuditsFromLogs,
  type PendingFrictionPrompt,
} from '../lib/frictionAuditCore';
import type { CompletionPlan, FallbackTogglePlan, GraceRolloverPlan, ResetTodayPlan } from './ledgerPlans';

export interface LedgerState {
  habits: Habit[];
  /** Append-only completion log: ground truth for habit history and the bowl. */
  completionEvents: HabitCompletionEvent[];
  /** Append-only momentum log (full / fallback / missed / reversal). */
  momentumEvents: MomentumEvent[];
  evidenceList: IdentityEvidence[];
  frictionAudits: FrictionAudit[];
  /** Missed days waiting for a friction reason, oldest first. */
  pendingFriction: PendingFrictionPrompt[];
  /** Habits switched to their fallback micro-habit today. */
  activeFallbackIds: string[];
  /** Yesterday's missed habits offered a grace rollover today. */
  rolledOverHabits: string[];
  /** Bumped whenever momentum visibly changes (drives the score pulse). */
  momentumPulse: number;
  /** Bumped when a new day starts: account sync re-fetches the ledger. */
  refetchRequest: number;
}

export const EMPTY_LEDGER: LedgerState = {
  habits: [],
  completionEvents: [],
  momentumEvents: [],
  evidenceList: [],
  frictionAudits: [],
  pendingFriction: [],
  activeFallbackIds: [],
  rolledOverHabits: [],
  momentumPulse: 0,
  refetchRequest: 0,
};

export interface AccountSyncResult {
  habits: Habit[];
  completionEvents: HabitCompletionEvent[];
  momentumEvents: MomentumEvent[];
}

export interface BackupContents {
  habits: Habit[];
  evidence?: IdentityEvidence[];
  completionEvents?: HabitCompletionEvent[];
  momentumEvents?: MomentumEvent[];
}

export type LedgerAction =
  /** Sign-out, account deletion or a user switch. */
  | { type: 'RESET_ALL' }
  /** Settings → reset data: empty workspace; friction history and prompts stay. */
  | { type: 'CLEAR_WORKSPACE' }
  | {
      type: 'DAY_ROLLOVER';
      dayChanged: boolean;
      clearActiveFallbacks: boolean;
      graceHabitIds: string[] | null;
      missedEvents: MomentumEvent[];
      /** Already filtered to prompts not answered on this device. */
      frictionPrompts: PendingFrictionPrompt[];
    }
  | { type: 'SYNC_APPLIED'; result: AccountSyncResult; deletedHabitIds: ReadonlySet<string> }
  | { type: 'COMPLETION_EVENTS_LOADED'; events: HabitCompletionEvent[] }
  | { type: 'CYCLE_LOGS_MERGED'; logs: HabitCompletionEvent[]; origin: Date; deletedHabitIds: ReadonlySet<string> }
  | {
      type: 'FRICTION_REASONS_MERGED';
      rows: Array<{ habitId: string; loggedDate: string; reason: string }>;
      deletedHabitIds: ReadonlySet<string>;
      now: number;
    }
  | { type: 'COMPLETED'; plan: CompletionPlan; origin: Date }
  | {
      type: 'GRACE_ROLLOVER';
      plan: GraceRolloverPlan;
      origin: Date;
      /** Friction prompts this rollover answers. */
      resolvedPrompts: Array<{ habitId: string; loggedDate: string }>;
      /** Habits leaving today's rollover banner. */
      clearRolledOverIds: string[];
    }
  | { type: 'FALLBACK_TOGGLED'; plan: FallbackTogglePlan; origin: Date }
  | { type: 'TODAY_RESET'; plan: ResetTodayPlan; origin: Date }
  | { type: 'MANUAL_VOTE'; evidence: IdentityEvidence; momentumEvent: MomentumEvent }
  /** A friction prompt answered (with an audit) or skipped (audit null). */
  | { type: 'FRICTION_RESOLVED'; habitId: string; loggedDate: string; audit: FrictionAudit | null }
  | { type: 'HABIT_ADDED'; habit: Habit; now: number }
  | { type: 'HABIT_ARCHIVED'; habitId: string; now: number }
  | { type: 'HABIT_RESTORED'; habitId: string; now: number }
  | { type: 'HABIT_DELETED'; habitId: string }
  | { type: 'HABIT_UPDATED'; habit: Habit; now: number }
  | { type: 'KEYSTONE_SET'; habitId: string; value: boolean; now: number }
  | { type: 'BACKUP_IMPORTED'; backup: BackupContents; origin: Date }
  /** Sign-in: a new account starts empty, a returning one keeps local data minus demo habits. */
  | { type: 'AUTH_STARTED'; clearAll: boolean }
  | { type: 'MOMENTUM_PULSED' };

const withoutSeeds = <T extends { habitId: string }>(rows: T[]): T[] => rows.filter((row) => !isSeedHabitId(row.habitId));
const without = (ids: string[], id: string): string[] => (ids.includes(id) ? ids.filter((x) => x !== id) : ids);

function dropHabitDay(events: HabitCompletionEvent[], habitId: string, isoDate: string, origin: Date) {
  return events.filter((event) => !(event.habitId === habitId && resolveEventIsoDate(event, origin) === isoDate));
}

/** Only one keystone at a time: setting one demotes the others. */
function demoteOtherKeystones(habits: Habit[], keepId: string, now: number): Habit[] {
  return habits.map((habit) =>
    habit.id !== keepId && habit.isKeystone ? touchHabit({ ...habit, isKeystone: false }, now) : habit
  );
}

export function ledgerReducer(state: LedgerState, action: LedgerAction): LedgerState {
  switch (action.type) {
    case 'RESET_ALL':
      // The counters only ever grow, so watchers never mistake a reset for a new request.
      return { ...EMPTY_LEDGER, momentumPulse: state.momentumPulse, refetchRequest: state.refetchRequest };

    case 'CLEAR_WORKSPACE':
      return { ...state, habits: [], evidenceList: [], completionEvents: [], momentumEvents: [], activeFallbackIds: [] };

    case 'DAY_ROLLOVER': {
      const next = { ...state };
      if (action.clearActiveFallbacks) next.activeFallbackIds = [];
      if (action.graceHabitIds) next.rolledOverHabits = action.graceHabitIds;
      if (action.missedEvents.length > 0) next.momentumEvents = mergeMomentumEvents(state.momentumEvents, action.missedEvents);
      if (action.frictionPrompts.length > 0) {
        next.pendingFriction = appendFrictionPrompts(state.pendingFriction, action.frictionPrompts);
      }
      if (action.dayChanged) next.refetchRequest = state.refetchRequest + 1;
      return next;
    }

    case 'SYNC_APPLIED':
      return {
        ...state,
        habits: mergeHabitRevisions(state.habits, action.result.habits, action.deletedHabitIds),
        completionEvents: action.result.completionEvents,
        momentumEvents: mergeMomentumEvents(state.momentumEvents, action.result.momentumEvents),
      };

    case 'COMPLETION_EVENTS_LOADED':
      return { ...state, completionEvents: action.events };

    case 'CYCLE_LOGS_MERGED': {
      const logs = omitDeletedRefs(withoutSeeds(action.logs), action.deletedHabitIds);
      if (logs.length === 0) return state;
      return {
        ...state,
        completionEvents: omitDeletedRefs(
          mergeCompletionEvents(withoutSeeds(state.completionEvents), logs, action.origin),
          action.deletedHabitIds
        ),
      };
    }

    case 'FRICTION_REASONS_MERGED':
      if (action.rows.length === 0) return state;
      return {
        ...state,
        frictionAudits: omitDeletedRefs(
          mergeFrictionAuditsFromLogs(state.frictionAudits, action.rows, state.habits, action.now),
          action.deletedHabitIds
        ),
      };

    case 'COMPLETED': {
      const { plan, origin } = action;
      return {
        ...state,
        activeFallbackIds: without(state.activeFallbackIds, plan.habitId),
        completionEvents: replaceTodayCompletion(state.completionEvents, plan.completionEvent, origin),
        momentumEvents: plan.momentumEvent
          ? mergeMomentumEvents(state.momentumEvents, [plan.momentumEvent])
          : state.momentumEvents,
        momentumPulse: plan.momentumEvent ? state.momentumPulse + 1 : state.momentumPulse,
        evidenceList: upsertTodayEvidence(state.evidenceList, plan.evidence, plan.loggedDate, origin),
        frictionAudits: plan.audit ? [plan.audit, ...state.frictionAudits] : state.frictionAudits,
      };
    }

    case 'GRACE_ROLLOVER': {
      const { plan, origin } = action;
      const resolved = new Set(action.resolvedPrompts.map((p) => frictionPromptKey(p.habitId, p.loggedDate)));
      const clear = new Set(action.clearRolledOverIds);
      const next: LedgerState = {
        ...state,
        pendingFriction: resolved.size
          ? state.pendingFriction.filter((p) => !resolved.has(frictionPromptKey(p.habitId, p.loggedDate)))
          : state.pendingFriction,
        rolledOverHabits: clear.size ? state.rolledOverHabits.filter((id) => !clear.has(id)) : state.rolledOverHabits,
      };
      if (plan.items.length === 0) return next;
      return {
        ...next,
        completionEvents: plan.items.reduce(
          (acc, item) => replaceTodayCompletion(acc, item.completionEvent, origin),
          state.completionEvents
        ),
        momentumEvents: mergeMomentumEvents(state.momentumEvents, plan.items.map((item) => item.momentumEvent)),
        evidenceList: plan.items.reduce(
          (acc, item) => upsertTodayEvidence(acc, item.evidence, plan.dateIso, origin),
          state.evidenceList
        ),
        momentumPulse: state.momentumPulse + 1,
      };
    }

    case 'FALLBACK_TOGGLED': {
      const { plan, origin } = action;
      if (!plan.activate) return { ...state, activeFallbackIds: without(state.activeFallbackIds, plan.habitId) };
      return {
        ...state,
        completionEvents: plan.removesLog
          ? dropHabitDay(state.completionEvents, plan.habitId, plan.loggedDate, origin)
          : state.completionEvents,
        activeFallbackIds: state.activeFallbackIds.includes(plan.habitId)
          ? state.activeFallbackIds
          : [...state.activeFallbackIds, plan.habitId],
      };
    }

    case 'TODAY_RESET': {
      const { plan, origin } = action;
      let momentumEvents = state.momentumEvents;
      if (plan.cancelledMomentumId) {
        momentumEvents = momentumEvents.filter((event) => event.id !== plan.cancelledMomentumId);
      } else if (plan.reversal) {
        momentumEvents = mergeMomentumEvents(momentumEvents, [plan.reversal]);
      }
      return {
        ...state,
        completionEvents: dropHabitDay(state.completionEvents, plan.habitId, plan.loggedDate, origin),
        activeFallbackIds: without(state.activeFallbackIds, plan.habitId),
        evidenceList: removeTodayEvidence(state.evidenceList, plan.habitId, plan.loggedDate, origin),
        momentumEvents,
        momentumPulse:
          plan.cancelledMomentumId || plan.reversal ? state.momentumPulse + 1 : state.momentumPulse,
      };
    }

    case 'MANUAL_VOTE':
      return {
        ...state,
        evidenceList: [action.evidence, ...state.evidenceList],
        momentumEvents: mergeMomentumEvents(state.momentumEvents, [action.momentumEvent]),
      };

    case 'FRICTION_RESOLVED': {
      const key = frictionPromptKey(action.habitId, action.loggedDate);
      return {
        ...state,
        pendingFriction: state.pendingFriction.filter((p) => frictionPromptKey(p.habitId, p.loggedDate) !== key),
        frictionAudits: action.audit ? [action.audit, ...state.frictionAudits] : state.frictionAudits,
      };
    }

    case 'HABIT_ADDED': {
      const others = action.habit.isKeystone
        ? demoteOtherKeystones(state.habits, action.habit.id, action.now)
        : state.habits;
      return { ...state, habits: [action.habit, ...others] };
    }

    case 'HABIT_ARCHIVED':
      return {
        ...state,
        habits: state.habits.map((h) => (h.id === action.habitId ? touchHabit({ ...h, archived: true }, action.now) : h)),
      };

    case 'HABIT_RESTORED': {
      const target = state.habits.find((h) => h.id === action.habitId);
      if (!target || (target.archived && isAtActiveHabitCap(state.habits))) return state;
      return {
        ...state,
        habits: state.habits.map((h) => (h.id === action.habitId ? touchHabit({ ...h, archived: false }, action.now) : h)),
      };
    }

    case 'HABIT_DELETED':
      return {
        ...state,
        habits: state.habits.filter((h) => h.id !== action.habitId),
        activeFallbackIds: without(state.activeFallbackIds, action.habitId),
      };

    case 'HABIT_UPDATED': {
      const { habit, now } = action;
      const others = habit.isKeystone ? demoteOtherKeystones(state.habits, habit.id, now) : state.habits;
      return { ...state, habits: others.map((h) => (h.id === habit.id ? touchHabit(habit, now) : h)) };
    }

    case 'KEYSTONE_SET': {
      const { habitId, value, now } = action;
      const others = value ? demoteOtherKeystones(state.habits, habitId, now) : state.habits;
      return {
        ...state,
        habits: others.map((h) => (h.id === habitId ? touchHabit({ ...h, isKeystone: value }, now) : h)),
      };
    }

    case 'BACKUP_IMPORTED': {
      const { backup } = action;
      const habits = backup.habits.filter((habit) => !isSeedHabitId(habit.id));
      const next: LedgerState = { ...state, habits };
      if (backup.evidence) next.evidenceList = withoutSeeds(backup.evidence);
      if (backup.completionEvents) next.completionEvents = withoutSeeds(backup.completionEvents);
      // Imported momentum wins; without it, momentum is rebuilt from the imported completion log.
      const incoming = backup.momentumEvents
        ? withoutSeeds(backup.momentumEvents)
        : backup.completionEvents
          ? momentumEventsFromCompletionLog(withoutSeeds(backup.completionEvents), habits, action.origin)
          : null;
      if (incoming) next.momentumEvents = mergeMomentumEvents(withoutSeeds(state.momentumEvents), incoming);
      return next;
    }

    case 'AUTH_STARTED':
      if (action.clearAll) {
        return { ...state, habits: [], completionEvents: [], momentumEvents: [], evidenceList: [] };
      }
      return {
        ...state,
        habits: state.habits.filter((habit) => !isSeedHabitId(habit.id)),
        completionEvents: withoutSeeds(state.completionEvents),
        momentumEvents: withoutSeeds(state.momentumEvents),
        evidenceList: withoutSeeds(state.evidenceList),
      };

    case 'MOMENTUM_PULSED':
      return { ...state, momentumPulse: state.momentumPulse + 1 };

    default:
      return state;
  }
}
