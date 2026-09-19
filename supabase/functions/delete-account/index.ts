/**
 * delete-account Edge Function (optional / legacy)
 *
 * Preferred path: clients call `supabase.rpc('delete_own_account')` directly.
 * That SECURITY DEFINER RPC purges public.* data and deletes auth.users for
 * auth.uid() — no service_role on the client.
 *
 * This Edge Function remains as an ops fallback that:
 *   1. Calls the same `delete_own_account()` RPC with the user JWT.
 *   2. If the RPC already deleted auth.users, admin.deleteUser is a no-op/error
 *      that we tolerate.
 *
 * Deployment (optional):
 *   supabase functions deploy delete-account
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // ── Parse request ──────────────────────────────────────────────────────
    const { userId } = await req.json() as { userId?: string };
    if (!userId) {
      return new Response(
        JSON.stringify({ error: 'userId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ── Verify the caller's JWT and extract their sub (user id) ───────────
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing Authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    // Client authenticated as the calling user (to verify identity + run RPC)
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Verify the token and get the user
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid or expired session' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Cross-check: the userId in the request body must match the JWT sub.
    // This prevents one user from deleting another's account.
    if (user.id !== userId) {
      return new Response(
        JSON.stringify({ error: 'User ID mismatch — cannot delete another user\'s account' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ── Step 1: Delete all public.* data via RPC ──────────────────────────
    const { error: rpcError } = await userClient.rpc('delete_own_account');
    if (rpcError) {
      console.error('delete_own_account RPC failed:', rpcError.message);
      return new Response(
        JSON.stringify({ error: `Failed to delete user data: ${rpcError.message}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ── Step 2: Delete the auth.users row (requires service role) ─────────
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { error: deleteError } = await adminClient.auth.admin.deleteUser(userId);
    if (deleteError) {
      console.error('auth.admin.deleteUser failed:', deleteError.message);
      // Public data is already gone. Return success anyway — the auth shell
      // will be an empty row with no data. Log for manual cleanup if needed.
      return new Response(
        JSON.stringify({
          warning: 'Public data deleted but auth row removal failed. Contact support.',
          error: deleteError.message,
        }),
        { status: 207, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('delete-account unhandled error:', err);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
