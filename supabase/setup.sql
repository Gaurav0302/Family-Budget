-- Family Purse: database setup (households version, D37).
-- Run in Supabase: SQL Editor -> New query -> paste everything -> Run.
-- Safe to run again, and safe on a database set up with the earlier one-family version: it moves that family's data into
-- a household of its own (their logins become its owner and members) and changes nothing else. Nothing is deleted.
-- Download a backup from the app (Settings -> Your data) before running it on a database that already has data.

begin;

-- ---------------------------------------------------------------------------------------------------------------
-- Households and the people in them
-- ---------------------------------------------------------------------------------------------------------------
create table if not exists public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Our household',
  -- Which plan the household is on. Everyone is on 'free' for now; paid features can check this later.
  plan text not null default 'free',
  created timestamptz not null default now()
);

-- One row per login. A login belongs to one household at a time.
create table if not exists public.members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  added timestamptz not null default now()
);
alter table public.members add column if not exists household_id uuid references public.households(id) on delete cascade;
alter table public.members add column if not exists role text not null default 'member';
do $$ begin
  alter table public.members add constraint members_role check (role in ('owner', 'member'));
exception when duplicate_object then null; end $$;

-- Invitations. Each has a secret code that only the link the owner sends contains: whoever opens the link (and signs in)
-- can join, once, within 14 days. The email is just a label for the owner; joining never depends on it, so nobody can
-- take an invitation by signing up with someone else's email.
create table if not exists public.invites (
  code uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  email text,
  invited_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created timestamptz not null default now(),
  expires timestamptz not null default now() + interval '14 days'
);
create index if not exists invites_household on public.invites (household_id);

-- The household of whoever is signed in (null if they haven't started or joined one).
create or replace function public.my_household() returns uuid
language sql stable security definer set search_path = public as $$
  select household_id from public.members where user_id = auth.uid();
$$;

create or replace function public.is_owner() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.members where user_id = auth.uid() and role = 'owner');
$$;

-- Kept for anything still asking "is this login allowed in?": yes once it belongs to a household.
create or replace function public.is_member() returns boolean
language sql stable security definer set search_path = public as $$
  select public.my_household() is not null;
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- The family's data. Every row belongs to a household.
-- ---------------------------------------------------------------------------------------------------------------
create table if not exists public.transactions (
  id text not null,
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
  id text not null,
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
  amount numeric(12,2) not null
);

create table if not exists public.coverage (
  account text not null,
  from_date date not null,
  to_date date not null
);

