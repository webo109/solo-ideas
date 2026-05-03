-- Solo M3.5 + M4: docs (pin, organized_text), AI scheduling, chat threads.
-- Run once in Supabase Dashboard -> SQL Editor -> + New query -> paste -> Run.
-- Idempotent.

create extension if not exists "uuid-ossp";

-- ================================================================
-- Items: pin, organized_text, AI scheduling
-- ================================================================

alter table public.items add column if not exists pinned boolean not null default false;
alter table public.items add column if not exists organized_text text;
alter table public.items add column if not exists ai_organized_at timestamptz;
alter table public.items add column if not exists ai_schedule text not null default 'off'
  check (ai_schedule in ('off', 'manual', 'daily', 'weekly', 'monthly'));
alter table public.items add column if not exists ai_last_run_at timestamptz;
alter table public.items add column if not exists ai_suggestions text;

create index if not exists items_pinned_idx
  on public.items (user_id, project_id, pinned)
  where pinned = true;

create index if not exists items_ai_schedule_idx
  on public.items (user_id, ai_schedule, ai_last_run_at)
  where ai_schedule != 'off';

-- ================================================================
-- Projects: AI on/off (privacy gate)
-- ================================================================

alter table public.projects add column if not exists ai_enabled boolean not null default false;

-- ================================================================
-- Chat: threads + messages
-- ================================================================

create table if not exists public.chat_threads (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  title       text not null default 'Chat',
  day         date not null default current_date,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create unique index if not exists chat_threads_user_day_idx
  on public.chat_threads (user_id, day);

create index if not exists chat_threads_user_updated_idx
  on public.chat_threads (user_id, updated_at desc);

create table if not exists public.chat_messages (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  thread_id   uuid not null references public.chat_threads(id) on delete cascade,
  role        text not null check (role in ('user', 'assistant', 'system')),
  content     text not null,
  created_at  timestamptz not null default now()
);

create index if not exists chat_messages_thread_idx
  on public.chat_messages (thread_id, created_at);

-- ================================================================
-- updated_at trigger on chat_threads
-- ================================================================

drop trigger if exists chat_threads_set_updated_at on public.chat_threads;
create trigger chat_threads_set_updated_at
  before update on public.chat_threads
  for each row execute function public.set_updated_at();

-- ================================================================
-- RLS
-- ================================================================

alter table public.chat_threads  enable row level security;
alter table public.chat_messages enable row level security;

drop policy if exists "chat_threads_select_own" on public.chat_threads;
drop policy if exists "chat_threads_insert_own" on public.chat_threads;
drop policy if exists "chat_threads_update_own" on public.chat_threads;
drop policy if exists "chat_threads_delete_own" on public.chat_threads;

create policy "chat_threads_select_own" on public.chat_threads for select using (auth.uid() = user_id);
create policy "chat_threads_insert_own" on public.chat_threads for insert with check (auth.uid() = user_id);
create policy "chat_threads_update_own" on public.chat_threads for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "chat_threads_delete_own" on public.chat_threads for delete using (auth.uid() = user_id);

drop policy if exists "chat_messages_select_own" on public.chat_messages;
drop policy if exists "chat_messages_insert_own" on public.chat_messages;
drop policy if exists "chat_messages_delete_own" on public.chat_messages;

create policy "chat_messages_select_own" on public.chat_messages for select using (auth.uid() = user_id);
create policy "chat_messages_insert_own" on public.chat_messages for insert with check (auth.uid() = user_id);
create policy "chat_messages_delete_own" on public.chat_messages for delete using (auth.uid() = user_id);

-- ================================================================
-- Realtime for chat_messages (so streaming feels live)
-- ================================================================

do $PUB$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'chat_messages'
  ) then
    execute 'alter publication supabase_realtime add table public.chat_messages';
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'chat_threads'
  ) then
    execute 'alter publication supabase_realtime add table public.chat_threads';
  end if;
end
$PUB$;
