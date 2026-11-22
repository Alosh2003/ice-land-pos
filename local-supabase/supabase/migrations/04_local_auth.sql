-- ICE LAND local backend — migration 04: fully local authentication
-- Replaces Supabase Auth (auth.users + Google OAuth) with local app_users.
-- Admin creates accounts and assigns roles. No external network for auth.

-- Drop the Supabase-Auth trigger that auto-created profiles on auth.users insert
drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user();

-- Local users table — admin creates and manages all accounts
create table if not exists public.app_users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  password_hash text not null,
  full_name text not null default '',
  role public.app_role not null default 'cashier',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Single-row session table — holds the currently signed-in user id
create table if not exists public.app_session (
  id int primary key default 1 check (id = 1),
  user_id uuid references public.app_users(id),
  updated_at timestamptz not null default now()
);
insert into public.app_session (id, user_id) values (1, null) on conflict do nothing;

-- Seed default admin (email: admin@iceland.local, password: Admin123!)
-- Password meets new strength requirements: 10 chars, uppercase, digits.
insert into public.app_users (id, email, password_hash, full_name, role, active, created_at, updated_at)
values (
  '00000000-0000-0000-0000-000000000001',
  'admin@iceland.local',
  crypt('Admin123!', gen_salt('bf')),
  'Administrator',
  'admin',
  true,
  now(),
  now()
) on conflict (email) do nothing;

-- Point app_session at the default admin so the system is usable immediately
update public.app_session set user_id = '00000000-0000-0000-0000-000000000001', updated_at = now() where id = 1;

-- Repoint profiles FK from auth.users to app_users
alter table public.profiles drop constraint if exists profiles_id_fkey;
alter table public.profiles add constraint profiles_id_fkey
  foreign key (id) references public.app_users(id) on delete cascade;

-- Repoint user_roles FK from auth.users to app_users
alter table public.user_roles drop constraint if exists user_roles_user_id_fkey;
alter table public.user_roles add constraint user_roles_user_id_fkey
  foreign key (user_id) references public.app_users(id) on delete cascade;

-- Redefine auth.uid() to read from local session (no Supabase Auth)
create or replace function auth.uid() returns uuid
language sql stable as $$
  select (select user_id from public.app_session where id = 1)
$$;

-- Grants
grant select on public.app_users to authenticated;
grant all on public.app_users to service_role;
grant select, update on public.app_session to authenticated;
grant all on public.app_session to service_role;

-- RLS on app_users
alter table public.app_users enable row level security;
create policy "app_users self or staff read" on public.app_users for select to authenticated
  using (id = auth.uid() or public.is_staff(auth.uid()));
create policy "app_users admin all" on public.app_users for all to authenticated
  using (public.has_role(auth.uid(),'admin'))
  with check (public.has_role(auth.uid(),'admin'));

-- RLS on app_session (only staff can see who is signed in)
alter table public.app_session enable row level security;
create policy "app_session staff read" on public.app_session for select to authenticated
  using (public.is_staff(auth.uid()));
create policy "app_session staff update" on public.app_session for update to authenticated
  using (public.is_staff(auth.uid()))
  with check (public.is_staff(auth.uid()));

-- ---- RPCs for local auth ----

-- Verify credentials and sign in. Security definer so it can read password_hash despite RLS.
create or replace function public.authenticate_user(p_email text, p_password text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user record;
begin
  select * into v_user from public.app_users where email = p_email and active;
  if not found then raise exception 'invalid_credentials'; end if;

  if crypt(p_password, v_user.password_hash) <> v_user.password_hash then
    raise exception 'invalid_credentials';
  end if;

  update public.app_session set user_id = v_user.id, updated_at = now() where id = 1;

  return jsonb_build_object(
    'id', v_user.id,
    'email', v_user.email,
    'full_name', v_user.full_name,
    'role', v_user.role,
    'active', v_user.active
  );
end
$$;

revoke all on function public.authenticate_user(text, text) from public, anon;
grant execute on function public.authenticate_user(text, text) to authenticated;

-- Return the currently signed-in user's profile
create or replace function public.whoami() returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', au.id,
    'email', au.email,
    'full_name', au.full_name,
    'role', au.role,
    'active', au.active
  )
  from public.app_users au
  where au.id = auth.uid();
$$;

revoke all on function public.whoami() from public, anon;
grant execute on function public.whoami() to authenticated;

-- Sign out — clear the session
create or replace function public.sign_out() returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.app_session set user_id = null, updated_at = now() where id = 1;
end
$$;

revoke all on function public.sign_out() from public, anon;
grant execute on function public.sign_out() to authenticated;