create table if not exists public.settings (
  key text not null,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.reviews (
  id text not null,
  month text not null,
  title text not null,
  body text not null,
  author text,
  created timestamptz not null default now()
);

-- A database set up before households: put the family that's already here into a household of its own.
-- Its earliest login becomes the owner; the rest are members.
do $$
declare hid uuid; hname text;
begin
  if not exists (select 1 from public.households) and not exists (select 1 from public.members)
     and exists (select 1 from public.transactions union all select 1 from public.settings) then
    raise exception 'This database has data but no logins in the members table, so the app can''t tell whose it is. Add your login there first (the earlier setup script''s last step), then run this again. Nothing has been changed.';
  end if;
  if exists (select 1 from public.members where household_id is null) then
    select coalesce(nullif(value->>'household', ''), 'Our household') into hname from public.settings where key = 'settings';
    insert into public.households (name) values (coalesce(hname, 'Our household')) returning id into hid;
    update public.members set household_id = hid where household_id is null;
    update public.members set role = case when user_id = (select user_id from public.members where household_id = hid order by added, user_id limit 1) then 'owner' else 'member' end
      where household_id = hid;
  end if;
end $$;

-- Each data table gets its household, and its key includes the household (two households can both have a "groceries" budget).
do $$
declare
  t text; keys text; old_pk text; existing uuid;
  tables text[] := array['transactions', 'rules', 'budgets', 'coverage', 'settings', 'reviews'];
  pks text[] := array['household_id, id', 'household_id, id', 'household_id, category, from_month', 'household_id, account, from_date, to_date', 'household_id, key', 'household_id, id'];
begin
  -- Rows from before households belong to the one household there was.
  select id into existing from public.households order by created limit 1;
  for i in 1 .. array_length(tables, 1) loop
    t := tables[i]; keys := pks[i];
    execute format('alter table public.%I add column if not exists household_id uuid', t);
    if existing is not null then
      execute format('update public.%I set household_id = $1 where household_id is null', t) using existing;
    end if;
    execute format('alter table public.%I alter column household_id set default public.my_household()', t);
    execute format('alter table public.%I alter column household_id set not null', t);
    begin
      execute format('alter table public.%I add constraint %I foreign key (household_id) references public.households(id) on delete cascade', t, t || '_household');
    exception when duplicate_object then null; end;
    -- Swap the old key for one that starts with the household.
    select conname into old_pk from pg_constraint where conrelid = format('public.%I', t)::regclass and contype = 'p';
    if old_pk is null or pg_get_constraintdef((select oid from pg_constraint where conname = old_pk and conrelid = format('public.%I', t)::regclass)) not like 'PRIMARY KEY (household_id%' then
      if old_pk is not null then execute format('alter table public.%I drop constraint %I', t, old_pk); end if;
      execute format('alter table public.%I add primary key (%s)', t, keys);
    end if;
  end loop;
end $$;

alter table public.members alter column household_id set not null;
create index if not exists members_household on public.members (household_id);

-- ---------------------------------------------------------------------------------------------------------------
-- Who can see and change what: only your own household's rows.
-- ---------------------------------------------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['transactions','rules','budgets','coverage','settings','reviews'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "family only" on public.%I', t);
    execute format('drop policy if exists "household only" on public.%I', t);
    execute format('create policy "household only" on public.%I for all to authenticated using (household_id = public.my_household()) with check (household_id = public.my_household())', t);
  end loop;
end $$;

alter table public.households enable row level security;
drop policy if exists "your household" on public.households;
create policy "your household" on public.households for select to authenticated using (id = public.my_household());
drop policy if exists "owner renames" on public.households;
create policy "owner renames" on public.households for update to authenticated using (id = public.my_household() and public.is_owner()) with check (id = public.my_household());

alter table public.members enable row level security;
drop policy if exists "see yourself" on public.members;
drop policy if exists "your household's people" on public.members;
create policy "your household's people" on public.members for select to authenticated using (household_id = public.my_household() or user_id = auth.uid());

alter table public.invites enable row level security;
drop policy if exists "your household's invites" on public.invites;
create policy "your household's invites" on public.invites for select to authenticated using (household_id = public.my_household());
drop policy if exists "owner invites" on public.invites;
create policy "owner invites" on public.invites for insert to authenticated with check (household_id = public.my_household() and public.is_owner() and invited_by = auth.uid());
drop policy if exists "owner cancels invites" on public.invites;
create policy "owner cancels invites" on public.invites for delete to authenticated using (household_id = public.my_household() and public.is_owner());

-- Only plain columns can be changed directly: the plan is changed by the app's operators, never from the app.
revoke update on public.households from authenticated;
grant update (name) on public.households to authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- Starting, joining and leaving a household (these run with the rights to make the change, after checking who asks)
-- ---------------------------------------------------------------------------------------------------------------
create or replace function public.my_email() returns text
language sql stable security definer set search_path = public, auth as $$
  select lower(email) from auth.users where id = auth.uid();
$$;

-- Start a new household; you become its owner.
create or replace function public.create_household(p_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare hid uuid;
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  if public.my_household() is not null then raise exception 'You already belong to a household.'; end if;
  insert into public.households (name) values (coalesce(nullif(trim(p_name), ''), 'Our household')) returning id into hid;
  insert into public.members (user_id, household_id, email, role) values (auth.uid(), hid, public.my_email(), 'owner');
  return hid;
end $$;

-- What an invitation link is for: the household and who sent it (only for someone holding the code, signed in).
drop function if exists public.my_invite();
create or replace function public.invite_details(p_code uuid) returns table (household_name text, invited_by text)
language sql stable security definer set search_path = public as $$
  select h.name, m.email
  from public.invites i join public.households h on h.id = i.household_id left join public.members m on m.user_id = i.invited_by
  where auth.uid() is not null and i.code = p_code and i.expires > now() and m.household_id = i.household_id;
$$;

-- Join the household whose invitation link you opened. The code works once.
drop function if exists public.accept_invite();
create or replace function public.accept_invite(p_code uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare hid uuid;
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  if public.my_household() is not null then raise exception 'You already belong to a household.'; end if;
  delete from public.invites where code = p_code and expires > now() returning household_id into hid;
  if hid is null then raise exception 'This invitation has been used, cancelled or has expired. Ask for a new link.'; end if;
  insert into public.members (user_id, household_id, email, role) values (auth.uid(), hid, public.my_email(), 'member');
  return hid;
end $$;

-- Leave your household; everyone else keeps it. An owner leaving hands over to the longest-standing member. The last
-- person can't leave (that would strand the data): they delete the household instead, which asks for more care.
create or replace function public.leave_household() returns void
language plpgsql security definer set search_path = public as $$
declare hid uuid := public.my_household(); was_owner boolean := public.is_owner();
begin
  if hid is null then return; end if;
  -- One leave at a time per household, so two people leaving together can't both think the other stays.
  perform 1 from public.households where id = hid for update;
  if not exists (select 1 from public.members where household_id = hid and user_id <> auth.uid()) then
    raise exception 'You''re the only one in this household. To stop using it, delete the household instead.';
  end if;
  delete from public.members where user_id = auth.uid();
  delete from public.invites where invited_by = auth.uid();   -- links they sent stop working
  if was_owner then
    update public.members set role = 'owner' where user_id = (select user_id from public.members where household_id = hid order by added, user_id limit 1);
  end if;
end $$;

-- The owner removes someone from the household.
create or replace function public.remove_member(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_owner() then raise exception 'Only the household''s owner can remove people.'; end if;
  if p_user = auth.uid() then raise exception 'Use "Leave this household" to remove yourself.'; end if;
  delete from public.members where user_id = p_user and household_id = public.my_household();
  delete from public.invites where invited_by = p_user and household_id = public.my_household();
end $$;

-- The owner deletes the household and everything in it. Logins stay; they can start or join another household.
create or replace function public.delete_household() returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_owner() then raise exception 'Only the household''s owner can delete it.'; end if;
  delete from public.households where id = public.my_household();
end $$;

do $$
declare f text;
begin
  foreach f in array array['my_household()', 'is_owner()', 'is_member()', 'my_email()', 'create_household(text)', 'invite_details(uuid)', 'accept_invite(uuid)', 'leave_household()', 'remove_member(uuid)', 'delete_household()'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- A harmless "are you awake?" call. A weekly GitHub job calls it so the free project never goes to sleep.
create or replace function public.ping() returns text language sql stable as $$ select 'ok'::text $$;
grant execute on function public.ping() to anon, authenticated;

commit;

-- Shows each household and who is in it.
select h.name as household, m.email, m.role, m.added from public.members m join public.households h on h.id = m.household_id order by h.created, m.added;
