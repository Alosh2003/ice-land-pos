create or replace function auth.uid() returns uuid
language sql stable as $$
  select coalesce(nullif(current_setting('app.current_user_id', true), '')::uuid, '00000000-0000-0000-0000-000000000001'::uuid)
$$;
