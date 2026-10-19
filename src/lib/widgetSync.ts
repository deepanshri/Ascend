import { Preferences } from '@capacitor/preferences';
import { WidgetBridge, type WidgetPendingAction } from './widgetBridge';
import { buildWidgetSnapshot, type WidgetPayload, type WidgetSnapshot, type WidgetSnapshotInput } from './widgetSnapshot';

export * from './widgetSnapshot';

export const WIDGET_DATA_KEY = 'ascend_widget_data';
export const WIDGET_SCHEME = 'ascend';

export type WidgetRoute =
  | { tab: 'report' }
  | { tab: 'reminders'; reminderId?: string; openCreate?: boolean }
  | { tab: 'home'; habitId?: string; openCreate?: boolean }
  | { tab: 'ledger' };

export async function syncWidgetData(payload: WidgetPayload | WidgetSnapshot): Promise<void> {
  const serialized = JSON.stringify(payload);

  try {
    localStorage.setItem(WIDGET_DATA_KEY, serialized);
  } catch {
    // Web storage can be unavailable in private mode.
  }

  // Both native calls are dispatched now, not one after the other: when this
  // runs from the background flush the OS may suspend JS right after.
  await Promise.allSettled([
    Preferences.set({ key: WIDGET_DATA_KEY, value: serialized }),
    // Absent on web: the call rejects and is ignored.
    WidgetBridge.sync({ payload: serialized }),
  ]);
}

export async function publishWidgetSnapshot(input: WidgetSnapshotInput): Promise<WidgetSnapshot> {
  const snapshot = buildWidgetSnapshot(input);
  await syncWidgetData(snapshot);
  return snapshot;
}

export async function consumeWidgetActions(): Promise<WidgetPendingAction[]> {
  try {
    const result = await WidgetBridge.consumeActions();
    return Array.isArray(result.actions) ? result.actions : [];
  } catch {
    return [];
  }
}

export function parseWidgetRoute(url?: string | null): WidgetRoute | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== `${WIDGET_SCHEME}:`) return null;
    const path = `${parsed.host}${parsed.pathname}`.replace(/\/+$/, '').replace(/^\/+/, '');
    const reminderId = parsed.searchParams.get('id') || parsed.searchParams.get('reminder') || undefined;
    const habitId = parsed.searchParams.get('id') || parsed.searchParams.get('habit') || parsed.searchParams.get('habitId') || undefined;
    if (path === 'widget/report' || path === 'app/report' || path === 'report') return { tab: 'report' };
    if (path === 'widget/create-task' || path === 'app/create-task' || path === 'create-task') {
      return { tab: 'reminders', openCreate: true };
    }
    if (path === 'widget/reminders' || path === 'app/reminders' || path === 'reminders' || path === 'app/tasks' || path === 'tasks') {
      return { tab: 'reminders', reminderId };
    }
    if (path === 'widget/ledger' || path === 'app/ledger' || path === 'ledger') return { tab: 'ledger' };
    if (path === 'widget/quick-add' || path === 'widget/create-habit' || path === 'app/create-habit' || path === 'create-habit') {
      return { tab: 'home', openCreate: true };
    }
    if (path === 'widget/log' || path === 'app/log') {
      return { tab: 'home', habitId };
    }
    if (path === 'widget/open' || path === 'app/home' || path === 'home' || path === 'app' || path === 'widget') {
      return { tab: 'home', habitId };
    }
    return null;
  } catch {
    return null;
  }
}

export async function readLaunchWidgetRoute(): Promise<WidgetRoute | null> {
  try {
    const result = await WidgetBridge.getLaunchRoute();
    return parseWidgetRoute(result.url);
  } catch {
    return null;
  }
}

export type { WidgetPendingAction } from './widgetBridge';
