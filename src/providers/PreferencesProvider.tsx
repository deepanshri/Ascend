import React, { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef } from 'react';
import { usePersistEffect } from '../hooks/usePersistedState';
import {
  DEFAULT_EVENING_CHRONICLE_SETTINGS,
  loadEveningChronicleSettings,
  saveEveningChronicleSettings,
  type EveningChronicleSettings,
} from '../lib/chronicle';
import { DEFAULT_INTERESTS, INTERESTS_STORAGE_KEY } from '../lib/ledgerStorage';
import { loadStoredInterests } from '../lib/ledgerStorageLoaders';
import {
  DEFAULT_NOTIFICATION_WINDOWS,
  hydrateNotificationWindows,
  loadNotificationWindows,
  persistNotificationWindows,
  type NotificationWindowKey,
} from '../lib/notifications';
import { writeJson } from '../lib/storage';
import {
  DEFAULT_CYCLE_DAYS,
  clampCycleDays,
  persistCycleDays,
  readStoredCycleDays,
  type CycleDays,
} from '../services/reportService';
import {
  isCompletionSoundEnabled,
  isHapticVibrationEnabled,
  setCompletionSoundEnabled,
  setHapticVibrationEnabled,
} from '../utils/feedback';
import { preferencesReducer, type PreferencesState } from './preferencesReducer';
import { useUserDataReset } from './SessionProvider';

interface PreferencesActions {
  /** Replace interests, or derive them from the previous list. */
  setSelectedInterests: (update: string[] | ((prev: string[]) => string[])) => void;
  toggleNotificationWindow: (key: NotificationWindowKey) => void;
  setEveningChronicle: (settings: EveningChronicleSettings) => void;
  setCompletionSound: (enabled: boolean) => void;
  setHapticVibration: (enabled: boolean) => void;
  setCycleDays: (days: CycleDays) => void;
  /** Restore every preference to its default, in memory and in storage. */
  resetAll: () => void;
}

const PreferencesStateContext = createContext<PreferencesState | null>(null);
const PreferencesActionsContext = createContext<PreferencesActions | null>(null);

function loadPreferences(): PreferencesState {
  return {
    selectedInterests: loadStoredInterests(),
    notificationWindows: loadNotificationWindows(),
    eveningChronicle: loadEveningChronicleSettings(),
    completionSound: isCompletionSoundEnabled(),
    hapticVibration: isHapticVibrationEnabled(),
    cycleDays: readStoredCycleDays(),
  };
}

function defaultPreferences(): PreferencesState {
  return {
    selectedInterests: [...DEFAULT_INTERESTS],
    notificationWindows: { ...DEFAULT_NOTIFICATION_WINDOWS },
    eveningChronicle: { ...DEFAULT_EVENING_CHRONICLE_SETTINGS },
    completionSound: true,
    hapticVibration: true,
    cycleDays: DEFAULT_CYCLE_DAYS,
  };
}

export function PreferencesProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(preferencesReducer, undefined, loadPreferences);
  /** Set when the user changed notification windows, so hydration never writes back. */
  const persistWindowsRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void hydrateNotificationWindows().then((windows) => {
      if (!cancelled) dispatch({ type: 'SET_NOTIFICATION_WINDOWS', windows });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!persistWindowsRef.current) return;
    persistWindowsRef.current = false;
    void persistNotificationWindows(state.notificationWindows);
  }, [state.notificationWindows]);

  usePersistEffect(state.selectedInterests, (value) => writeJson(INTERESTS_STORAGE_KEY, value));

  const setSelectedInterests = useCallback<PreferencesActions['setSelectedInterests']>((update) => {
    dispatch({ type: 'SET_INTERESTS', update });
  }, []);

  const toggleNotificationWindow = useCallback((key: NotificationWindowKey) => {
    persistWindowsRef.current = true;
    dispatch({ type: 'TOGGLE_NOTIFICATION_WINDOW', key });
  }, []);

  const setEveningChronicle = useCallback((settings: EveningChronicleSettings) => {
    saveEveningChronicleSettings(settings);
    dispatch({ type: 'SET_EVENING_CHRONICLE', settings });
  }, []);

  const setCompletionSound = useCallback((enabled: boolean) => {
    setCompletionSoundEnabled(enabled);
    dispatch({ type: 'SET_COMPLETION_SOUND', enabled });
  }, []);

  const setHapticVibration = useCallback((enabled: boolean) => {
    setHapticVibrationEnabled(enabled);
    dispatch({ type: 'SET_HAPTIC_VIBRATION', enabled });
  }, []);

  const setCycleDays = useCallback((days: CycleDays) => {
    const next = clampCycleDays(days);
    persistCycleDays(next);
    dispatch({ type: 'SET_CYCLE_DAYS', days: next });
  }, []);

  const resetAll = useCallback(() => {
    const defaults = defaultPreferences();
    saveEveningChronicleSettings(defaults.eveningChronicle);
    setCompletionSoundEnabled(defaults.completionSound);
    setHapticVibrationEnabled(defaults.hapticVibration);
    persistCycleDays(defaults.cycleDays);
    persistWindowsRef.current = true;
    dispatch({ type: 'RESET_ALL', defaults });
  }, []);

  useUserDataReset(resetAll);

  const actions = useMemo<PreferencesActions>(
    () => ({
      setSelectedInterests,
      toggleNotificationWindow,
      setEveningChronicle,
      setCompletionSound,
      setHapticVibration,
      setCycleDays,
      resetAll,
    }),
    [
      setSelectedInterests,
      toggleNotificationWindow,
      setEveningChronicle,
      setCompletionSound,
      setHapticVibration,
      setCycleDays,
      resetAll,
    ]
  );

  return (
    <PreferencesActionsContext.Provider value={actions}>
      <PreferencesStateContext.Provider value={state}>{children}</PreferencesStateContext.Provider>
    </PreferencesActionsContext.Provider>
  );
}

export function usePreferences(): PreferencesState {
  const value = useContext(PreferencesStateContext);
  if (!value) throw new Error('usePreferences must be used inside PreferencesProvider');
  return value;
}

export function usePreferencesActions(): PreferencesActions {
  const value = useContext(PreferencesActionsContext);
  if (!value) throw new Error('usePreferencesActions must be used inside PreferencesProvider');
  return value;
}
