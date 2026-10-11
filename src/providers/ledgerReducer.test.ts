import { describe, expect, it } from 'vitest';
import type { FrictionAudit, Habit, HabitCompletionEvent, MomentumEvent } from '../types';
import { EMPTY_LEDGER, ledgerReducer, type LedgerAction, type LedgerState } from './ledgerReducer';
import {
  planCompletion,
  planGraceRollover,
  planManualVote,
  planNewHabit,
  planResetToday,
  planToggleFallback,
  type LedgerClock,
} from './ledgerPlans';
import { stableHabitLogId, stableMomentumEventId } from '../utils/stableId';
import { MAX_ACTIVE_HABITS } from '../lib/protection';

const ORIGIN = new Date(2026, 9, 11); // Sunday 2026-10-11, local midnight
const TODAY = '2026-10-11';
const NOW = ORIGIN.getTime() + 9 * 3_600_000;
const clock: LedgerClock = { now: NOW, nonce: 'abcd', origin: ORIGIN, todayDayIndex: 3 };

const habit = (id: string, fields: Partial<Habit> = {}): Habit =>
  ({
    id,
    name: `Habit ${id}`,
    category: 'work',
    timestamp: '08:00 AM',
    days: [],
    targetDaysPerWeek: 7,
    updatedAt: 1,
    ...fields,
  }) as Habit;

const ledger = (overrides: Partial<LedgerState> = {}): LedgerState => ({
  ...EMPTY_LEDGER,
  habits: [habit('a'), habit('b')],
  ...overrides,
});

const completion = (habitId: string, date: string, type: HabitCompletionEvent['type'] = 'full'): HabitCompletionEvent => ({
  id: stableHabitLogId(habitId, date),
  habitId,
  dayIndex: 3,
  date,
  type,
  timestamp: NOW,
});

const run = (state: LedgerState, ...actions: LedgerAction[]) => actions.reduce(ledgerReducer, state);

describe('planCompletion + COMPLETED', () => {
  it('logs a full completion with one momentum vote, evidence and no audit', () => {
    const state = ledger();
    const plan = planCompletion(state, 'a', false, clock)!;
    expect(plan).toMatchObject({ habitId: 'a', loggedDate: TODAY, isMicro: false, newlyCompleted: true, audit: null });
    expect(plan.completionEvent).toMatchObject({ id: stableHabitLogId('a', TODAY), type: 'full', dayIndex: 3, timestamp: NOW });
    expect(plan.momentumEvent).toMatchObject({ id: stableMomentumEventId('a', TODAY, 'full'), eventType: 'full', weight: 1.5 });

    const next = ledgerReducer(state, { type: 'COMPLETED', plan, origin: ORIGIN });
    expect(next.completionEvents).toHaveLength(1);
    expect(next.momentumEvents).toHaveLength(1);
    expect(next.evidenceList).toHaveLength(1);
    expect(next.momentumPulse).toBe(1);
  });

  it('fallback mode turns the completion into a half-weight micro vote with an audit, and leaves fallback mode', () => {
    const state = ledger({ activeFallbackIds: ['a'] });
    const plan = planCompletion(state, 'a', false, clock)!;
    expect(plan.isMicro).toBe(true);
    expect(plan.completionEvent.type).toBe('fallback_micro');
    expect(plan.momentumEvent).toMatchObject({ eventType: 'fallback', weight: 0.75 });
    expect(plan.audit).toMatchObject({ type: 'fallback_used', timestamp: NOW });
    const next = ledgerReducer(state, { type: 'COMPLETED', plan, origin: ORIGIN });
    expect(next.activeFallbackIds).toEqual([]);
    expect(next.frictionAudits).toHaveLength(1);
  });

  it('re-completing the same day replaces the row and adds no second vote', () => {
    const first = run(ledger(), { type: 'COMPLETED', plan: planCompletion(ledger(), 'a', false, clock)!, origin: ORIGIN });
    const plan = planCompletion(first, 'a', true, { ...clock, now: NOW + 1000 })!;
    expect(plan.newlyCompleted).toBe(false);
    expect(plan.momentumEvent).toBeNull();
    expect(plan.audit).toBeNull();
    const next = ledgerReducer(first, { type: 'COMPLETED', plan, origin: ORIGIN });
    expect(next.completionEvents).toHaveLength(1);
    expect(next.completionEvents[0].type).toBe('fallback_micro');
    expect(next.evidenceList).toHaveLength(1);
    expect(next.momentumPulse).toBe(first.momentumPulse);
  });

  it('refuses unknown habits and off days', () => {
    // Sunday is Monday-first index 6.
    const state = ledger({ habits: [habit('weekdays', { scheduledDays: [0, 1, 2, 3, 4] })] });
    expect(planCompletion(state, 'weekdays', false, clock)).toBeNull();
    expect(planCompletion(state, 'missing', false, clock)).toBeNull();
  });

  it('is deterministic for the same state and clock', () => {
    expect(planCompletion(ledger(), 'a', false, clock)).toEqual(planCompletion(ledger(), 'a', false, clock));
  });
});

