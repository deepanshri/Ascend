import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { supabase as existingClient, isSupabaseConfigured } from './supabase';

const env = (import.meta as any).env || {};
const supabaseUrl = env.VITE_SUPABASE_URL || 'https://dpgupbcbhkmjtyqkljpr.supabase.co';
const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_dQDYyETfjDGRHXqqCtXznA_SJHHuxJ8';

/**
 * Shared Supabase client instance.
 * Guaranteed to be non-null so consumers can directly invoke `.from()`, `.rpc()`, and `.auth`.
 */
export const supabase: SupabaseClient =
  existingClient ?? createClient(supabaseUrl, supabaseAnonKey);

export { isSupabaseConfigured };
export default supabase;
