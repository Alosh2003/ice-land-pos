-- ICE LAND local backend — migration 0007: remove legacy functions
-- Drops: complete_sale (legacy), refund_sale (legacy)
-- Note: complete_counter_sale v2 is the only active sale function — keep it.

-- Drop legacy complete_sale (replaced by complete_counter_sale)
DROP FUNCTION IF EXISTS public.complete_sale(uuid, jsonb, jsonb, numeric, text, uuid);

-- Drop legacy refund_sale (replaced by reverse_counter_sale)
DROP FUNCTION IF EXISTS public.refund_sale(uuid, text, text);

-- Verify remaining functions
SELECT proname, pg_get_function_identity_arguments(oid)
FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN ('complete_sale','refund_sale','complete_counter_sale')
ORDER BY proname;
