-- Fix existing reminders table missing columns before creating indexes
ALTER TABLE IF EXISTS public.reminders 
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS notification_id_1 INTEGER,
  ADD COLUMN IF NOT EXISTS notification_id_2 INTEGER,
  ADD COLUMN IF NOT EXISTS days_of_week INTEGER[] NOT NULL DEFAULT '{}'::INTEGER[],
  ADD COLUMN IF NOT EXISTS alert_10min BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS alert_exact BOOLEAN NOT NULL DEFAULT TRUE;

-- Append-only momentum event log.
CREATE TABLE IF NOT EXISTS public.momentum_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  habit_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('full', 'fallback', 'missed')),
  weight DOUBLE PRECISION NOT NULL,
  "timestamp" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS momentum_events_user_time_idx
  ON public.momentum_events (user_id, "timestamp");

CREATE INDEX IF NOT EXISTS momentum_events_user_type_idx
  ON public.momentum_events (user_id, event_type);

ALTER TABLE public.momentum_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS momentum_events_select_own ON public.momentum_events;
CREATE POLICY momentum_events_select_own
  ON public.momentum_events
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS momentum_events_insert_own ON public.momentum_events;
CREATE POLICY momentum_events_insert_own
  ON public.momentum_events
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

REVOKE UPDATE, DELETE ON public.momentum_events FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.prevent_momentum_events_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'momentum_events is append-only';
END;
$$;

DROP TRIGGER IF EXISTS momentum_events_no_update ON public.momentum_events;
CREATE TRIGGER momentum_events_no_update
  BEFORE UPDATE ON public.momentum_events
  FOR EACH ROW
  EXECUTE PROCEDURE public.prevent_momentum_events_mutation();

DROP TRIGGER IF EXISTS momentum_events_no_delete ON public.momentum_events;
CREATE TRIGGER momentum_events_no_delete
  BEFORE DELETE ON public.momentum_events
  FOR EACH ROW
  EXECUTE PROCEDURE public.prevent_momentum_events_mutation();

-- Reminders Table Definition
CREATE TABLE IF NOT EXISTS public.reminders (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  habit_id TEXT,
  title TEXT NOT NULL,
  date DATE NOT NULL,
  target_time TIME,
  days_of_week INTEGER[] NOT NULL DEFAULT '{}'::INTEGER[],
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  notification_id_1 INTEGER,
  notification_id_2 INTEGER,
  notes TEXT,
  completed BOOLEAN NOT NULL DEFAULT FALSE,
  deleted BOOLEAN NOT NULL DEFAULT FALSE,
  alert_10min BOOLEAN NOT NULL DEFAULT TRUE,
  alert_exact BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS reminders_user_updated_idx
  ON public.reminders (user_id, updated_at DESC);

ALTER TABLE public.reminders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS reminders_select_own ON public.reminders;
CREATE POLICY reminders_select_own
  ON public.reminders
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS reminders_insert_own ON public.reminders;
CREATE POLICY reminders_insert_own
  ON public.reminders
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS reminders_update_own ON public.reminders;
CREATE POLICY reminders_update_own
  ON public.reminders
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS reminders_delete_own ON public.reminders;
CREATE POLICY reminders_delete_own
  ON public.reminders
  FOR DELETE
  USING (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.reminders TO authenticated;

-- Auto-confirm Auth Users
UPDATE auth.users
SET email_confirmed_at = COALESCE(email_confirmed_at, NOW())
WHERE email_confirmed_at IS NULL;

CREATE OR REPLACE FUNCTION public.auto_confirm_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = auth
AS $$
BEGIN
  new.email_confirmed_at := COALESCE(new.email_confirmed_at, NOW());
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS auto_confirm_auth_user ON auth.users;
CREATE TRIGGER auto_confirm_auth_user
  BEFORE INSERT ON auth.users
  FOR EACH ROW
  EXECUTE PROCEDURE public.auto_confirm_auth_user();

-- Extra Column Fixes
ALTER TABLE IF EXISTS public.habit_logs
  ADD COLUMN IF NOT EXISTS friction_reason TEXT;

ALTER TABLE IF EXISTS public.habits
  ADD COLUMN IF NOT EXISTS is_keystone BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE IF EXISTS public.profiles
  ADD COLUMN IF NOT EXISTS friend_code TEXT;

ALTER TABLE IF EXISTS public.profiles
  ADD COLUMN IF NOT EXISTS avatar_url TEXT;