-- Update DDL default for payment_methods (settings row data already has deferred from migration 0005)
ALTER TABLE public.settings
  ALTER COLUMN payment_methods SET DEFAULT '[{"code":"cash","ar":"نقدي","en":"Cash","active":true},{"code":"deferred","ar":"آجل","en":"Deferred / On account","active":true},{"code":"transfer","ar":"تحويل","en":"Transfer","active":true}]';
SELECT m->>'code' as code, m->>'active' as active, m->>'en' as en FROM jsonb_array_elements(payment_methods) m ORDER BY ordinality;
