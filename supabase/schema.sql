-- Solo Ideas — initial schema + Row Level Security + realtime.
-- Run this once in Supabase Dashboard -> SQL Editor -> New Query -> paste -> Run.

create extension if not exists "uuid-ossp";

-- ---------------- Table ----------------

create table if not exists public.ideas (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  text        text not null check (char_length(text) between 1 and 200),
  solution    text check (solution is null or char_length(solution) between 1 and 1000),
  done        boolean not null default false,
  position    double precision not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists ideas_user_position_idx
  on public.ideas (user_id, position);

-- ---------------- updated_at trigger ----------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists ideas_set_updated_at on public.ideas;
create trigger ideas_set_updated_at
  before update on public.ideas
  for each row execute function public.set_updated_at();

-- ---------------- Row Level Security ----------------

alter table public.ideas enable row level security;

drop policy if exists "ideas_select_own"  on public.ideas;
drop policy if exists "ideas_insert_own"  on public.ideas;
drop policy if exists "ideas_update_own"  on public.ideas;
drop policy if exists "ideas_delete_own"  on public.ideas;

create policy "ideas_select_own"
  on public.ideas for select
  using (auth.uid() = user_id);

create policy "ideas_insert_own"
  on public.ideas for insert
  with check (auth.uid() = user_id);

create policy "ideas_update_own"
  on public.ideas for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "ideas_delete_own"
  on public.ideas for delete
  using (auth.uid() = user_id);

-- ---------------- Realtime ----------------
-- Add the table to the realtime publication (idempotent).

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'ideas'
  ) then
    execute 'alter publication supabase_realtime add table public.ideas';
  end if;
end
$$;
