-- Remove the auto-confirm trigger that bypasses Supabase email verification.
-- This trigger was set up for development convenience but allows anyone to
-- sign up claiming any email address without owning it — an impersonation risk
-- when the Friends feature identifies users by account.
--
-- After this migration:
--   • NEW sign-ups must confirm their email before the account becomes active.
--   • EXISTING users are unaffected — email_confirmed_at is already set for them.
--   • Supabase's built-in confirmation email flow (configured in Auth > Email Templates)
--     will send a confirmation link automatically on sign-up.
--
-- The one-time backfill that stamped existing NULL rows at migration run time is
-- already committed; there is no need to re-run it.

DROP TRIGGER IF EXISTS auto_confirm_auth_user ON auth.users;
DROP FUNCTION IF EXISTS public.auto_confirm_auth_user();
