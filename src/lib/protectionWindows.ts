import type { ProtectionWindow } from '../types';
import { isSupabaseConfigured, supabase } from './supabase';

type ProtectionRow = {
  id: string;
  user_id: string;
  mode: ProtectionWindow['mode'];
  starts_on: string;
  ends_on: string;
  deactivated_on?: string | null;
};

function canSync(userId?: string | null): boolean {
  return Boolean(isSupabaseConfigured && supabase && userId && !userId.startsWith('guest_'));
}

function fromRow(row: ProtectionRow): ProtectionWindow {
  return {
    id: row.id,
    userId: row.user_id,
    mode: row.mode,
    startsOn: row.starts_on,
    endsOn: row.ends_on,
    deactivatedOn: row.deactivated_on ?? null,
  };
}

export async function fetchProtectionWindows(userId?: string | null): Promise<ProtectionWindow[]> {
  if (!canSync(userId) || !supabase) return [];
  const { data, error } = await supabase
    .from('protection_windows')
    .select('*')
    .eq('user_id', userId)
    .order('starts_on', { ascending: true });
  if (error || !data) return [];
  return (data as ProtectionRow[]).map(fromRow);
}

export async function recordProtectionWindow(
  userId: string | null | undefined,
  window: ProtectionWindow
): Promise<boolean> {
  if (!canSync(userId) || !supabase) return false;
  const { error } = await supabase.from('protection_windows').insert({
    id: window.id,
    user_id: userId,
    mode: window.mode,
    starts_on: window.startsOn,
    ends_on: window.endsOn,
  });
  return !error;
}

export async function closeProtectionWindow(
  userId: string | null | undefined,
  id: string,
  endsOn: string
): Promise<boolean> {
  if (!canSync(userId) || !supabase) return false;
  const { error } = await supabase
    .from('protection_windows')
    .update({ ends_on: endsOn, deactivated_on: endsOn, updated_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('id', id);
  return !error;
}
