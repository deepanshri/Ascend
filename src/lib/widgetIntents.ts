/**
 * Pure decisions for input from the home-screen widget: what a queued widget
 * tap or a deep link should do in the app. useWidgetBridge carries them out.
 */
import type { WidgetPendingAction } from './widgetBridge';
import type { WidgetRoute } from './widgetSync';
import type { ActiveTab } from '../types';

export type WidgetActionIntent =
  | { kind: 'setReminderCompleted'; reminderId: string; completed: boolean }
  | { kind: 'completeHabit'; habitId: string }
  | { kind: 'resetHabit'; habitId: string }
  | { kind: 'none' };

/** A widget checkbox sets the target state; it only acts when the app's state differs. */
export function planWidgetAction(
  action: WidgetPendingAction | null | undefined,
  isHabitLoggedToday: (habitId: string) => boolean
): WidgetActionIntent {
  if (!action?.id) return { kind: 'none' };
  const completed = Boolean(action.completed);
  if (action.type === 'reminder') return { kind: 'setReminderCompleted', reminderId: action.id, completed };
  if (action.type !== 'habit') return { kind: 'none' };
  const logged = isHabitLoggedToday(action.id);
  if (completed && !logged) return { kind: 'completeHabit', habitId: action.id };
  if (!completed && logged) return { kind: 'resetHabit', habitId: action.id };
  return { kind: 'none' };
}

export type WidgetRouteStep =
  | { kind: 'showTab'; tab: ActiveTab }
  | { kind: 'focusReminder'; reminderId: string }
  | { kind: 'openCreateTask' }
  | { kind: 'openAddHabit' }
  | { kind: 'openHabit'; habitId: string }
  | { kind: 'openLedger' };

/** Steps for a deep link, in order. Adding a habit at the active-habit cap is skipped. */
export function planWidgetRoute(route: WidgetRoute | null | undefined, atHabitCap: boolean): WidgetRouteStep[] {
  if (!route) return [];
  switch (route.tab) {
    case 'report':
      return [{ kind: 'showTab', tab: 'report' }];
    case 'reminders':
      return [
        { kind: 'showTab', tab: 'reminders' },
        ...(route.reminderId ? [{ kind: 'focusReminder', reminderId: route.reminderId } as const] : []),
        ...(route.openCreate ? [{ kind: 'openCreateTask' } as const] : []),
      ];
    case 'home':
      return [
        { kind: 'showTab', tab: 'home' },
        ...(route.openCreate && !atHabitCap ? [{ kind: 'openAddHabit' } as const] : []),
        ...(route.habitId ? [{ kind: 'openHabit', habitId: route.habitId } as const] : []),
      ];
    case 'ledger':
      return [{ kind: 'showTab', tab: 'personal' }, { kind: 'openLedger' }];
    default:
      return [];
  }
}
