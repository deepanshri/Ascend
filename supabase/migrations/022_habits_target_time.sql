-- Add optional target_time column to public.habits for daily scheduling
alter table if exists public.habits
  add column if not exists target_time text;
