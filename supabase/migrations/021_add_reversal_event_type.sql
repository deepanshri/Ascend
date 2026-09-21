-- Migration 021: Add 'reversal' event type for append-only momentum resets.
-- Sequential version follows 020_remove_auto_confirm_idempotent.sql.

alter table public.momentum_events
  drop constraint if exists momentum_events_event_type_check;

alter table public.momentum_events
  add constraint momentum_events_event_type_check
  check (event_type in ('full', 'fallback', 'missed', 'reversal'));
