-- ICE LAND local backend — migration 0004: customer credit accounts
-- Ported from Lovable migration 0004_customer_credit_accounts.sql

ALTER TABLE public.customers
  ADD COLUMN phone2 text, ADD COLUMN address text, ADD COLUMN notes text,
  ADD COLUMN credit_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN credit_limit numeric NOT NULL DEFAULT 0 CHECK (credit_limit >= 0),
  ADD COLUMN payment_terms_days integer NOT NULL DEFAULT 30 CHECK (payment_terms_days BETWEEN 0 AND 365),
  ADD COLUMN opening_balance numeric NOT NULL DEFAULT 0,
  ADD COLUMN active boolean NOT NULL DEFAULT true,
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
GRANT SELECT, INSERT, UPDATE ON public.customers TO authenticated;
GRANT ALL ON public.customers TO service_role;
DROP POLICY IF EXISTS "cust insert" ON public.customers;
CREATE POLICY "cust insert" ON public.customers FOR INSERT TO authenticated WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','manager']::app_role[]));
CREATE POLICY "cust update" ON public.customers FOR UPDATE TO authenticated USING (public.has_any_role(auth.uid(), ARRAY['admin','manager']::app_role[]));

ALTER TABLE public.sales ADD COLUMN due_date date, ADD COLUMN amount_due numeric NOT NULL DEFAULT 0, ADD COLUMN amount_settled numeric NOT NULL DEFAULT 0;

CREATE TABLE public.customer_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_no text NOT NULL UNIQUE,
  idempotency_key uuid NOT NULL UNIQUE,
  customer_id uuid NOT NULL REFERENCES public.customers(id),
  amount numeric NOT NULL CHECK (amount > 0),
  method text NOT NULL,
  reference text, proof_path text, notes text,
  paid_on date NOT NULL,
  cashier_id uuid NOT NULL, cashier_name text,
  reversed_at timestamptz, reversed_by uuid, reverse_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.customer_payment_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL REFERENCES public.customer_payments(id),
  sale_id uuid NOT NULL REFERENCES public.sales(id),
  amount numeric NOT NULL CHECK (amount > 0)
);
CREATE TABLE public.customer_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id),
  kind text NOT NULL CHECK (kind IN ('opening','sale','payment','refund','payment_reversal')),
  amount numeric NOT NULL,
  sale_id uuid REFERENCES public.sales(id),
  payment_id uuid REFERENCES public.customer_payments(id),
  entry_date date NOT NULL,
  user_id uuid, note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.customer_ledger(customer_id, entry_date);
CREATE INDEX ON public.sales(customer_id);
CREATE SEQUENCE IF NOT EXISTS public.collection_seq;
GRANT SELECT ON public.customer_payments, public.customer_payment_allocations, public.customer_ledger TO authenticated;
GRANT ALL ON public.customer_payments, public.customer_payment_allocations, public.customer_ledger TO service_role;
ALTER TABLE public.customer_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_payment_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cpay read" ON public.customer_payments FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "calloc read" ON public.customer_payment_allocations FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "cledger read" ON public.customer_ledger FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));

CREATE VIEW public.customer_balances WITH (security_invoker = true) AS
SELECT c.id AS customer_id, coalesce(sum(l.amount),0) AS balance,
  (SELECT min(s.due_date) FROM public.sales s WHERE s.customer_id=c.id AND s.status='completed' AND s.amount_due>s.amount_settled) AS oldest_due
FROM public.customers c LEFT JOIN public.customer_ledger l ON l.customer_id=c.id GROUP BY c.id;
GRANT SELECT ON public.customer_balances TO authenticated;

CREATE OR REPLACE FUNCTION public.customer_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF tg_op='INSERT' THEN
    IF NEW.opening_balance<>0 THEN
      INSERT INTO public.customer_ledger(customer_id,kind,amount,entry_date,user_id,note) VALUES(NEW.id,'opening',NEW.opening_balance,public.business_today(),auth.uid(),'opening balance');
    END IF;
    INSERT INTO public.audit_logs(user_id,action,entity,entity_id,details) VALUES(auth.uid(),'create','customer',NEW.id::text,jsonb_build_object('name',NEW.name,'credit_limit',NEW.credit_limit));
  ELSE
    NEW.opening_balance := OLD.opening_balance; NEW.updated_at := now();
    INSERT INTO public.audit_logs(user_id,action,entity,entity_id,details) VALUES(auth.uid(),'update','customer',NEW.id::text,jsonb_build_object('old_limit',OLD.credit_limit,'new_limit',NEW.credit_limit,'credit_enabled',NEW.credit_enabled,'active',NEW.active));
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER customer_guard_upd BEFORE UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION public.customer_guard();
CREATE TRIGGER customer_guard_ins AFTER INSERT ON public.customers FOR EACH ROW EXECUTE FUNCTION public.customer_guard();

