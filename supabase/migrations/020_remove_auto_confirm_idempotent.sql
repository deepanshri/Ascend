-- Idempotent reaffirmation: remove auto-confirm bypass on auth.users.
-- Canonical teardown also lives in 017_remove_auto_confirm.sql.
-- Safe to re-run if 003 was applied and 017 was skipped on any environment.
--
-- Trigger name:  auto_confirm_auth_user  (ON auth.users BEFORE INSERT)
-- Function name: public.auto_confirm_auth_user()
--
-- Does not touch public.momentum_events or any app data tables.
-- Existing confirmed users keep email_confirmed_at as-is.

DROP TRIGGER IF EXISTS auto_confirm_auth_user ON auth.users;
DROP FUNCTION IF EXISTS public.auto_confirm_auth_user();
