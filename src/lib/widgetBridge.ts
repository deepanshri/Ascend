import { registerPlugin, WebPlugin } from '@capacitor/core';

export type WidgetPendingAction =
  | { type: 'habit'; id: string; completed: boolean }
  | { type: 'reminder'; id: string; completed: boolean };

export interface WidgetDeepLink {
  url: string;
}

export interface WidgetBridgePlugin {
  sync(options: { payload: string }): Promise<void>;
  consumeActions(): Promise<{ actions: WidgetPendingAction[] }>;
  getLaunchRoute(): Promise<{ url: string | null }>;
  addListener(
    eventName: 'widgetAction',
    listenerFunc: (action: WidgetPendingAction) => void
  ): Promise<{ remove: () => Promise<void> }>;
  addListener(
    eventName: 'deepLink',
    listenerFunc: (data: WidgetDeepLink) => void
  ): Promise<{ remove: () => Promise<void> }>;
}

const WEB_PENDING_KEY = 'ascend_widget_pending_actions';
const WEB_ROUTE_KEY = 'ascend_widget_launch_route';

function readWebPending(): WidgetPendingAction[] {
  try {
    const raw = localStorage.getItem(WEB_PENDING_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

class WidgetBridgeWeb extends WebPlugin implements WidgetBridgePlugin {
  async sync() {
    return;
  }

  async consumeActions() {
    const actions = readWebPending();
    try {
      localStorage.removeItem(WEB_PENDING_KEY);
    } catch {
      // private mode
    }
    return { actions };
  }

  async getLaunchRoute() {
    try {
      const url = localStorage.getItem(WEB_ROUTE_KEY);
      if (url) localStorage.removeItem(WEB_ROUTE_KEY);
      return { url };
    } catch {
      return { url: null };
    }
  }
}

export const WidgetBridge = registerPlugin<WidgetBridgePlugin>('WidgetBridge', {
  web: () => new WidgetBridgeWeb(),
});