DROP FUNCTION public.complete_counter_sale(uuid,jsonb,jsonb,numeric,text,text,text,text);
CREATE FUNCTION public.complete_counter_sale(p_idempotency_key uuid, p_items jsonb, p_payments jsonb, p_order_discount numeric DEFAULT 0, p_notes text DEFAULT ''::text, p_order_type text DEFAULT 'dine_in'::text, p_delivery_address text DEFAULT ''::text, p_customer_phone text DEFAULT ''::text, p_customer_id uuid DEFAULT NULL, p_credit_override_reason text DEFAULT '')
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
#variable_conflict use_variable
DECLARE uid uuid:=auth.uid(); st record; prod record; it jsonb; pay jsonb; sid uuid:=gen_random_uuid(); inv text; sub numeric:=0; tx numeric:=0; tot numeric; paid numeric:=0; cash numeric:=0; ch numeric; fee numeric:=0; qty numeric; price numeric; disc numeric; amt numeric; pname text; existing record; deferred numeric:=0; cust record; bal numeric; BEGIN
IF NOT public.has_any_role(uid,ARRAY['admin','manager','cashier']::app_role[]) THEN RAISE EXCEPTION 'not_authorized'; END IF;
PERFORM pg_advisory_xact_lock(hashtextextended(p_idempotency_key::text,0));
SELECT * INTO existing FROM public.sales WHERE idempotency_key=p_idempotency_key;
IF FOUND THEN IF existing.cashier_id<>uid THEN RAISE EXCEPTION 'not_authorized'; END IF; RETURN jsonb_build_object('sale_id',existing.id,'invoice_no',existing.invoice_no); END IF;
IF p_order_type IS NULL OR p_order_type NOT IN ('dine_in','takeaway','delivery') THEN RAISE EXCEPTION 'invalid_order_type'; END IF;
IF jsonb_typeof(p_items)<>'array' OR coalesce(jsonb_array_length(p_items),0)=0 THEN RAISE EXCEPTION 'empty_cart'; END IF;
IF p_order_discount IS NULL OR p_order_discount::text IN ('NaN','Infinity','-Infinity') OR p_order_discount<0 THEN RAISE EXCEPTION 'invalid_discount'; END IF;
SELECT * INTO st FROM public.settings WHERE id=1;
IF p_customer_id IS NOT NULL THEN
  SELECT * INTO cust FROM public.customers WHERE id=p_customer_id FOR UPDATE;
  IF NOT FOUND OR NOT cust.active THEN RAISE EXCEPTION 'customer_unavailable'; END IF;
