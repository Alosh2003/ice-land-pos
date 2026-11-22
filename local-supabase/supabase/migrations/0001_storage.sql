-- ICE LAND local backend — migration 0001: storage policies for product-images
-- Ported from Lovable migration 0001_migration.sql

create policy "staff read product images" on storage.objects for select to authenticated using (bucket_id='product-images' and public.is_staff(auth.uid()));
create policy "managers upload product images" on storage.objects for insert to authenticated with check (bucket_id='product-images' and public.has_any_role(auth.uid(), array['admin','manager']::app_role[]));
