/**
 * delete-account Edge Function
 *
 * Permanently deletes an authenticated user's account:
 *   1. Calls the `delete_own_account()` RPC to purge all public.* data.
 *   2. Calls `supabase.auth.admin.deleteUser()` (requires SERVICE_ROLE_KEY)
 *      to delete the auth.users row.
 *
 * Security:
 *   - The JWT from the Authorization header is verified by Supabase automatically.
 *   - We cross-check that the JWT sub (user id) matches the userId in the request body.
 *   - Only the authenticated user can delete their own account.
 *
 * Deployment:
 *   supabase functions deploy delete-account
 *   supabase secrets set SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>
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
