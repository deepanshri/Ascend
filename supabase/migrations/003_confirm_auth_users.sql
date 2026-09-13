-- One-time: paste into the Supabase SQL Editor and run.
-- Valid email + password becomes a signed-in account. No inbox link, no dashboard Confirm click.

update auth.users
set email_confirmed_at = coalesce(email_confirmed_at, now())
where email_confirmed_at is null;

create or replace function public.auto_confirm_auth_user()
returns trigger
language plpgsql
security definer
set search_path = auth
as $$
begin
  new.email_confirmed_at := coalesce(new.email_confirmed_at, now());
  return new;
end;
$$;

drop trigger if exists auto_confirm_auth_user on auth.users;
create trigger auto_confirm_auth_user
  before insert on auth.users
  for each row
  execute procedure public.auto_confirm_auth_user();