describe('planResetToday + TODAY_RESET', () => {
  const completed = () => {
    const plan = planCompletion(ledger(), 'a', false, clock)!;
    return { plan, state: ledgerReducer(ledger(), { type: 'COMPLETED', plan, origin: ORIGIN }) };
  };

  it('inside the undo window: drops the pending vote instead of reversing it', () => {
    const { plan: done, state } = completed();
    const plan = planResetToday(state, 'a', done.momentumEvent!.id, clock);
    expect(plan.reversal).toBeNull();
    const next = ledgerReducer(state, { type: 'TODAY_RESET', plan, origin: ORIGIN });
    expect(next.completionEvents).toEqual([]);
    expect(next.evidenceList).toEqual([]);
    expect(next.momentumEvents).toEqual([]);
    expect(next.momentumPulse).toBe(state.momentumPulse + 1);
  });

  it('after the undo window: appends a reversal of the same weight', () => {
    const { state } = completed();
    const plan = planResetToday(state, 'a', null, clock);
    expect(plan.reversal).toMatchObject({ eventType: 'reversal', weight: 1.5, habitId: 'a' });
    const next = ledgerReducer(state, { type: 'TODAY_RESET', plan, origin: ORIGIN });
    expect(next.momentumEvents.map((e) => e.eventType)).toEqual(['full', 'reversal']);
  });
});

describe('planToggleFallback + FALLBACK_TOGGLED', () => {
  it('entering fallback mode removes today’s log', () => {
    const state = ledger({ completionEvents: [completion('a', TODAY), completion('a', '2026-10-10')] });
    const plan = planToggleFallback(state, 'a', clock)!;
    expect(plan).toEqual({ habitId: 'a', activate: true, loggedDate: TODAY, removesLog: true });
    const next = ledgerReducer(state, { type: 'FALLBACK_TOGGLED', plan, origin: ORIGIN });
    expect(next.activeFallbackIds).toEqual(['a']);
    expect(next.completionEvents.map((e) => e.date)).toEqual(['2026-10-10']);
  });

  it('leaving fallback mode only clears the flag, even on an off day', () => {
    const state = ledger({ habits: [habit('a', { scheduledDays: [0] })], activeFallbackIds: ['a'] });
    const plan = planToggleFallback(state, 'a', clock)!;
    expect(plan).toEqual({ habitId: 'a', activate: false });
    expect(ledgerReducer(state, { type: 'FALLBACK_TOGGLED', plan, origin: ORIGIN }).activeFallbackIds).toEqual([]);
  });

  it('cannot enter fallback mode on an off day', () => {
    expect(planToggleFallback(ledger({ habits: [habit('a', { scheduledDays: [0] })] }), 'a', clock)).toBeNull();
  });
});

describe('GRACE_ROLLOVER', () => {
  it('logs every target as a micro-habit on the given day in one transition and clears banner and prompts', () => {
    const state = ledger({
      rolledOverHabits: ['a', 'b'],
      pendingFriction: [
        { habitId: 'a', habitName: 'Habit a', loggedDate: '2026-10-10' },
        { habitId: 'b', habitName: 'Habit b', loggedDate: '2026-10-10' },
        { habitId: 'a', habitName: 'Habit a', loggedDate: '2026-10-09' },
      ],
    });
    const plan = planGraceRollover(state.habits, '2026-10-10', clock);
    expect(plan.items.map((item) => item.completionEvent.type)).toEqual(['fallback_micro', 'fallback_micro']);
    expect(new Set(plan.items.map((item) => item.evidence.id)).size).toBe(2);
    const next = ledgerReducer(state, {
      type: 'GRACE_ROLLOVER',
      plan,
      origin: ORIGIN,
      resolvedPrompts: [
        { habitId: 'a', loggedDate: '2026-10-10' },
        { habitId: 'b', loggedDate: '2026-10-10' },
      ],
      clearRolledOverIds: ['a', 'b'],
    });
    expect(next.completionEvents).toHaveLength(2);
    expect(next.momentumEvents.map((e) => [e.habitId, e.eventType, e.weight])).toEqual([
      ['a', 'fallback', 0.75],
      ['b', 'fallback', 0.75],
    ]);
    expect(next.rolledOverHabits).toEqual([]);
    expect(next.pendingFriction).toEqual([{ habitId: 'a', habitName: 'Habit a', loggedDate: '2026-10-09' }]);
    expect(next.momentumPulse).toBe(1);
  });

  it('with no targets still resolves the prompt, without a pulse', () => {
    const state = ledger({ pendingFriction: [{ habitId: 'gone', habitName: 'Gone', loggedDate: '2026-10-10' }] });
    const next = ledgerReducer(state, {
      type: 'GRACE_ROLLOVER',
      plan: planGraceRollover([], '2026-10-10', clock),
      origin: ORIGIN,
      resolvedPrompts: [{ habitId: 'gone', loggedDate: '2026-10-10' }],
      clearRolledOverIds: ['gone'],
    });
    expect(next.pendingFriction).toEqual([]);
    expect(next.momentumPulse).toBe(0);
  });
});