END IF;
IF p_order_type='delivery' THEN
IF NOT st.delivery_enabled THEN RAISE EXCEPTION 'delivery_disabled'; END IF;
IF trim(coalesce(p_delivery_address,''))='' OR trim(coalesce(p_customer_phone,''))='' THEN RAISE EXCEPTION 'delivery_details_required'; END IF; fee:=st.delivery_fee; END IF;
SELECT coalesce(nullif(full_name,''),email,'') INTO pname FROM public.profiles WHERE id=uid;
inv:='IL-'||lpad(nextval('public.invoice_seq')::text,6,'0');
INSERT INTO public.sales(id,invoice_no,idempotency_key,cashier_id,cashier_name,subtotal,total,paid,notes,order_type,delivery_fee,delivery_address,customer_phone,customer_id) VALUES(sid,inv,p_idempotency_key,uid,pname,0,0,0,left(p_notes,300),p_order_type,fee,CASE WHEN p_order_type='delivery' THEN left(p_delivery_address,500) END,left(p_customer_phone,50),p_customer_id);
PERFORM set_config('app.stock_kind','sale',true); PERFORM set_config('app.stock_sale',sid::text,true);
FOR it IN SELECT value FROM jsonb_array_elements(p_items) ORDER BY value->>'product_id' LOOP
SELECT * INTO prod FROM public.products WHERE id=(it->>'product_id')::uuid AND active AND deleted_at IS NULL FOR UPDATE;
IF NOT FOUND THEN RAISE EXCEPTION 'product_unavailable'; END IF;
qty:=(it->>'qty')::numeric; price:=coalesce((it->>'unit_price')::numeric,prod.price); disc:=coalesce((it->>'discount')::numeric,0);
IF qty IS NULL OR qty::text IN ('NaN','Infinity','-Infinity') OR qty<=0 THEN RAISE EXCEPTION 'invalid_qty'; END IF;
IF price::text IN ('NaN','Infinity','-Infinity') OR price<0 THEN RAISE EXCEPTION 'invalid_price'; END IF;
IF price<>prod.price AND NOT public.has_any_role(uid,ARRAY['admin','manager']::app_role[]) THEN RAISE EXCEPTION 'price_edit_not_allowed'; END IF;
IF disc::text IN ('NaN','Infinity','-Infinity') OR disc<0 OR disc>price*qty THEN RAISE EXCEPTION 'invalid_discount'; END IF;
amt:=round(price*qty-disc,2); sub:=sub+amt;
IF prod.track_stock THEN IF prod.stock_qty<qty THEN RAISE EXCEPTION 'insufficient_stock'; END IF; UPDATE public.products SET stock_qty=stock_qty-qty WHERE id=prod.id; END IF;
INSERT INTO public.sale_items(sale_id,product_id,name_ar,name_en,category_id,qty,unit_price,list_price,unit_cost,discount,line_total,image_url,stock_deducted) VALUES(sid,prod.id,prod.name_ar,prod.name_en,prod.category_id,qty,price,prod.price,prod.cost,disc,amt,prod.image_url,CASE WHEN prod.track_stock THEN qty ELSE 0 END);
END LOOP;
IF p_order_discount>sub THEN RAISE EXCEPTION 'invalid_discount'; END IF;
IF st.tax_enabled THEN tx:=round((sub-p_order_discount+CASE WHEN st.delivery_taxable THEN fee ELSE 0 END)*st.tax_rate/100,2); END IF;
tot:=sub-p_order_discount+tx+fee;
IF jsonb_typeof(p_payments)<>'array' OR coalesce(jsonb_array_length(p_payments),0)=0 THEN RAISE EXCEPTION 'invalid_payment'; END IF;
FOR pay IN SELECT * FROM jsonb_array_elements(p_payments) LOOP
amt:=(pay->>'amount')::numeric;
IF amt IS NULL OR amt::text IN ('NaN','Infinity','-Infinity') OR amt<=0 THEN RAISE EXCEPTION 'invalid_payment'; END IF;
IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(st.payment_methods) m WHERE m->>'code'=pay->>'method' AND (m->>'active')::boolean) THEN RAISE EXCEPTION 'invalid_payment_method'; END IF;
IF nullif(pay->>'proof_path','') IS NOT NULL AND (split_part(pay->>'proof_path','/',1)<>uid::text OR NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='payment-proofs' AND name=pay->>'proof_path')) THEN RAISE EXCEPTION 'invalid_proof'; END IF;
paid:=paid+amt; IF pay->>'method'='cash' THEN cash:=cash+amt; END IF; IF pay->>'method'='deferred' THEN deferred:=deferred+amt; END IF; END LOOP;
IF paid<tot THEN RAISE EXCEPTION 'insufficient_payment'; END IF; ch:=paid-tot; IF ch>cash THEN RAISE EXCEPTION 'change_exceeds_cash'; END IF;
IF deferred>0 THEN
  IF p_customer_id IS NULL THEN RAISE EXCEPTION 'customer_required'; END IF;
  IF deferred>tot THEN RAISE EXCEPTION 'invalid_payment'; END IF;
  IF NOT cust.credit_enabled THEN RAISE EXCEPTION 'credit_disabled'; END IF;
  SELECT coalesce(sum(amount),0) INTO bal FROM public.customer_ledger WHERE customer_id=p_customer_id;
  IF bal+deferred>cust.credit_limit THEN
    IF public.has_any_role(uid,ARRAY['admin','manager']::app_role[]) AND trim(coalesce(p_credit_override_reason,''))<>'' THEN
      INSERT INTO public.audit_logs(user_id,action,entity,entity_id,details) VALUES(uid,'credit_override','sale',sid::text,jsonb_build_object('customer',cust.name,'limit',cust.credit_limit,'balance',bal,'amount',deferred,'reason',p_credit_override_reason));
    ELSE RAISE EXCEPTION 'credit_limit_exceeded'; END IF;
  END IF;
  INSERT INTO public.customer_ledger(customer_id,kind,amount,sale_id,entry_date,user_id,note) VALUES(p_customer_id,'sale',deferred,sid,public.business_today(),uid,inv);
