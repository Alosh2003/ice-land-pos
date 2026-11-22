ALTER TABLE public.settings ADD COLUMN delivery_enabled boolean NOT NULL DEFAULT false, ADD COLUMN delivery_fee numeric NOT NULL DEFAULT 0 CHECK (delivery_fee >= 0), ADD COLUMN delivery_taxable boolean NOT NULL DEFAULT false, ADD COLUMN timezone text NOT NULL DEFAULT 'Asia/Aden';
ALTER TABLE public.sales ADD COLUMN cashier_name text, ADD COLUMN order_type text NOT NULL DEFAULT 'dine_in' CHECK (order_type IN ('dine_in','takeaway','delivery')), ADD COLUMN delivery_fee numeric NOT NULL DEFAULT 0, ADD COLUMN delivery_address text, ADD COLUMN customer_phone text;
UPDATE public.sales s SET cashier_name=coalesce(nullif(p.full_name,''),p.email) FROM public.profiles p WHERE s.cashier_id=p.id;
ALTER TABLE public.sale_items ADD COLUMN image_url text, ADD COLUMN stock_deducted numeric NOT NULL DEFAULT 0;
UPDATE public.sale_items si SET image_url=p.image_url FROM public.products p WHERE si.product_id=p.id;
COMMENT ON COLUMN public.sale_items.stock_deducted IS 'Exact deducted quantity for new sales; legacy deductions cannot be proven and default to zero.';
ALTER TABLE public.payments ADD COLUMN reference text, ADD COLUMN proof_path text;
CREATE TABLE public.stock_movements(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), product_id uuid NOT NULL REFERENCES public.products(id), quantity numeric NOT NULL, kind text NOT NULL, reason text, user_id uuid, sale_id uuid REFERENCES public.sales(id), business_date date NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.stock_movements TO authenticated; GRANT ALL ON public.stock_movements TO service_role;
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;
CREATE POLICY stock_read ON public.stock_movements FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE TABLE public.daily_counts(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), product_id uuid NOT NULL REFERENCES public.products(id), business_date date NOT NULL, opening numeric NOT NULL, closing numeric, expected_at_close numeric, discrepancy numeric, closed_at timestamptz, user_id uuid NOT NULL, UNIQUE(product_id,business_date));
GRANT SELECT ON public.daily_counts TO authenticated; GRANT ALL ON public.daily_counts TO service_role;
ALTER TABLE public.daily_counts ENABLE ROW LEVEL SECURITY;
CREATE POLICY counts_read ON public.daily_counts FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE FUNCTION public.business_today() RETURNS date LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT (now() AT TIME ZONE timezone)::date FROM public.settings WHERE id=1 $$;
CREATE FUNCTION public.record_stock_change() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE d date:=public.business_today(); k text:=coalesce(nullif(current_setting('app.stock_kind',true),''),'adjustment'); sid uuid; BEGIN
IF NEW.stock_qty IS DISTINCT FROM OLD.stock_qty THEN
IF EXISTS(SELECT 1 FROM public.daily_counts WHERE product_id=NEW.id AND business_date=d AND closed_at IS NOT NULL) THEN RAISE EXCEPTION 'day_closed'; END IF;
INSERT INTO public.daily_counts(product_id,business_date,opening,user_id) VALUES(NEW.id,d,OLD.stock_qty,coalesce(auth.uid(),'00000000-0000-0000-0000-000000000000')) ON CONFLICT DO NOTHING;
sid:=nullif(current_setting('app.stock_sale',true),'')::uuid;
INSERT INTO public.stock_movements(product_id,quantity,kind,reason,user_id,sale_id,business_date) VALUES(NEW.id,NEW.stock_qty-OLD.stock_qty,k,nullif(current_setting('app.stock_reason',true),''),auth.uid(),sid,d);
END IF; RETURN NEW; END $$;
CREATE TRIGGER stock_changes AFTER UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.record_stock_change();
CREATE FUNCTION public.manage_daily_stock(p_product_id uuid,p_action text,p_quantity numeric,p_reason text DEFAULT '') RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p record; c record; d date:=public.business_today(); BEGIN
IF NOT public.has_any_role(auth.uid(),ARRAY['admin','manager']::app_role[]) THEN RAISE EXCEPTION 'not_authorized'; END IF;
IF p_quantity IS NULL OR p_quantity::text IN ('NaN','Infinity','-Infinity') OR p_quantity<0 THEN RAISE EXCEPTION 'invalid_qty'; END IF;
SELECT * INTO p FROM public.products WHERE id=p_product_id FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
SELECT * INTO c FROM public.daily_counts WHERE product_id=p.id AND business_date=d;
IF c.closed_at IS NOT NULL THEN RAISE EXCEPTION 'day_closed'; END IF;
IF p_action='opening' THEN
IF c.id IS NOT NULL THEN RAISE EXCEPTION 'opening_already_recorded'; END IF;
PERFORM set_config('app.stock_kind','opening_adjustment',true); PERFORM set_config('app.stock_reason',p_reason,true);
UPDATE public.products SET track_stock=true,stock_qty=p_quantity WHERE id=p.id;
INSERT INTO public.daily_counts(product_id,business_date,opening,user_id) VALUES(p.id,d,p_quantity,auth.uid()) ON CONFLICT(product_id,business_date) DO UPDATE SET opening=p_quantity;
ELSIF p_action IN ('addition','waste','close') THEN
IF NOT p.track_stock THEN RAISE EXCEPTION 'tracking_required'; END IF;
INSERT INTO public.daily_counts(product_id,business_date,opening,user_id) VALUES(p.id,d,p.stock_qty,auth.uid()) ON CONFLICT DO NOTHING;
IF p_action='waste' AND trim(p_reason)='' THEN RAISE EXCEPTION 'reason_required'; END IF;
PERFORM set_config('app.stock_kind',CASE WHEN p_action='close' THEN 'closing_adjustment' ELSE p_action END,true); PERFORM set_config('app.stock_reason',p_reason,true);
IF p_action='close' THEN
UPDATE public.products SET stock_qty=p_quantity WHERE id=p.id;
UPDATE public.daily_counts SET closing=p_quantity,expected_at_close=p.stock_qty,discrepancy=p_quantity-p.stock_qty,closed_at=now() WHERE product_id=p.id AND business_date=d;
ELSE
IF p_action='waste' AND p_quantity>p.stock_qty THEN RAISE EXCEPTION 'insufficient_stock'; END IF;
UPDATE public.products SET stock_qty=stock_qty+CASE WHEN p_action='waste' THEN -p_quantity ELSE p_quantity END WHERE id=p.id;
END IF;
ELSE RAISE EXCEPTION 'invalid_action'; END IF;
INSERT INTO public.audit_logs(user_id,action,entity,entity_id,details) VALUES(auth.uid(),p_action,'daily_stock',p.id::text,jsonb_build_object('quantity',p_quantity,'reason',p_reason,'date',d));
END $$;
REVOKE ALL ON FUNCTION public.manage_daily_stock FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.manage_daily_stock TO authenticated;
CREATE FUNCTION public.complete_counter_sale(p_idempotency_key uuid,p_items jsonb,p_payments jsonb,p_order_discount numeric DEFAULT 0,p_notes text DEFAULT '',p_order_type text DEFAULT 'dine_in',p_delivery_address text DEFAULT '',p_customer_phone text DEFAULT '') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE uid uuid:=auth.uid(); st record; prod record; it jsonb; pay jsonb; sid uuid:=gen_random_uuid(); inv text; sub numeric:=0; tx numeric:=0; tot numeric; paid numeric:=0; cash numeric:=0; ch numeric; fee numeric:=0; qty numeric; price numeric; disc numeric; amt numeric; pname text; existing record; BEGIN
IF NOT public.has_any_role(uid,ARRAY['admin','manager','cashier']::app_role[]) THEN RAISE EXCEPTION 'not_authorized'; END IF;
PERFORM pg_advisory_xact_lock(hashtextextended(p_idempotency_key::text,0));
SELECT * INTO existing FROM public.sales WHERE idempotency_key=p_idempotency_key;
IF FOUND THEN IF existing.cashier_id<>uid THEN RAISE EXCEPTION 'not_authorized'; END IF; RETURN jsonb_build_object('sale_id',existing.id,'invoice_no',existing.invoice_no); END IF;
IF p_order_type IS NULL OR p_order_type NOT IN ('dine_in','takeaway','delivery') THEN RAISE EXCEPTION 'invalid_order_type'; END IF;
IF jsonb_typeof(p_items)<>'array' OR coalesce(jsonb_array_length(p_items),0)=0 THEN RAISE EXCEPTION 'empty_cart'; END IF;
IF p_order_discount IS NULL OR p_order_discount::text IN ('NaN','Infinity','-Infinity') OR p_order_discount<0 THEN RAISE EXCEPTION 'invalid_discount'; END IF;
SELECT * INTO st FROM public.settings WHERE id=1;
IF p_order_type='delivery' THEN
IF NOT st.delivery_enabled THEN RAISE EXCEPTION 'delivery_disabled'; END IF;
IF trim(coalesce(p_delivery_address,''))='' OR trim(coalesce(p_customer_phone,''))='' THEN RAISE EXCEPTION 'delivery_details_required'; END IF; fee:=st.delivery_fee; END IF;
SELECT coalesce(nullif(full_name,''),email,'') INTO pname FROM public.profiles WHERE id=uid;
inv:='IL-'||lpad(nextval('public.invoice_seq')::text,6,'0');
INSERT INTO public.sales(id,invoice_no,idempotency_key,cashier_id,cashier_name,subtotal,total,paid,notes,order_type,delivery_fee,delivery_address,customer_phone) VALUES(sid,inv,p_idempotency_key,uid,pname,0,0,0,left(p_notes,300),p_order_type,fee,CASE WHEN p_order_type='delivery' THEN left(p_delivery_address,500) END,left(p_customer_phone,50));
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
paid:=paid+amt; IF pay->>'method'='cash' THEN cash:=cash+amt; END IF; END LOOP;
IF paid<tot THEN RAISE EXCEPTION 'insufficient_payment'; END IF; ch:=paid-tot; IF ch>cash THEN RAISE EXCEPTION 'change_exceeds_cash'; END IF;
FOR pay IN SELECT * FROM jsonb_array_elements(p_payments) LOOP
INSERT INTO public.payments(sale_id,method,amount,reference,proof_path) VALUES(sid,pay->>'method',CASE WHEN pay->>'method'='cash' AND cash>0 THEN (pay->>'amount')::numeric-ch*((pay->>'amount')::numeric/cash) ELSE (pay->>'amount')::numeric END,left(nullif(trim(pay->>'reference'),''),150),nullif(pay->>'proof_path','')); END LOOP;
UPDATE public.sales SET subtotal=sub,discount=p_order_discount,tax=tx,total=tot,paid=paid,change_due=ch WHERE id=sid;
INSERT INTO public.audit_logs(user_id,action,entity,entity_id,details) VALUES(uid,'create','sale',sid::text,jsonb_build_object('invoice',inv,'total',tot,'order_type',p_order_type));
RETURN jsonb_build_object('sale_id',sid,'invoice_no',inv); END $$;
REVOKE ALL ON FUNCTION public.complete_counter_sale FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.complete_counter_sale TO authenticated;
REVOKE EXECUTE ON FUNCTION public.complete_sale FROM authenticated;
CREATE FUNCTION public.reverse_counter_sale(p_sale_id uuid,p_reason text,p_status text DEFAULT 'refunded',p_restock boolean DEFAULT false) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE s record; i record; BEGIN
IF NOT public.has_any_role(auth.uid(),ARRAY['admin','manager']::app_role[]) THEN RAISE EXCEPTION 'not_authorized'; END IF;
IF p_status NOT IN ('refunded','cancelled') OR p_status IS NULL THEN RAISE EXCEPTION 'invalid_status'; END IF;
IF trim(coalesce(p_reason,''))='' THEN RAISE EXCEPTION 'reason_required'; END IF;
SELECT * INTO s FROM public.sales WHERE id=p_sale_id FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF; IF s.status<>'completed' THEN RAISE EXCEPTION 'already_reversed'; END IF;
PERFORM set_config('app.stock_sale',s.id::text,true); PERFORM set_config('app.stock_kind','return',true); PERFORM set_config('app.stock_reason',p_reason,true);
IF p_restock THEN FOR i IN SELECT * FROM public.sale_items WHERE sale_id=s.id AND stock_deducted>0 ORDER BY product_id LOOP UPDATE public.products SET stock_qty=stock_qty+i.stock_deducted WHERE id=i.product_id; END LOOP; END IF;
UPDATE public.sales SET status=p_status,refund_reason=p_reason,refunded_by=auth.uid(),refunded_at=now() WHERE id=s.id;
INSERT INTO public.audit_logs(user_id,action,entity,entity_id,details) VALUES(auth.uid(),p_status,'sale',s.id::text,jsonb_build_object('reason',p_reason,'restocked',p_restock,'legacy_stock_unknown',EXISTS(SELECT 1 FROM public.sale_items WHERE sale_id=s.id AND stock_deducted=0)));
END $$;
REVOKE ALL ON FUNCTION public.reverse_counter_sale FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.reverse_counter_sale TO authenticated; REVOKE EXECUTE ON FUNCTION public.refund_sale FROM authenticated;
CREATE POLICY proof_upload ON storage.objects FOR INSERT TO authenticated WITH CHECK(bucket_id='payment-proofs' AND (storage.foldername(name))[1]=auth.uid()::text AND public.has_any_role(auth.uid(),ARRAY['admin','manager','cashier']::app_role[]));
CREATE POLICY proof_read ON storage.objects FOR SELECT TO authenticated USING(bucket_id='payment-proofs' AND ((storage.foldername(name))[1]=auth.uid()::text OR EXISTS(SELECT 1 FROM public.payments p JOIN public.sales s ON s.id=p.sale_id WHERE p.proof_path=name)));
CREATE POLICY proof_delete_unattached ON storage.objects FOR DELETE TO authenticated USING(bucket_id='payment-proofs' AND (storage.foldername(name))[1]=auth.uid()::text AND NOT EXISTS(SELECT 1 FROM public.payments p WHERE p.proof_path=name));