describe('DAY_ROLLOVER', () => {
  const missed = { id: 'm1', habitId: 'a', eventType: 'missed', weight: 1.5, timestamp: 1, loggedDate: '2026-10-10' } as MomentumEvent;

  it('applies every part of the rollover decision and requests a re-fetch', () => {
    const next = ledgerReducer(ledger({ activeFallbackIds: ['a'] }), {
      type: 'DAY_ROLLOVER',
      dayChanged: true,
      clearActiveFallbacks: true,
      graceHabitIds: ['b'],
      missedEvents: [missed],
      frictionPrompts: [{ habitId: 'a', habitName: 'Habit a', loggedDate: '2026-10-10' }],
    });
    expect(next).toMatchObject({ activeFallbackIds: [], rolledOverHabits: ['b'], momentumEvents: [missed], refetchRequest: 1 });
    expect(next.pendingFriction).toHaveLength(1);
  });

  it('does not queue a prompt twice', () => {
    const prompt = { habitId: 'a', habitName: 'Habit a', loggedDate: '2026-10-10' };
    const action: LedgerAction = {
      type: 'DAY_ROLLOVER',
      dayChanged: false,
      clearActiveFallbacks: false,
      graceHabitIds: null,
      missedEvents: [],
      frictionPrompts: [prompt],
    };
    expect(run(ledger(), action, action).pendingFriction).toEqual([prompt]);
  });
});

describe('habit edits', () => {
  it('adding a keystone demotes the current one', () => {
    const state = ledger({ habits: [habit('a', { isKeystone: true })] });
    const added = planNewHabit(state.habits, { ...habit('x'), isKeystone: true }, { now: NOW, id: 'new' })!;
    const next = ledgerReducer(state, { type: 'HABIT_ADDED', habit: added, now: NOW });
    expect(next.habits.map((h) => [h.id, Boolean(h.isKeystone), h.updatedAt])).toEqual([
      ['new', true, NOW],
      ['a', false, NOW],
    ]);
  });

  it('respects the active habit cap when adding and restoring', () => {
    const full = Array.from({ length: MAX_ACTIVE_HABITS }, (_, i) => habit(`h${i}`));
    expect(planNewHabit(full, habit('x'), { now: NOW, id: 'x' })).toBeNull();
    const state = ledger({ habits: [...full, habit('old', { archived: true })] });
    expect(ledgerReducer(state, { type: 'HABIT_RESTORED', habitId: 'old', now: NOW })).toBe(state);
  });

  it('archive, update, keystone and delete touch only what they should', () => {
    const state = ledger({ habits: [habit('a', { isKeystone: true }), habit('b')], activeFallbackIds: ['b'] });
    const next = run(
      state,
      { type: 'HABIT_ARCHIVED', habitId: 'a', now: 10 },
      { type: 'KEYSTONE_SET', habitId: 'b', value: true, now: 20 },
      { type: 'HABIT_UPDATED', habit: { ...habit('a'), name: 'Renamed', isKeystone: false }, now: 30 },
      { type: 'HABIT_DELETED', habitId: 'b' }
    );
    expect(next.habits).toEqual([{ ...habit('a'), name: 'Renamed', isKeystone: false, updatedAt: 30 }]);
    expect(next.activeFallbackIds).toEqual([]);
  });
});

