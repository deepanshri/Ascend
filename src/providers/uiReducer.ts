/**
 * Pure UI navigation state: active tab, visited tabs, the App-level modal
 * stack and widget deep-link flags. UIProvider owns side effects.
 */
import type { ActiveTab, Habit } from '../types';

export const APP_TABS: readonly ActiveTab[] = ['home', 'reminders', 'report', 'personal', 'settings'];

export function resolveActiveTab(tab: ActiveTab | string | null | undefined): ActiveTab {
  return APP_TABS.includes(tab as ActiveTab) ? (tab as ActiveTab) : 'home';
}

/** App-level modals, top of the stack last. */
export type AppModal =
  | { kind: 'addHabit' }
  | { kind: 'habitDetail'; habit: Habit }
  | { kind: 'deleteHabit'; habit: Habit }
  | { kind: 'habitLongPress'; habitId: string; rect: DOMRect | null }
  | { kind: 'identityLedger' }
  | { kind: 'changePassword' }
  | { kind: 'examShield' }
  | { kind: 'chronicle' }
  | { kind: 'visionReminder'; text: string };

export type AppModalKind = AppModal['kind'];
export type ModalOf<K extends AppModalKind> = Extract<AppModal, { kind: K }>;

export interface UIState {
  activeTab: ActiveTab;
  /** Tabs opened at least once; their views stay mounted for instant switching. */
  visitedTabs: readonly ActiveTab[];
  /** Bumped to remount the tab host after an error-boundary reset. */
  viewResetKey: number;
  modalStack: readonly AppModal[];
  widgetFocusReminderId: string | null;
  widgetOpenCreateTask: boolean;
  /** Bumped when the evening chronicle is saved, so views showing it re-read it. */
  chronicleVersion: number;
}

export type UIAction =
  | { type: 'SET_TAB'; tab: ActiveTab | string }
  | { type: 'OPEN_MODAL'; modal: AppModal }
  | { type: 'UPDATE_MODAL'; modal: AppModal }
  | { type: 'CLOSE_MODAL'; kind: AppModalKind; habitId?: string }
  | { type: 'CLOSE_TOP_MODAL' }
  | { type: 'RESET_VIEW' }
  | { type: 'FOCUS_REMINDER'; id: string | null }
  | { type: 'SET_OPEN_CREATE_TASK'; open: boolean }
  | { type: 'CHRONICLE_SAVED' }
  | { type: 'RESET_ALL' };

export const initialUIState: UIState = {
  activeTab: 'home',
  visitedTabs: ['home'],
  viewResetKey: 0,
  modalStack: [],
  widgetFocusReminderId: null,
  widgetOpenCreateTask: false,
  chronicleVersion: 0,
};

function modalHabitId(modal: AppModal): string | undefined {
  if (modal.kind === 'habitDetail' || modal.kind === 'deleteHabit') return modal.habit.id;
  if (modal.kind === 'habitLongPress') return modal.habitId;
  return undefined;
}

export function uiReducer(state: UIState, action: UIAction): UIState {
  switch (action.type) {
    case 'SET_TAB': {
      const tab = resolveActiveTab(action.tab);
      if (tab === state.activeTab) return state;
      const visitedTabs = state.visitedTabs.includes(tab) ? state.visitedTabs : [...state.visitedTabs, tab];
      return { ...state, activeTab: tab, visitedTabs };
    }
    case 'OPEN_MODAL': {
      // One modal per kind: reopening a kind replaces it where it is.
      const index = state.modalStack.findIndex((modal) => modal.kind === action.modal.kind);
      const modalStack =
        index < 0
          ? [...state.modalStack, action.modal]
          : state.modalStack.map((modal, i) => (i === index ? action.modal : modal));
      return { ...state, modalStack };
    }
    case 'UPDATE_MODAL': {
      const index = state.modalStack.findIndex((modal) => modal.kind === action.modal.kind);
      if (index < 0) return state;
      return { ...state, modalStack: state.modalStack.map((modal, i) => (i === index ? action.modal : modal)) };
    }
    case 'CLOSE_MODAL': {
      const modalStack = state.modalStack.filter(
        (modal) =>
          modal.kind !== action.kind || (action.habitId !== undefined && modalHabitId(modal) !== action.habitId)
      );
      return modalStack.length === state.modalStack.length ? state : { ...state, modalStack };
    }
    case 'CLOSE_TOP_MODAL':
      return state.modalStack.length === 0 ? state : { ...state, modalStack: state.modalStack.slice(0, -1) };
    case 'RESET_VIEW':
      return { ...state, viewResetKey: state.viewResetKey + 1 };
    case 'FOCUS_REMINDER':
      return state.widgetFocusReminderId === action.id ? state : { ...state, widgetFocusReminderId: action.id };
    case 'SET_OPEN_CREATE_TASK':
      return state.widgetOpenCreateTask === action.open ? state : { ...state, widgetOpenCreateTask: action.open };
    case 'CHRONICLE_SAVED':
      return { ...state, chronicleVersion: state.chronicleVersion + 1 };
    case 'RESET_ALL':
      // Counters keep growing so views keyed on them always see a change.
      return { ...initialUIState, viewResetKey: state.viewResetKey, chronicleVersion: state.chronicleVersion + 1 };
    default:
      return state;
  }
}

export function findModal<K extends AppModalKind>(stack: readonly AppModal[], kind: K): ModalOf<K> | null {
  return (stack.find((modal) => modal.kind === kind) as ModalOf<K> | undefined) ?? null;
}

export type BackAction = 'dismissOverlay' | 'closeTopModal' | 'goHome' | 'minimize';

/**
 * What the Android back button does, in order: close the topmost registered
 * overlay, then any App-level modal that did not register, then return to
 * Home, and only then leave the app.
 */
export function resolveBackAction(overlayOpen: boolean, state: Pick<UIState, 'modalStack' | 'activeTab'>): BackAction {
  if (overlayOpen) return 'dismissOverlay';
  if (state.modalStack.length > 0) return 'closeTopModal';
  if (state.activeTab !== 'home') return 'goHome';
  return 'minimize';
}
