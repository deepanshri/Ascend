import { describe, expect, it } from 'vitest';
import type { Habit } from '../types';
import { findModal, initialUIState, resolveActiveTab, resolveBackAction, uiReducer, type UIState } from './uiReducer';

const habit = (id: string) => ({ id, name: id }) as Habit;
const reduce = (state: UIState, ...actions: Parameters<typeof uiReducer>[1][]) => actions.reduce(uiReducer, state);

describe('tabs', () => {
  it('switches tab and remembers visited tabs once', () => {
    const state = reduce(initialUIState, { type: 'SET_TAB', tab: 'report' }, { type: 'SET_TAB', tab: 'home' }, { type: 'SET_TAB', tab: 'report' });
    expect(state.activeTab).toBe('report');
    expect(state.visitedTabs).toEqual(['home', 'report']);
  });

  it('falls back to home for an unknown tab', () => {
    expect(resolveActiveTab('nonsense')).toBe('home');
    expect(reduce({ ...initialUIState, activeTab: 'report' }, { type: 'SET_TAB', tab: 'nonsense' }).activeTab).toBe('home');
  });

  it('returns the same state when the tab does not change', () => {
    expect(uiReducer(initialUIState, { type: 'SET_TAB', tab: 'home' })).toBe(initialUIState);
  });
});

describe('modal stack', () => {
  it('pushes modals in opening order', () => {
    const state = reduce(initialUIState, { type: 'OPEN_MODAL', modal: { kind: 'addHabit' } }, { type: 'OPEN_MODAL', modal: { kind: 'examShield' } });
    expect(state.modalStack.map((m) => m.kind)).toEqual(['addHabit', 'examShield']);
  });

  it('replaces an open modal of the same kind in place', () => {
    const state = reduce(
      initialUIState,
      { type: 'OPEN_MODAL', modal: { kind: 'habitDetail', habit: habit('a') } },
      { type: 'OPEN_MODAL', modal: { kind: 'chronicle' } },
      { type: 'OPEN_MODAL', modal: { kind: 'habitDetail', habit: habit('b') } }
    );
    expect(state.modalStack.map((m) => m.kind)).toEqual(['habitDetail', 'chronicle']);
    expect(findModal(state.modalStack, 'habitDetail')?.habit.id).toBe('b');
  });

  it('UPDATE_MODAL only refreshes a modal that is open', () => {
    const closed = uiReducer(initialUIState, { type: 'UPDATE_MODAL', modal: { kind: 'habitDetail', habit: habit('a') } });
    expect(closed).toBe(initialUIState);
    const open = reduce(
      initialUIState,
      { type: 'OPEN_MODAL', modal: { kind: 'habitDetail', habit: habit('a') } },
      { type: 'UPDATE_MODAL', modal: { kind: 'habitDetail', habit: { ...habit('a'), name: 'renamed' } } }
    );
    expect(findModal(open.modalStack, 'habitDetail')?.habit.name).toBe('renamed');
  });

  it('closes by kind, or only when it shows the given habit', () => {
    const state = reduce(initialUIState, { type: 'OPEN_MODAL', modal: { kind: 'habitDetail', habit: habit('a') } });
    expect(uiReducer(state, { type: 'CLOSE_MODAL', kind: 'habitDetail', habitId: 'other' })).toBe(state);
    expect(uiReducer(state, { type: 'CLOSE_MODAL', kind: 'habitDetail', habitId: 'a' }).modalStack).toEqual([]);
    expect(uiReducer(state, { type: 'CLOSE_MODAL', kind: 'habitDetail' }).modalStack).toEqual([]);
  });

  it('closes the long-press overlay by habit id', () => {
    const state = reduce(initialUIState, { type: 'OPEN_MODAL', modal: { kind: 'habitLongPress', habitId: 'a', rect: null } });
    expect(uiReducer(state, { type: 'CLOSE_MODAL', kind: 'habitLongPress', habitId: 'a' }).modalStack).toEqual([]);
  });

  it('CLOSE_TOP_MODAL pops only the most recent modal', () => {
    const state = reduce(
      initialUIState,
      { type: 'OPEN_MODAL', modal: { kind: 'identityLedger' } },
      { type: 'OPEN_MODAL', modal: { kind: 'changePassword' } },
      { type: 'CLOSE_TOP_MODAL' }
    );
    expect(state.modalStack.map((m) => m.kind)).toEqual(['identityLedger']);
    expect(uiReducer(initialUIState, { type: 'CLOSE_TOP_MODAL' })).toBe(initialUIState);
  });
});

describe('widget flags and reset', () => {
  it('sets and clears widget focus and create flags', () => {
    const state = reduce(initialUIState, { type: 'FOCUS_REMINDER', id: 'r1' }, { type: 'SET_OPEN_CREATE_TASK', open: true });
    expect(state.widgetFocusReminderId).toBe('r1');
    expect(state.widgetOpenCreateTask).toBe(true);
  });

  it('RESET_ALL returns to Home with nothing open, keeping the view key', () => {
    const busy = reduce(
      initialUIState,
      { type: 'SET_TAB', tab: 'settings' },
      { type: 'OPEN_MODAL', modal: { kind: 'chronicle' } },
      { type: 'FOCUS_REMINDER', id: 'r1' },
      { type: 'RESET_VIEW' }
    );
    expect(uiReducer(busy, { type: 'RESET_ALL' })).toEqual({ ...initialUIState, viewResetKey: 1, chronicleVersion: 1 });
  });

  it('CHRONICLE_SAVED bumps the chronicle version', () => {
    expect(uiReducer(initialUIState, { type: 'CHRONICLE_SAVED' }).chronicleVersion).toBe(1);
  });
});

describe('resolveBackAction', () => {
  const withModal = { ...initialUIState, modalStack: [{ kind: 'chronicle' as const }] };

  it('closes a registered overlay first', () => {
    expect(resolveBackAction(true, withModal)).toBe('dismissOverlay');
  });

  it('then pops the modal stack', () => {
    expect(resolveBackAction(false, withModal)).toBe('closeTopModal');
  });

  it('then returns to Home from another tab', () => {
    expect(resolveBackAction(false, { ...initialUIState, activeTab: 'report' })).toBe('goHome');
  });

  it('only minimizes on Home with nothing open', () => {
    expect(resolveBackAction(false, initialUIState)).toBe('minimize');
  });
});
