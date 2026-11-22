-- Test 1: should FAIL because customer has outstanding balance
UPDATE public.settings SET payment_methods = jsonb_set(payment_methods, '{1}', '{"code":"deferred","ar":"آجل","en":"Deferred / On account","active":false}', true) WHERE id=1;
SELECT c.name, cb.balance FROM public.customer_balances cb JOIN public.customers c ON c.id = cb.customer_id;
