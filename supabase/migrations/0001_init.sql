-- Rougeau household budget: schema.
-- Nothing here is reachable with the public anon key. Every table has RLS on with no
-- policies, and the only way in is the `api` edge function, which checks the email + PIN
-- session and then uses the service key.

create extension if not exists pgcrypto with schema extensions;
create extension if not exists citext with schema extensions;

create table public.members (
  id uuid primary key default gen_random_uuid(),
  email extensions.citext not null unique,
  name text not null,
  color text not null,
  pin_hash text not null,
  must_change_pin boolean not null default true,
  session_version int not null default 1,
  failed_attempts int not null default 0,
  locked_until timestamptz,
  last_login_at timestamptz,
  feed_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table public.login_events (
  id bigint generated always as identity primary key,
  email text,
  ip text,
  ok boolean not null,
  at timestamptz not null default now()
);
create index login_events_ip_at on public.login_events (ip, at desc);

create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null check (kind in ('checking','savings','credit','loan','cash')),
  institution text,
  holder text,
  apr numeric(6,3),
  promo_end date,
  promo_apr numeric(6,3),
  plan_payment numeric(10,2),
  min_payment numeric(10,2),
  starting_balance numeric(12,2),
  sort int not null default 0,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);

-- A balance is what's in the account (cash) or what's owed on it (credit), always positive.
create table public.balances (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  amount numeric(12,2) not null,
  as_of date not null,
  created_by uuid references public.members(id),
  source text not null default 'manual' check (source in ('manual','statement','claude')),
  note text,
  created_at timestamptz not null default now()
);
create index balances_account on public.balances (account_id, as_of desc, created_at desc);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  grp text not null,
  kind text not null check (kind in ('bill','spending','debt','income','other','business')),
  monthly_plan numeric(10,2) not null default 0,
  due_day int check (due_day between 1 and 31),
  icon text,
  sort int not null default 0,
  archived boolean not null default false
);

-- created_by null = added by Claude (source says from where).
create table public.entries (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('expense','income','transfer','refund')),
  occurred_on date not null,
  amount numeric(12,2) not null check (amount > 0),
  title text not null check (length(title) between 1 and 140),
  category_id uuid references public.categories(id),
  account_id uuid references public.accounts(id),
  to_account_id uuid references public.accounts(id),
  one_time boolean not null default false,
  note text,
  created_by uuid references public.members(id),
  source text not null default 'manual' check (source in ('manual','statement','email','claude')),
  ext_ref text unique,
  verified boolean not null default false,
  verified_ref text,
  verified_at timestamptz,
  flagged boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.members(id),
  deleted_at timestamptz
);
create index entries_date on public.entries (occurred_on desc, created_at desc) where deleted_at is null;

-- author_id null = Claude.
create table public.comments (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.entries(id) on delete cascade,
  author_id uuid references public.members(id),
  body text not null check (length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index comments_entry on public.comments (entry_id, created_at);

-- Claude's monthly write-ups after matching statements.
create table public.checkins (
  id uuid primary key default gen_random_uuid(),
  period text not null,
  title text not null,
  body text not null,
  stats jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table public.settings (
  key text primary key,
  value jsonb not null
);

do $$
declare t text;
begin
  foreach t in array array['members','login_events','accounts','balances','categories','entries','comments','checkins','settings'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;

-- PIN check with lockout. 5 misses locks the email for 15 minutes; every 5 more doubles it
-- (capped at a day). 20 misses from one IP in 15 minutes blocks that IP for 15 minutes.
create or replace function public.pin_login(p_email text, p_pin text, p_ip text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  m public.members;
  ip_misses int;
  n int;
  lock_for interval;
begin
  select count(*) into ip_misses from public.login_events
    where ip = p_ip and not ok and at > now() - interval '15 minutes';
  if ip_misses >= 20 then
    return jsonb_build_object('ok', false, 'error', 'too_many', 'retry_after', 900);
  end if;

  select * into m from public.members where email = p_email::citext for update;
  if not found then
    perform extensions.crypt(p_pin, extensions.gen_salt('bf', 10));
    insert into public.login_events (email, ip, ok) values (p_email, p_ip, false);
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;

  if m.locked_until is not null and m.locked_until > now() then
    insert into public.login_events (email, ip, ok) values (p_email, p_ip, false);
    return jsonb_build_object('ok', false, 'error', 'locked',
      'retry_after', ceil(extract(epoch from m.locked_until - now()))::int);
  end if;

  if m.pin_hash = extensions.crypt(p_pin, m.pin_hash) then
    update public.members set failed_attempts = 0, locked_until = null, last_login_at = now()
      where id = m.id;
    insert into public.login_events (email, ip, ok) values (p_email, p_ip, true);
    return jsonb_build_object('ok', true, 'member_id', m.id,
      'session_version', m.session_version, 'must_change_pin', m.must_change_pin);
  end if;

  n := m.failed_attempts + 1;
  lock_for := case when n >= 5
    then least(interval '15 minutes' * power(2, floor(n / 5.0) - 1), interval '24 hours')
    else null end;
  update public.members
    set failed_attempts = n,
        locked_until = case when lock_for is null then null else now() + lock_for end
    where id = m.id;
  insert into public.login_events (email, ip, ok) values (p_email, p_ip, false);
  if lock_for is not null then
    return jsonb_build_object('ok', false, 'error', 'locked',
      'retry_after', extract(epoch from lock_for)::int);
  end if;
  return jsonb_build_object('ok', false, 'error', 'invalid', 'tries_left', 5 - n);
end $$;

-- Sets a new PIN and signs out every other device (session_version bump).
create or replace function public.set_pin(p_member uuid, p_pin text, p_temp boolean default false)
returns int
language plpgsql
security definer
set search_path = public, extensions
as $$
declare v int;
begin
  if p_pin !~ '^[0-9]{6}$' then raise exception 'PIN must be 6 digits'; end if;
  update public.members
    set pin_hash = extensions.crypt(p_pin, extensions.gen_salt('bf', 10)),
        must_change_pin = p_temp,
        session_version = session_version + 1,
        failed_attempts = 0,
        locked_until = null
    where id = p_member
    returning session_version into v;
  return v;
end $$;

revoke all on function public.pin_login(text, text, text) from public, anon, authenticated;
revoke all on function public.set_pin(uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.pin_login(text, text, text) to service_role;
grant execute on function public.set_pin(uuid, text, boolean) to service_role;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
