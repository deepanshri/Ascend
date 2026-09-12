import { Preferences } from '@capacitor/preferences';

export const WIDGET_DATA_KEY = 'ascend_widget_data';

export interface WidgetPayload {
  score: number;
  habitsCompleted: number;
  totalHabits: number;
  lastUpdated: string;
}

export async function syncWidgetData(payload: WidgetPayload): Promise<void> {
  const serialized = JSON.stringify(payload);

  try {
    localStorage.setItem(WIDGET_DATA_KEY, serialized);
  } catch {
    // Web storage can be unavailable in private mode.
  }

  try {
    await Preferences.set({ key: WIDGET_DATA_KEY, value: serialized });
  } catch {
    // Preferences plugin is a no-op when native storage is unavailable.
  }
}
