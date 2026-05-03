-- Solo M1: Projects + Items + Archive
-- Run once in Supabase Dashboard -> SQL Editor -> + New query -> paste -> Run.
-- Idempotent: safe to run multiple times.

create extension if not exists "uuid-ossp";

-- ================================================================
-- Projects table
-- ================================================================

create table if not exists public.projects (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 80),
  color       text not null default '#7f00ff',
  icon        text,
  position    double precision not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists projects_user_position_idx
  on public.projects (user_id, position);

-- ================================================================
-- Items table (notes / ideas / tasks / docs)
-- ================================================================

create table if not exists public.items (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  project_id  uuid not null references public.projects(id) on delete cascade,
  kind        text not null default 'task'
              check (kind in ('note', 'idea', 'task', 'doc')),
  text        text not null check (char_length(text) between 1 and 5000),
  solution    text check (solution is null or char_length(solution) between 1 and 5000),
  status      text not null default 'open'
              check (status in ('open', 'today', 'done')),
  position    double precision not null,
  done_at     timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists items_user_project_kind_idx
  on public.items (user_id, project_id, kind, status, position);

create index if not exists items_user_done_at_idx
  on public.items (user_id, done_at desc)
  where done_at is not null;

-- ================================================================
-- updated_at triggers
-- ================================================================

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $FN$
begin
  new.updated_at = now();
  return new;
end;
$FN$;

drop trigger if exists projects_set_updated_at on public.projects;
create trigger projects_set_updated_at
  before update on public.projects
  for each row execute function public.set_updated_at();

drop trigger if exists items_set_updated_at on public.items;
create trigger items_set_updated_at
  before update on public.items
  for each row execute function public.set_updated_at();

-- Auto-set done_at when status moves to/from 'done'
create or replace function public.maintain_done_at()
returns trigger
language plpgsql
as $FN$
begin
  if new.status = 'done' and (old.status is null or old.status <> 'done') then
    new.done_at = now();
  elsif new.status <> 'done' and old.status = 'done' then
    new.done_at = null;
  end if;
  return new;
end;
$FN$;

drop trigger if exists items_done_at_trigger on public.items;
create trigger items_done_at_trigger
  before insert or update of status on public.items
  for each row execute function public.maintain_done_at();

-- ================================================================
-- Row Level Security
-- ================================================================

alter table public.projects enable row level security;
alter table public.items    enable row level security;

drop policy if exists "projects_select_own" on public.projects;
drop policy if exists "projects_insert_own" on public.projects;
drop policy if exists "projects_update_own" on public.projects;
drop policy if exists "projects_delete_own" on public.projects;

create policy "projects_select_own" on public.projects for select
  using (auth.uid() = user_id);
create policy "projects_insert_own" on public.projects for insert
  with check (auth.uid() = user_id);
create policy "projects_update_own" on public.projects for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "projects_delete_own" on public.projects for delete
  using (auth.uid() = user_id);

drop policy if exists "items_select_own" on public.items;
drop policy if exists "items_insert_own" on public.items;
drop policy if exists "items_update_own" on public.items;
drop policy if exists "items_delete_own" on public.items;

create policy "items_select_own" on public.items for select
  using (auth.uid() = user_id);
create policy "items_insert_own" on public.items for insert
  with check (auth.uid() = user_id);
create policy "items_update_own" on public.items for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "items_delete_own" on public.items for delete
  using (auth.uid() = user_id);

-- ================================================================
-- Realtime publication
-- ================================================================

do $PUB$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'projects'
  ) then
    execute 'alter publication supabase_realtime add table public.projects';
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'items'
  ) then
    execute 'alter publication supabase_realtime add table public.items';
  end if;
end
$PUB$;

-- ================================================================
-- Migrate existing `ideas` rows -> Inbox project + items
-- Idempotent: only runs for users who don't yet have any projects.
-- ================================================================

do $MIG$
declare
  u_id     uuid;
  inbox_id uuid;
begin
  -- Only run if the legacy `ideas` table exists.
  if to_regclass('public.ideas') is null then
    return;
  end if;

  for u_id in select distinct user_id from public.ideas loop
    if exists (select 1 from public.projects where user_id = u_id) then
      continue;
    end if;

    insert into public.projects (user_id, name, color, position)
    values (u_id, 'Inbox', '#7f00ff', 1000)
    returning id into inbox_id;

    insert into public.items
      (user_id, project_id, kind, text, solution, status, position, created_at, updated_at)
    select
      i.user_id,
      inbox_id,
      'idea',
      i.text,
      i.solution,
      case when i.done then 'done' else 'open' end,
      i.position,
      i.created_at,
      i.updated_at
    from public.ideas i
    where i.user_id = u_id;
  end loop;
end
$MIG$;

-- Note: the legacy `public.ideas` table is left intact for safety.
-- Once you've verified the new schema works for a few days, you can drop it manually:
--   drop table public.ideas cascade;
