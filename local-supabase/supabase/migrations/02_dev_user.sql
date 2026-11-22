-- ICE LAND local backend — dev user seed
-- Creates a local dev user with admin role so auth.uid() based checks work.
-- This UUID matches the fallback in auth.uid().

insert into auth.users (id, email, encrypted_password, raw_user_meta_data, email_confirmed_at, created_at, updated_at)
values (
  '00000000-0000-0000-0000-000000000001',
  'dev@iceland.local',
  'dev',
  '{"full_name": "Dev User"}',
  now(),
  now(),
  now()
) on conflict (id) do nothing;

insert into public.profiles (id, full_name, email, active, created_at)
values (
  '00000000-0000-0000-0000-000000000001',
  'Dev User',
  'dev@iceland.local',
  true,
  now()
) on conflict (id) do nothing;

insert into public.user_roles (user_id, role)
values (
  '00000000-0000-0000-0000-000000000001',
  'admin'
) on conflict (user_id, role) do nothing;
