-- Purge integrity-audit test accounts and cascaded rows.
-- Append-only triggers on momentum_events would otherwise block user deletes.

alter table if exists public.momentum_events disable trigger momentum_events_no_delete;
alter table if exists public.momentum_events disable trigger momentum_events_no_update;

delete from auth.users
where email ilike 'ascend.integrity.%';

delete from public.profiles
where email ilike 'ascend.integrity.%';

alter table if exists public.momentum_events enable trigger momentum_events_no_delete;
alter table if exists public.momentum_events enable trigger momentum_events_no_update;
