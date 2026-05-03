-- Increase the max length of `ideas.text` from 200 to 2000 characters.
-- Run once in Supabase Dashboard -> SQL Editor -> + New query -> paste -> Run.
-- Idempotent (safe to run multiple times).

do $$
declare
  con_name text;
begin
  -- Find any existing check constraint on the text column referencing char_length.
  select c.conname into con_name
  from pg_constraint c
  join pg_class t on c.conrelid = t.oid
  where t.relname = 'ideas'
    and c.contype = 'c'
    and pg_get_constraintdef(c.oid) ilike '%char_length(text)%';

  if con_name is not null then
    execute format('alter table public.ideas drop constraint %I', con_name);
  end if;
end
$$;

alter table public.ideas
  add constraint ideas_text_length_check
  check (char_length(text) between 1 and 2000);
