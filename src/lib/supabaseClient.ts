import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase as existingClient, isSupabaseConfigured } from './supabase';

if (!existingClient) {
  throw new Error(
    'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env (see .env.example).'
  );
}

/**
 * Shared Supabase client instance.
 * Guaranteed to be non-null so consumers can directly invoke `.from()`, `.rpc()`, and `.auth`.
 */
export const supabase: SupabaseClient = existingClient;

export { isSupabaseConfigured };
export default supabase;
