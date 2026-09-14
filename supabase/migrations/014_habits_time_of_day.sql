-- Dual-bowl: morning vs night on habits and append-only momentum events.

alter table if exists public.habits
  add column if not exists time_of_day text not null default 'morning';

update public.habits
set time_of_day = 'night'
where coalesce(time_of_day, 'morning') = 'morning'
  and coalesce(timestamp, '') ~* '(^|[^a-z])(pm|p\.m\.|night|evening)([^a-z]|$)';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'habits_time_of_day_check'
  ) then
    alter table public.habits
      add constraint habits_time_of_day_check
      check (time_of_day in ('morning', 'night'));
  end if;
end $$;

alter table if exists public.momentum_events
  add column if not exists time_of_day text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'momentum_events_time_of_day_check'
  ) then
    alter table public.momentum_events
      add constraint momentum_events_time_of_day_check
      check (time_of_day is null or time_of_day in ('morning', 'night'));
  end if;
end $$;