END IF;
FOR pay IN SELECT * FROM jsonb_array_elements(p_payments) LOOP
INSERT INTO public.payments(sale_id,method,amount,reference,proof_path) VALUES(sid,pay->>'method',CASE WHEN pay->>'method'='cash' AND cash>0 THEN (pay->>'amount')::numeric-ch*((pay->>'amount')::numeric/cash) ELSE (pay->>'amount')::numeric END,left(nullif(trim(pay->>'reference'),''),150),nullif(pay->>'proof_path','')); END LOOP;
UPDATE public.sales SET subtotal=sub,discount=p_order_discount,tax=tx,total=tot,paid=paid,change_due=ch,amount_due=deferred,due_date=CASE WHEN deferred>0 THEN public.business_today()+cust.payment_terms_days END WHERE id=sid;
INSERT INTO public.audit_logs(user_id,action,entity,entity_id,details) VALUES(uid,'create','sale',sid::text,jsonb_build_object('invoice',inv,'total',tot,'order_type',p_order_type,'deferred',deferred));
RETURN jsonb_build_object('sale_id',sid,'invoice_no',inv); END $function$;
REVOKE ALL ON FUNCTION public.complete_counter_sale(uuid,jsonb,jsonb,numeric,text,text,text,text,uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_counter_sale(uuid,jsonb,jsonb,numeric,text,text,text,text,uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.reverse_counter_sale(p_sale_id uuid, p_reason text, p_status text DEFAULT 'refunded'::text, p_restock boolean DEFAULT false)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$ DECLARE s record; i record; BEGIN
IF NOT public.has_any_role(auth.uid(),ARRAY['admin','manager']::app_role[]) THEN RAISE EXCEPTION 'not_authorized'; END IF;
IF p_status NOT IN ('refunded','cancelled') OR p_status IS NULL THEN RAISE EXCEPTION 'invalid_status'; END IF;
IF trim(coalesce(p_reason,''))='' THEN RAISE EXCEPTION 'reason_required'; END IF;
SELECT * INTO s FROM public.sales WHERE id=p_sale_id FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF; IF s.status<>'completed' THEN RAISE EXCEPTION 'already_reversed'; END IF;
PERFORM set_config('app.stock_sale',s.id::text,true); PERFORM set_config('app.stock_kind','return',true); PERFORM set_config('app.stock_reason',p_reason,true);
IF p_restock THEN FOR i IN SELECT * FROM public.sale_items WHERE sale_id=s.id AND stock_deducted>0 ORDER BY product_id LOOP UPDATE public.products SET stock_qty=stock_qty+i.stock_deducted WHERE id=i.product_id; END LOOP; END IF;
IF s.amount_due>0 AND s.customer_id IS NOT NULL THEN
  INSERT INTO public.customer_ledger(customer_id,kind,amount,sale_id,entry_date,user_id,note) VALUES(s.customer_id,'refund',-s.amount_due,s.id,public.business_today(),auth.uid(),left(p_reason,200));
END IF;
UPDATE public.sales SET status=p_status,refund_reason=p_reason,refunded_by=auth.uid(),refunded_at=now() WHERE id=s.id;
INSERT INTO public.audit_logs(user_id,action,entity,entity_id,details) VALUES(auth.uid(),p_status,'sale',s.id::text,jsonb_build_object('reason',p_reason,'restocked',p_restock,'credit_reversed',s.amount_due));
END $function$;

CREATE FUNCTION public.receive_customer_payment(p_idempotency_key uuid, p_customer_id uuid, p_amount numeric, p_method text, p_reference text DEFAULT '', p_proof_path text DEFAULT '', p_notes text DEFAULT '', p_sale_ids uuid[] DEFAULT NULL)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE uid uuid:=auth.uid(); c record; st record; pid uuid:=gen_random_uuid(); rno text; left_amt numeric; s record; take numeric; ex record; pname text; BEGIN
IF NOT public.has_any_role(uid,ARRAY['admin','manager','cashier']::app_role[]) THEN RAISE EXCEPTION 'not_authorized'; END IF;
PERFORM pg_advisory_xact_lock(hashtextextended(p_idempotency_key::text,0));
SELECT * INTO ex FROM public.customer_payments WHERE idempotency_key=p_idempotency_key;
IF FOUND THEN RETURN jsonb_build_object('payment_id',ex.id,'receipt_no',ex.receipt_no); END IF;
IF p_amount IS NULL OR p_amount::text IN ('NaN','Infinity','-Infinity') OR p_amount<=0 THEN RAISE EXCEPTION 'invalid_payment'; END IF;
IF p_method='deferred' THEN RAISE EXCEPTION 'invalid_payment_method'; END IF;
SELECT * INTO st FROM public.settings WHERE id=1;
IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(st.payment_methods) m WHERE m->>'code'=p_method AND (m->>'active')::boolean) THEN RAISE EXCEPTION 'invalid_payment_method'; END IF;
IF nullif(p_proof_path,'') IS NOT NULL AND (split_part(p_proof_path,'/',1)<>uid::text OR NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='payment-proofs' AND name=p_proof_path)) THEN RAISE EXCEPTION 'invalid_proof'; END IF;
SELECT * INTO c FROM public.customers WHERE id=p_customer_id FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
SELECT coalesce(nullif(full_name,''),email,'') INTO pname FROM public.profiles WHERE id=uid;
rno:='RC-'||lpad(nextval('public.collection_seq')::text,6,'0');
INSERT INTO public.customer_payments(id,receipt_no,idempotency_key,customer_id,amount,method,reference,proof_path,notes,paid_on,cashier_id,cashier_name) VALUES(pid,rno,p_idempotency_key,c.id,p_amount,p_method,left(nullif(trim(p_reference),''),150),nullif(p_proof_path,''),left(nullif(trim(p_notes),''),300),public.business_today(),uid,pname);
INSERT INTO public.customer_ledger(customer_id,kind,amount,payment_id,entry_date,user_id,note) VALUES(c.id,'payment',-p_amount,pid,public.business_today(),uid,rno);
left_amt:=p_amount;
FOR s IN SELECT * FROM public.sales WHERE customer_id=c.id AND status='completed' AND amount_due>amount_settled AND (p_sale_ids IS NULL OR id=ANY(p_sale_ids)) ORDER BY created_at FOR UPDATE LOOP
  EXIT WHEN left_amt<=0;
  take:=least(left_amt,s.amount_due-s.amount_settled);
  INSERT INTO public.customer_payment_allocations(payment_id,sale_id,amount) VALUES(pid,s.id,take);
  UPDATE public.sales SET amount_settled=amount_settled+take WHERE id=s.id;
  left_amt:=left_amt-take;
