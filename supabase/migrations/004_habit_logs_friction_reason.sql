-- Store why a habit was missed. Written to the matching (habit_id, logged_date) row.
alter table if exists public.habit_logs
  add column if not exists friction_reason text;
