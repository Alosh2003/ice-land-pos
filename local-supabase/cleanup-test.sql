-- Delete test customer data in FK-safe order
DELETE FROM public.customer_payment_allocations
WHERE payment_id IN (SELECT id FROM public.customer_payments WHERE customer_id='4d02a224-d80d-48e0-b9b7-a84604399395');
DELETE FROM public.customer_ledger WHERE customer_id='4d02a224-d80d-48e0-b9b7-a84604399395';
DELETE FROM public.customer_payments WHERE customer_id='4d02a224-d80d-48e0-b9b7-a84604399395';
DELETE FROM public.payments WHERE sale_id='b5cdfdd7-4aee-4121-98bd-05284a7ac0a8';
DELETE FROM public.sale_items WHERE sale_id='b5cdfdd7-4aee-4121-98bd-05284a7ac0a8';
DELETE FROM public.sales WHERE invoice_no='IL-000005';
DELETE FROM public.customers WHERE id='4d02a224-d80d-48e0-b9b7-a84604399395';
SELECT 'cleaned' AS status;
