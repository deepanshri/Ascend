/**
 * Pure state transitions for user preferences. Persistence and defaults live
 * in PreferencesProvider; this module only imports types so it stays testable.
 */
import type { EveningChronicleSettings } from '../lib/chronicle';
import type { NotificationWindowKey, PsychologyNotificationWindows } from '../lib/notifications';
import type { CycleDays } from '../services/reportService';
import { normalizeCategoryKey } from '../utils/quotes';

export interface PreferencesState {
  selectedInterests: string[];
  notificationWindows: PsychologyNotificationWindows;
  eveningChronicle: EveningChronicleSettings;
  completionSound: boolean;
  hapticVibration: boolean;
  cycleDays: CycleDays;
}

export type PreferencesAction =
  | { type: 'SET_INTERESTS'; update: string[] | ((prev: string[]) => string[]) }
  | { type: 'SET_NOTIFICATION_WINDOWS'; windows: PsychologyNotificationWindows }
  | { type: 'TOGGLE_NOTIFICATION_WINDOW'; key: NotificationWindowKey }
  | { type: 'SET_EVENING_CHRONICLE'; settings: EveningChronicleSettings }
  | { type: 'SET_COMPLETION_SOUND'; enabled: boolean }
  | { type: 'SET_HAPTIC_VIBRATION'; enabled: boolean }
  | { type: 'SET_CYCLE_DAYS'; days: CycleDays }
  | { type: 'RESET_ALL'; defaults: PreferencesState };

function withField<K extends keyof PreferencesState>(
  state: PreferencesState,
  key: K,
  value: PreferencesState[K]
): PreferencesState {
  return Object.is(state[key], value) ? state : { ...state, [key]: value };
}

export function preferencesReducer(state: PreferencesState, action: PreferencesAction): PreferencesState {
  switch (action.type) {
    case 'SET_INTERESTS': {
      const next = typeof action.update === 'function' ? action.update(state.selectedInterests) : action.update;
      return withField(state, 'selectedInterests', next);
    }
    case 'SET_NOTIFICATION_WINDOWS':
      return withField(state, 'notificationWindows', action.windows);
    case 'TOGGLE_NOTIFICATION_WINDOW':
      return {
        ...state,
        notificationWindows: {
          ...state.notificationWindows,
          [action.key]: !state.notificationWindows[action.key],
        },
      };
    case 'SET_EVENING_CHRONICLE':
      return withField(state, 'eveningChronicle', action.settings);
    case 'SET_COMPLETION_SOUND':
      return withField(state, 'completionSound', action.enabled);
    case 'SET_HAPTIC_VIBRATION':
      return withField(state, 'hapticVibration', action.enabled);
    case 'SET_CYCLE_DAYS':
      return withField(state, 'cycleDays', action.days);
    case 'RESET_ALL':
      return action.defaults;
    default:
      return state;
  }
}

/** Add `interest` if absent, otherwise remove every entry matching it by key or case-insensitively. */
export function toggleInterest(interests: string[], interest: string): string[] {
  const targetKey = normalizeCategoryKey(interest);
  const target = interest.toLowerCase();
  const matches = (item: string) => normalizeCategoryKey(item) === targetKey || item.toLowerCase() === target;
  return interests.some(matches) ? interests.filter((item) => !matches(item)) : [...interests, interest];
}
