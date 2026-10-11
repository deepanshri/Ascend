import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ProtectionWindow } from '../types';
import { usePersistEffect } from '../hooks/usePersistedState';
import {
  getExamShieldStatus,
  getVacationStatus,
  loadProtectionState,
  saveProtectionState,
  tickProtectionState,
  toggleExamShield,
  toggleVacation,
  type ProtectionModeStatus,
  type ProtectionState,
} from '../lib/protection';
import { closeProtectionWindow, fetchProtectionWindows, recordProtectionWindow } from '../lib/protectionWindows';
import { useCalendar } from './CalendarProvider';
import { useSession, useUserDataReset } from './SessionProvider';

interface ProtectionContextState {
  protection: ProtectionState;
  protectionWindows: ProtectionWindow[];
  examShieldActive: boolean;
  vacationModeActive: boolean;
  examShieldStatus: ProtectionModeStatus;
  vacationStatus: ProtectionModeStatus;
  /** Exam Shield or Vacation is on: missed days are not counted. */
  paused: boolean;
}

interface ProtectionActions {
  /** Turn Exam Shield on (after the confirmation modal) and record its window. */
  activateExamShield: () => void;
  /** Turn Exam Shield off and close its open window today. */
  deactivateExamShield: () => void;
  toggleVacation: () => void;
}

const ProtectionStateContext = createContext<ProtectionContextState | null>(null);
const ProtectionActionsContext = createContext<ProtectionActions | null>(null);

/** Close the newest still-open window of `mode` at `today`. */
function closeLatestWindow(
  windows: ProtectionWindow[],
  mode: ProtectionWindow['mode'],
  today: string,
  requireNotDeactivated: boolean
): { windows: ProtectionWindow[]; closed: ProtectionWindow | null } {
  const active = [...windows]
    .reverse()
    .find((window) => window.mode === mode && window.endsOn >= today && (!requireNotDeactivated || !window.deactivatedOn));
  if (!active) return { windows, closed: null };
  const closed = { ...active, endsOn: today, deactivatedOn: today };
  return { windows: windows.map((window) => (window.id === active.id ? closed : window)), closed };
}

export function ProtectionProvider({ children }: { children: React.ReactNode }) {
  const { session } = useSession();
  const { originIso } = useCalendar();
  const [protection, setProtection] = useState<ProtectionState>(() => loadProtectionState());
  const [protectionWindows, setProtectionWindows] = useState<ProtectionWindow[]>([]);
  const protectionRef = useRef(protection);
  const windowsRef = useRef(protectionWindows);
  const userIdRef = useRef(session?.id);
  userIdRef.current = session?.id;
  const todayRef = useRef(originIso);
  todayRef.current = originIso;

  const commitProtection = useCallback((next: ProtectionState) => {
    protectionRef.current = next;
    setProtection(next);
  }, []);
  const commitWindows = useCallback((next: ProtectionWindow[]) => {
    windowsRef.current = next;
    setProtectionWindows(next);
  }, []);

  usePersistEffect(protection, saveProtectionState);

  // Expire modes whose window ended; re-checked whenever the calendar day changes.
  useEffect(() => {
    commitProtection(tickProtectionState(protectionRef.current, originIso));
  }, [originIso, commitProtection]);

  useEffect(() => {
    if (!session?.id || session.isGuest) {
      commitWindows([]);
      return;
    }
    let cancelled = false;
    void fetchProtectionWindows(session.id).then((windows) => {
      if (!cancelled) commitWindows(windows);
    });
    return () => {
      cancelled = true;
    };
  }, [session?.id, session?.isGuest, commitWindows]);

  useUserDataReset(() => {
    commitProtection(loadProtectionState());
    commitWindows([]);
  });

  const recordWindow = useCallback(
    (mode: ProtectionWindow['mode'], startsOn: string, endsOn: string) => {
      const window: ProtectionWindow = { id: crypto.randomUUID(), userId: userIdRef.current || '', mode, startsOn, endsOn };
      commitWindows([...windowsRef.current, window]);
      void recordProtectionWindow(userIdRef.current, window).catch(() => {});
    },
    [commitWindows]
  );

  const closeWindow = useCallback(
    (mode: ProtectionWindow['mode'], requireNotDeactivated: boolean) => {
      const today = todayRef.current;
      const { windows, closed } = closeLatestWindow(windowsRef.current, mode, today, requireNotDeactivated);
      if (!closed) return;
      commitWindows(windows);
      void closeProtectionWindow(userIdRef.current, closed.id, today).catch(() => {});
    },
    [commitWindows]
  );

  const activateExamShield = useCallback(() => {
    const prev = protectionRef.current;
    const result = toggleExamShield(prev);
    commitProtection(result.state);
    if (result.ok && result.state.examShield.active && !prev.examShield.active) {
      const startsOn = result.state.examShield.startedOn || todayRef.current;
      recordWindow('exam_shield', startsOn, result.state.examShield.endsOn || startsOn);
    }
  }, [commitProtection, recordWindow]);

  const deactivateExamShield = useCallback(() => {
    const prev = protectionRef.current;
    if (!prev.examShield.active) return;
    const result = toggleExamShield(prev);
    commitProtection(result.state);
    if (result.ok && !result.state.examShield.active) closeWindow('exam_shield', true);
  }, [commitProtection, closeWindow]);

  const toggleVacationMode = useCallback(() => {
    const prev = protectionRef.current;
    const result = toggleVacation(prev);
    commitProtection(result.state);
    if (!result.ok) return;
    if (result.state.vacation.active && !prev.vacation.active) {
      const today = todayRef.current;
      recordWindow('vacation', result.state.vacation.startedOn || today, result.state.vacation.endsOn || today);
    } else if (prev.vacation.active && !result.state.vacation.active) {
      closeWindow('vacation', false);
    }
  }, [commitProtection, recordWindow, closeWindow]);

  const state = useMemo<ProtectionContextState>(
    () => ({
      protection,
      protectionWindows,
      examShieldActive: protection.examShield.active,
      vacationModeActive: protection.vacation.active,
      examShieldStatus: getExamShieldStatus(protection),
      vacationStatus: getVacationStatus(protection),
      paused: protection.examShield.active || protection.vacation.active,
    }),
    [protection, protectionWindows]
  );

  const actions = useMemo<ProtectionActions>(
    () => ({ activateExamShield, deactivateExamShield, toggleVacation: toggleVacationMode }),
    [activateExamShield, deactivateExamShield, toggleVacationMode]
  );

  return (
    <ProtectionActionsContext.Provider value={actions}>
      <ProtectionStateContext.Provider value={state}>{children}</ProtectionStateContext.Provider>
    </ProtectionActionsContext.Provider>
  );
}

export function useProtection(): ProtectionContextState {
  const value = useContext(ProtectionStateContext);
  if (!value) throw new Error('useProtection must be used inside ProtectionProvider');
  return value;
}

export function useProtectionActions(): ProtectionActions {
  const value = useContext(ProtectionActionsContext);
  if (!value) throw new Error('useProtectionActions must be used inside ProtectionProvider');
  return value;
}
