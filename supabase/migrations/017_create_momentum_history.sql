-- 017_create_momentum_history.sql
-- Create public.momentum_history snapshot table with canonical columns and RLS

create table if not exists public.momentum_history (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  score double precision not null,
  recorded_date date not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(user_id, recorded_date)
);

-- Enable Row Level Security
alter table public.momentum_history enable row level security;

-- RLS Policy: Users can manage their own momentum history
create policy "Users can manage their own momentum history"
  on public.momentum_history
  for all using (auth.uid() = user_id);
