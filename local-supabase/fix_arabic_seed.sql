-- Repairs Arabic text that was inserted with a non-UTF-8 client (shown as "????????").
-- Apply from inside the database container so the file is read as UTF-8:
--   docker cp local-supabase/fix_arabic_seed.sql ice-land-db:/tmp/fix_arabic_seed.sql
--   docker exec ice-land-db psql -U ice_land -d ice_land -v ON_ERROR_STOP=1 -f /tmp/fix_arabic_seed.sql
-- Safe to re-run: every statement is an idempotent UPDATE keyed on a stable unique column.

BEGIN;

UPDATE public.categories SET name_ar = v.ar
FROM (VALUES
  ('Ice Cream', 'آيس كريم'),
  ('Special Flavors', 'نكهات خاصة'),
  ('Milkshakes', 'ميلك شيك'),
  ('Sour Milkshakes', 'حامض الميلك شيك')
) AS v(en, ar)
WHERE categories.name_en = v.en;

UPDATE public.products SET name_ar = v.ar
FROM (VALUES
  ('IC-01', 'تفاح'), ('IC-02', 'توت'), ('IC-03', 'مانجو'), ('IC-04', 'كرز'),
  ('IC-05', 'فراولة'), ('IC-06', 'جلكسي'),
  ('SP-01', 'دبي'), ('SP-02', 'أوريو'), ('SP-03', 'لوتس'), ('SP-04', 'توفي'),
  ('SP-05', 'كندر'), ('SP-06', 'كرميل'), ('SP-07', 'حامض كيوي'), ('SP-08', 'حامض كرز بري'),
  ('SP-09', 'فانيليا'), ('SP-10', 'عنب'), ('SP-11', 'تشيز كيك كرز'), ('SP-12', 'تشيز كيك لوتس'),
  ('SP-13', 'بستاشيو'), ('SP-14', 'كوفي'), ('SP-15', 'تشيز كيك فراولة'), ('SP-16', 'تشيز كيك توت'),
  ('SP-17', 'كوكيز'), ('SP-18', 'سنيكرز'), ('SP-19', 'إيطالي'),
  ('MS-01', 'تشيز كيك توت'), ('MS-02', 'تشيز كيك فراولة'), ('MS-03', 'كوفي'),
  ('MS-04', 'بستاشيو'), ('MS-05', 'سنيكرز'), ('MS-06', 'جلكسي'), ('MS-07', 'مانجو'),
  ('MS-08', 'توفي'), ('MS-09', 'لوتس'), ('MS-10', 'كوكيز'), ('MS-11', 'إيطالي'),
  ('SM-01', 'توت'), ('SM-02', 'كرز'), ('SM-03', 'تفاح')
) AS v(sku, ar)
WHERE products.sku = v.sku;

UPDATE public.settings
SET currency_symbol_ar = 'ريال',
    payment_methods = '[
      {"code":"cash","ar":"نقدي","en":"Cash","active":true},
      {"code":"deferred","ar":"آجل","en":"Deferred / On account","active":true},
      {"code":"transfer","ar":"تحويل","en":"Transfer","active":true}
    ]'::jsonb
WHERE id = 1;

COMMIT;