describe('sync and imports', () => {
  it('SYNC_APPLIED merges habits by revision, skipping deleted ones, and replaces the completion log', () => {
    const state = ledger({ habits: [habit('a', { updatedAt: 5, name: 'local' }), habit('gone')] });
    const next = ledgerReducer(state, {
      type: 'SYNC_APPLIED',
      result: {
        habits: [habit('a', { updatedAt: 3, name: 'remote' }), habit('r')],
        completionEvents: [completion('r', TODAY)],
        momentumEvents: [],
      },
      deletedHabitIds: new Set(['gone']),
    });
    expect(next.habits.map((h) => [h.id, h.name])).toEqual([
      ['a', 'local'],
      ['r', 'Habit r'],
    ]);
    expect(next.completionEvents).toEqual([completion('r', TODAY)]);
  });

  it('CYCLE_LOGS_MERGED ignores demo and deleted habits', () => {
    const state = ledger({ completionEvents: [completion('a', TODAY)] });
    const next = ledgerReducer(state, {
      type: 'CYCLE_LOGS_MERGED',
      logs: [completion('habit-1', TODAY), completion('gone', TODAY)],
      origin: ORIGIN,
      deletedHabitIds: new Set(['gone']),
    });
    expect(next).toBe(state);
  });

  it('BACKUP_IMPORTED rebuilds momentum from the completion log when the backup has none', () => {
    const next = ledgerReducer(ledger(), {
      type: 'BACKUP_IMPORTED',
      backup: { habits: [habit('a'), habit('habit-1')], completionEvents: [completion('a', TODAY)] },
      origin: ORIGIN,
    });
    expect(next.habits.map((h) => h.id)).toEqual(['a']);
    expect(next.momentumEvents.map((e) => [e.habitId, e.eventType])).toEqual([['a', 'full']]);
  });

  it('FRICTION_RESOLVED drops the prompt and records the audit', () => {
    const audit = { id: 'fa', type: 'missed', habitName: 'x', date: '', dayNumber: 1, timestamp: 1 } as FrictionAudit;
    const state = ledger({ pendingFriction: [{ habitId: 'a', habitName: 'Habit a', loggedDate: '2026-10-10' }] });
    const next = ledgerReducer(state, { type: 'FRICTION_RESOLVED', habitId: 'a', loggedDate: '2026-10-10', audit });
    expect(next.pendingFriction).toEqual([]);
    expect(next.frictionAudits).toEqual([audit]);
  });

  it('manual votes never collapse into one row', () => {
    const one = planManualVote('Read', 'I read', 'work', { now: NOW, dayNumber: 4, momentumEventId: 'id-1' });
    const two = planManualVote('Read', 'I read', 'work', { now: NOW, dayNumber: 4, momentumEventId: 'id-2' });
    const next = run(
      ledger(),
      { type: 'MANUAL_VOTE', ...one },
      { type: 'MANUAL_VOTE', ...two }
    );
    expect(next.momentumEvents).toHaveLength(2);
    expect(next.evidenceList[0].loggedDate).toBe(TODAY);
  });
});

describe('sign-in and reset', () => {
  const populated = ledger({
    habits: [habit('a'), habit('habit-1')],
    completionEvents: [completion('a', TODAY), completion('habit-1', TODAY)],
    pendingFriction: [{ habitId: 'a', habitName: 'Habit a', loggedDate: '2026-10-10' }],
    momentumPulse: 4,
    refetchRequest: 2,
  });

  it('AUTH_STARTED keeps a returning user’s data minus demo habits, or clears it for a new account', () => {
    const returning = ledgerReducer(populated, { type: 'AUTH_STARTED', clearAll: false });
    expect(returning.habits.map((h) => h.id)).toEqual(['a']);
    expect(returning.completionEvents.map((e) => e.habitId)).toEqual(['a']);
    const fresh = ledgerReducer(populated, { type: 'AUTH_STARTED', clearAll: true });
    expect(fresh.habits).toEqual([]);
    expect(fresh.completionEvents).toEqual([]);
  });

  it('RESET_ALL clears every ledger slice but keeps the counters growing', () => {
    expect(ledgerReducer(populated, { type: 'RESET_ALL' })).toEqual({ ...EMPTY_LEDGER, momentumPulse: 4, refetchRequest: 2 });
  });

  it('CLEAR_WORKSPACE keeps friction history and prompts', () => {
    const next = ledgerReducer(populated, { type: 'CLEAR_WORKSPACE' });
    expect(next.habits).toEqual([]);
    expect(next.pendingFriction).toHaveLength(1);
  });

  it('never mutates the previous state', () => {
    const snapshot = JSON.stringify(populated);
    run(
      populated,
      { type: 'AUTH_STARTED', clearAll: false },
      { type: 'HABIT_ARCHIVED', habitId: 'a', now: 1 },
      { type: 'RESET_ALL' }
    );
    expect(JSON.stringify(populated)).toBe(snapshot);
  });
});
