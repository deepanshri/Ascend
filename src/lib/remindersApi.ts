import { supabase } from './supabaseClient';
import { getLocalDateString } from '../utils/date';

export interface ReminderItem {
  id: string;
  user_id?: string;
  title: string;
  date?: string;
  target_time: string;
  days_of_week: number[];
  is_enabled: boolean;
}

export async function fetchReminders(): Promise<ReminderItem[]> {
  const cached = localStorage.getItem('ascend_reminders');
  const localData = cached ? JSON.parse(cached) : [];

  try {
    const { data, error } = await supabase
      .from('reminders')
      .select('*')
      .eq('deleted', false)
      .order('created_at', { ascending: false });

    if (!error && data) {
      localStorage.setItem('ascend_reminders', JSON.stringify(data));
      return data as ReminderItem[];
    }
  } catch (err) {
    console.warn('Background reminders fetch failed, using local cache:', err);
  }
  return localData;
}

export async function saveReminder(reminder: Partial<ReminderItem>): Promise<ReminderItem | null> {
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) return null;

  const payload = {
    id: reminder.id || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `rem-${Date.now()}`),
    date: reminder.date || getLocalDateString(),
    days_of_week: reminder.days_of_week ?? [],
    ...reminder,
    user_id: authData.user.id,
    deleted: false,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('reminders')
    .upsert(payload)
    .select()
    .single();

  if (error) {
    console.error('Failed to save reminder to Supabase:', error);
    return null;
  }

  // Update local cache
  try {
    const cached = localStorage.getItem('ascend_reminders');
    const list = cached ? JSON.parse(cached) : [];
    if (Array.isArray(list)) {
      const idx = list.findIndex((r: ReminderItem) => r.id === (data as ReminderItem).id);
      if (idx >= 0) list[idx] = data;
      else list.unshift(data);
      localStorage.setItem('ascend_reminders', JSON.stringify(list));
    }
  } catch {}

  return data as ReminderItem;
}

export async function deleteReminder(reminderId: string): Promise<boolean> {
  const { error } = await supabase
    .from('reminders')
    .update({ deleted: true, updated_at: new Date().toISOString() })
    .eq('id', reminderId);

  if (error) {
    // Fallback hard delete
    const { error: hardErr } = await supabase
      .from('reminders')
      .delete()
      .eq('id', reminderId);

    if (hardErr) {
      console.error('Failed to delete reminder from Supabase:', hardErr);
      return false;
    }
  }

  // Update local cache
  try {
    const cached = localStorage.getItem('ascend_reminders');
    if (cached) {
      const list = JSON.parse(cached);
      if (Array.isArray(list)) {
        localStorage.setItem(
          'ascend_reminders',
          JSON.stringify(list.filter((r: ReminderItem) => r.id !== reminderId))
        );
      }
    }
  } catch {}

  return true;
}
