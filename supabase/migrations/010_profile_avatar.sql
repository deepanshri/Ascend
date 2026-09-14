-- Static profile avatars: store option id (avatar_1 … avatar_7) in profiles.avatar_url.

alter table if exists public.profiles
  add column if not exists avatar_url text;
