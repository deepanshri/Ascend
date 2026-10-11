import React, { createContext, useContext, useEffect, useMemo, useReducer, useRef } from 'react';
import { App as CapacitorApp } from '@capacitor/app';
import type { ActiveTab } from '../types';
import { useBackButton } from '../hooks/useBackButton';
import { initialUIState, resolveBackAction, uiReducer, type AppModal, type AppModalKind, type UIState } from './uiReducer';

interface UIActions {
  setTab: (tab: ActiveTab | string) => void;
  /** Push a modal, or replace the open modal of the same kind in place. */
  openModal: (modal: AppModal) => void;
  /** Replace the open modal of the same kind; no-op when it is not open. */
  updateModal: (modal: AppModal) => void;
  /** Close modals of `kind`; with `habitId`, only those showing that habit. */
  closeModal: (kind: AppModalKind, habitId?: string) => void;
  closeTopModal: () => void;
  resetView: () => void;
  focusReminder: (id: string | null) => void;
  setOpenCreateTask: (open: boolean) => void;
  /** Back to Home with no modals or widget flags, e.g. on sign-out. */
  resetAll: () => void;
}

/** Overlay registered for the back button; `close: null` blocks back while it is open. */
interface BackOverlay {
  id: number;
  close: (() => void) | null;
}

interface BackStack {
  /** Register an overlay on top of the stack; returns its removal function. */
  register: (close: (() => void) | null) => () => void;
}

const UIStateContext = createContext<UIState | null>(null);
const UIActionsContext = createContext<UIActions | null>(null);
const BackStackContext = createContext<BackStack | null>(null);

export function UIProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(uiReducer, initialUIState);
  const stateRef = useRef(state);
  stateRef.current = state;

  const overlaysRef = useRef<BackOverlay[]>([]);
  const nextOverlayIdRef = useRef(0);

  const backStack = useMemo<BackStack>(
    () => ({
      register(close) {
        const entry: BackOverlay = { id: ++nextOverlayIdRef.current, close };
        overlaysRef.current = [...overlaysRef.current, entry];
        return () => {
          overlaysRef.current = overlaysRef.current.filter((overlay) => overlay.id !== entry.id);
        };
      },
    }),
    []
  );

  const actions = useMemo<UIActions>(
    () => ({
      setTab: (tab) => dispatch({ type: 'SET_TAB', tab }),
      openModal: (modal) => dispatch({ type: 'OPEN_MODAL', modal }),
      updateModal: (modal) => dispatch({ type: 'UPDATE_MODAL', modal }),
      closeModal: (kind, habitId) => dispatch({ type: 'CLOSE_MODAL', kind, habitId }),
      closeTopModal: () => dispatch({ type: 'CLOSE_TOP_MODAL' }),
      resetView: () => dispatch({ type: 'RESET_VIEW' }),
      focusReminder: (id) => dispatch({ type: 'FOCUS_REMINDER', id }),
      setOpenCreateTask: (open) => dispatch({ type: 'SET_OPEN_CREATE_TASK', open }),
      resetAll: () => dispatch({ type: 'RESET_ALL' }),
    }),
    []
  );

  useBackButton(() => {
    const overlays = overlaysRef.current;
    const top = overlays[overlays.length - 1];
    switch (resolveBackAction(Boolean(top), stateRef.current)) {
      case 'dismissOverlay':
        top.close?.();
        return;
      case 'closeTopModal':
        actions.closeTopModal();
        return;
      case 'goHome':
        actions.setTab('home');
        return;
      case 'minimize':
        void CapacitorApp.minimizeApp().catch(() => {});
    }
  });

  return (
    <BackStackContext.Provider value={backStack}>
      <UIActionsContext.Provider value={actions}>
        <UIStateContext.Provider value={state}>{children}</UIStateContext.Provider>
      </UIActionsContext.Provider>
    </BackStackContext.Provider>
  );
}

export function useUI(): UIState {
  const value = useContext(UIStateContext);
  if (!value) throw new Error('useUI must be used inside UIProvider');
  return value;
}

export function useUIActions(): UIActions {
  const value = useContext(UIActionsContext);
  if (!value) throw new Error('useUIActions must be used inside UIProvider');
  return value;
}

/**
 * Let the Android back button close this overlay while `open` is true. Pass
 * `onClose: null` to swallow back presses instead (non-dismissible overlays).
 * Overlays opened later sit on top. A no-op outside UIProvider.
 */
export function useBackDismiss(open: boolean, onClose: (() => void) | null): void {
  const backStack = useContext(BackStackContext);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const dismissible = onClose !== null;

  useEffect(() => {
    if (!open || !backStack) return;
    return backStack.register(dismissible ? () => closeRef.current?.() : null);
  }, [open, backStack, dismissible]);
}
