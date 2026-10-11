import { useEffect, useRef } from 'react';
import { App as CapacitorApp } from '@capacitor/app';
import { hasLogOn } from '../lib/habitLogs';
import { isAtActiveHabitCap } from '../lib/protection';
import { WidgetBridge } from '../lib/widgetBridge';
import { planWidgetAction, planWidgetRoute } from '../lib/widgetIntents';
import { consumeWidgetActions, parseWidgetRoute, readLaunchWidgetRoute } from '../lib/widgetSync';
import type { WidgetPendingAction, WidgetRoute } from '../lib/widgetSync';
import { useLedger, useLedgerActions } from '../providers/HabitLedgerProvider';
import { useRemindersActions } from '../providers/RemindersProvider';
import { useUIActions } from '../providers/UIProvider';
import { getLocalDateString } from '../utils/dates';
import type { CompleteHabit } from './useCompleteHabit';

/** Re-drain after returning to the foreground, once the native side has queued the taps. */
const FOREGROUND_DRAIN_DELAY_MS = 150;

/**
 * Input from the home-screen widget: checkbox taps queued natively while the
 * app was closed, and deep links (launch URL, widget links, appUrlOpen).
 * Drained at mount and whenever the app returns to the foreground.
 */
export function useWidgetBridge(completeHabit: CompleteHabit): void {
  const { derivedHabits } = useLedger();
  const ledgerActions = useLedgerActions();
  const { setReminderCompleted } = useRemindersActions();
  const ui = useUIActions();

  // Native listeners are registered once; they read the latest app state through refs.
  const latest = useRef({ derivedHabits, ledgerActions, setReminderCompleted, ui, completeHabit });
  latest.current = { derivedHabits, ledgerActions, setReminderCompleted, ui, completeHabit };

  useEffect(() => {
    let cancelled = false;

    const applyAction = (action: WidgetPendingAction) => {
      const { ledgerActions: ledger, setReminderCompleted: setReminder, completeHabit: complete } = latest.current;
      const today = getLocalDateString();
      const intent = planWidgetAction(action, (habitId) =>
        hasLogOn(ledger.getSnapshot().completionEvents, habitId, today)
      );
      if (intent.kind === 'setReminderCompleted') setReminder(intent.reminderId, intent.completed);
      else if (intent.kind === 'completeHabit') complete(intent.habitId, false);
      else if (intent.kind === 'resetHabit') ledger.resetToday(intent.habitId);
    };

    const applyRoute = (route: WidgetRoute | null) => {
      const { ledgerActions: ledger, ui: actions, derivedHabits: habits } = latest.current;
      for (const step of planWidgetRoute(route, isAtActiveHabitCap(ledger.getSnapshot().habits))) {
        if (step.kind === 'showTab') actions.setTab(step.tab);
        else if (step.kind === 'focusReminder') actions.focusReminder(step.reminderId);
        else if (step.kind === 'openCreateTask') actions.setOpenCreateTask(true);
        else if (step.kind === 'openAddHabit') actions.openModal({ kind: 'addHabit' });
        else if (step.kind === 'openLedger') actions.openModal({ kind: 'identityLedger' });
        else if (step.kind === 'openHabit') {
          const habit = habits.find((item) => item.id === step.habitId);
          if (habit) actions.openModal({ kind: 'habitDetail', habit });
        }
      }
    };

    const drain = async () => {
      const [actions, launch] = await Promise.all([consumeWidgetActions(), readLaunchWidgetRoute()]);
      if (cancelled) return;
      actions.forEach(applyAction);
      applyRoute(launch);
    };

    void drain();
    void CapacitorApp.getLaunchUrl()
      .then((launch) => {
        if (!cancelled && launch?.url) applyRoute(parseWidgetRoute(launch.url));
      })
      .catch(() => {});

    const actionSub = WidgetBridge.addListener('widgetAction', applyAction);
    const linkSub = WidgetBridge.addListener('deepLink', (data) => applyRoute(parseWidgetRoute(data.url)));
    const appUrlSub = CapacitorApp.addListener('appUrlOpen', (data) => {
      if (data?.url) applyRoute(parseWidgetRoute(data.url));
    });

    const onVisible = () => {
      if (document.visibilityState === 'visible') window.setTimeout(() => void drain(), FOREGROUND_DRAIN_DELAY_MS);
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
      for (const sub of [actionSub, linkSub, appUrlSub]) {
        void Promise.resolve(sub)
          .then((handle) => handle.remove())
          .catch(() => {});
      }
    };
  }, []);
}
