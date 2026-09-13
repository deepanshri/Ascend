-- Server-side backstop for the 20 active-habit cap.
-- A CHECK constraint cannot count sibling rows, so this trigger rejects
-- inserts and unarchives that would put a user over 20 non-archived habits.

create or replace function public.enforce_active_habit_cap()
returns trigger
language plpgsql
as $$
declare
  active_count integer;
begin
  if coalesce(new.archived, false) then
    return new;
  end if;

  select count(*)
    into active_count
  from public.habits
  where user_id = new.user_id
    and coalesce(archived, false) = false
    and id is distinct from new.id;

  if active_count >= 20 then
    raise exception 'Maximum limit of 20 active habits reached.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'habits'
  ) then
    execute 'drop trigger if exists habits_active_cap on public.habits';
    execute 'create trigger habits_active_cap before insert or update on public.habits for each row execute procedure public.enforce_active_habit_cap()';
  end if;
end $$;