END LOOP;
INSERT INTO public.audit_logs(user_id,action,entity,entity_id,details) VALUES(uid,'create','customer_payment',pid::text,jsonb_build_object('receipt',rno,'customer',c.name,'amount',p_amount,'unallocated',left_amt));
RETURN jsonb_build_object('payment_id',pid,'receipt_no',rno);
END $function$;

CREATE FUNCTION public.reverse_customer_payment(p_payment_id uuid, p_reason text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$ DECLARE p record; a record; BEGIN
IF NOT public.has_any_role(auth.uid(),ARRAY['admin','manager']::app_role[]) THEN RAISE EXCEPTION 'not_authorized'; END IF;
IF trim(coalesce(p_reason,''))='' THEN RAISE EXCEPTION 'reason_required'; END IF;
SELECT * INTO p FROM public.customer_payments WHERE id=p_payment_id FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
IF p.reversed_at IS NOT NULL THEN RAISE EXCEPTION 'already_reversed'; END IF;
FOR a IN SELECT * FROM public.customer_payment_allocations WHERE payment_id=p.id LOOP
  UPDATE public.sales SET amount_settled=greatest(0,amount_settled-a.amount) WHERE id=a.sale_id;
END LOOP;
INSERT INTO public.customer_ledger(customer_id,kind,amount,payment_id,entry_date,user_id,note) VALUES(p.customer_id,'payment_reversal',p.amount,p.id,public.business_today(),auth.uid(),left(p_reason,200));
UPDATE public.customer_payments SET reversed_at=now(),reversed_by=auth.uid(),reverse_reason=p_reason WHERE id=p.id;
INSERT INTO public.audit_logs(user_id,action,entity,entity_id,details) VALUES(auth.uid(),'reverse','customer_payment',p.id::text,jsonb_build_object('receipt',p.receipt_no,'amount',p.amount,'reason',p_reason));
END $function$;
REVOKE ALL ON FUNCTION public.receive_customer_payment(uuid,uuid,numeric,text,text,text,text,uuid[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reverse_customer_payment(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.receive_customer_payment(uuid,uuid,numeric,text,text,text,text,uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reverse_customer_payment(uuid,text) TO authenticated;
