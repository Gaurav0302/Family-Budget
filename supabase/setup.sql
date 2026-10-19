-- Family Budget: database setup.
-- Run this once in Supabase: SQL Editor -> New query -> paste everything -> Run.
-- Run it AFTER creating the logins for each person (Authentication -> Users),
-- and put their emails in the last step: only those logins get into the family's data.
-- It is safe to run again: nothing is deleted.

-- Who is allowed in: only logins listed here can read or change anything.
create table if not exists public.members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  added timestamptz not null default now()
);

create or replace function public.is_member() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.members where user_id = auth.uid());
$$;

create table if not exists public.transactions (
  id text primary key,
  date date not null,
  account text not null,
  description text not null,
  amount numeric(12,2) not null,
  category text,
  kind text,
  note text,
  one_off boolean not null default false,
  manual boolean not null default false,
  needs_review boolean not null default false,
  source text,
  updated_at timestamptz not null default now()
);
create index if not exists transactions_date on public.transactions (date);

create table if not exists public.rules (
  id text primary key,
  pattern text not null,
  category text not null,
  kind text not null,
  sign text,
  account text,
  created_at timestamptz not null default now()
);

create table if not exists public.budgets (
  category text not null,
  from_month text not null,
  amount numeric(12,2) not null,
  primary key (category, from_month)
);

create table if not exists public.coverage (
  account text not null,
  from_date date not null,
  to_date date not null,
  primary key (account, from_date, to_date)
);

create table if not exists public.settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.reviews (
  id text primary key,
  month text not null,
  title text not null,
  body text not null,
  author text,
  created timestamptz not null default now()
);

-- Lock every table so only family members get in.
do $$
declare t text;
begin
  foreach t in array array['transactions','rules','budgets','coverage','settings','reviews'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "family only" on public.%I', t);
    execute format('create policy "family only" on public.%I for all to authenticated using (public.is_member()) with check (public.is_member())', t);
  end loop;
end $$;

alter table public.members enable row level security;
drop policy if exists "see yourself" on public.members;
create policy "see yourself" on public.members for select to authenticated using (user_id = auth.uid());

-- A harmless "are you awake?" call. A weekly GitHub job calls it so the free project never goes to sleep.
create or replace function public.ping() returns text language sql stable as $$ select 'ok'::text $$;
grant execute on function public.ping() to anon, authenticated;

-- Let in the family's logins, by email. Put each person's email between the quotes (add a line per person).
-- Only the emails listed here get access, so running this again never lets in a login you didn't name.
insert into public.members (user_id, email)
select id, email from auth.users
where lower(email) in (lower('first.person@example.com'), lower('second.person@example.com'))
on conflict (user_id) do nothing;

-- Shows who now has access. You should see two rows.
select email, added from public.members order by added;
