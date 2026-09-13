-- Keystone flag on habits. Active keystones are capped at 2 in the client.
alter table if exists public.habits
  add column if not exists is_keystone boolean not null default false;
