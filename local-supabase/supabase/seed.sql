-- ICE LAND local backend — seed.sql
-- Runs after migrations on `supabase start` / `supabase db reset`.
-- Creates the storage buckets referenced by the RLS policies.

-- Buckets must exist before policies that reference bucket_id can work.
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('product-images', 'product-images', false, 52428800, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('payment-proofs', 'payment-proofs', false, 52428800, array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do nothing;
