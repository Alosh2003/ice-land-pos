-- ICE LAND local backend — migration 0003: complete_counter_sale variable fix
-- Ported from Lovable migration 0003_qualify_counter_payment_variable.sql

DO $fix$ DECLARE definition text; BEGIN SELECT pg_get_functiondef('public.complete_counter_sale(uuid,jsonb,jsonb,numeric,text,text,text,text)'::regprocedure) INTO definition; definition := replace(definition, 'AS $function$', E'AS $function$\n#variable_conflict use_variable'); EXECUTE definition; END $fix$;
