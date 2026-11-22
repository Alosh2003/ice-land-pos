-- ICE LAND local backend — fix complete_counter_sale for no-customer sales
-- Fixes "record cust is not assigned yet" when p_customer_id is null.
-- Also fixes column/variable name ambiguity on `paid`.

drop function if exists public.complete_counter_sale(uuid,jsonb,jsonb,numeric,text,text,text,text,uuid,text);

create function public.complete_counter_sale(
  p_idempotency_key uuid,
  p_items jsonb,
  p_payments jsonb,
  p_order_discount numeric default 0,
  p_notes text default ''::text,
  p_order_type text default 'dine_in'::text,
  p_delivery_address text default ''::text,
  p_customer_phone text default ''::text,
  p_customer_id uuid default null,
  p_credit_override_reason text default ''
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  uid uuid:=auth.uid();
  st record;
  prod record;
  it jsonb;
  pay jsonb;
  sid uuid:=gen_random_uuid();
  inv text;
  sub numeric:=0;
  tx numeric:=0;
  tot numeric;
  v_paid numeric:=0;
  cash numeric:=0;
  ch numeric;
  fee numeric:=0;
  qty numeric;
  price numeric;
  disc numeric;
  amt numeric;
  pname text;
  existing record;
  deferred numeric:=0;
  cust record;
  bal numeric;
  v_due_date date;
begin
  if not public.has_any_role(uid,array['admin','manager','cashier']::app_role[]) then raise exception 'not_authorized'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_idempotency_key::text,0));
  select * into existing from public.sales where idempotency_key=p_idempotency_key;
  if found then
    if existing.cashier_id<>uid then raise exception 'not_authorized'; end if;
    return jsonb_build_object('sale_id',existing.id,'invoice_no',existing.invoice_no);
  end if;
  if p_order_type is null or p_order_type not in ('dine_in','takeaway','delivery') then raise exception 'invalid_order_type'; end if;
  if jsonb_typeof(p_items)<>'array' or coalesce(jsonb_array_length(p_items),0)=0 then raise exception 'empty_cart'; end if;
  if p_order_discount is null or p_order_discount::text in ('NaN','Infinity','-Infinity') or p_order_discount<0 then raise exception 'invalid_discount'; end if;
  select * into st from public.settings where id=1;
  if p_customer_id is not null then
    select * into cust from public.customers where id=p_customer_id for update;
    if not found or not cust.active then raise exception 'customer_unavailable'; end if;
  end if;
  if p_order_type='delivery' then
    if not st.delivery_enabled then raise exception 'delivery_disabled'; end if;
    if trim(coalesce(p_delivery_address,''))='' or trim(coalesce(p_customer_phone,''))='' then raise exception 'delivery_details_required'; end if;
    fee:=st.delivery_fee;
  end if;
  select coalesce(nullif(full_name,''),email,'') into pname from public.profiles where id=uid;
  inv:='IL-'||lpad(nextval('public.invoice_seq')::text,6,'0');
  insert into public.sales(id,invoice_no,idempotency_key,cashier_id,cashier_name,subtotal,total,paid,notes,order_type,delivery_fee,delivery_address,customer_phone,customer_id)
  values(sid,inv,p_idempotency_key,uid,pname,0,0,0,left(p_notes,300),p_order_type,fee,case when p_order_type='delivery' then left(p_delivery_address,500) end,left(p_customer_phone,50),p_customer_id);
  perform set_config('app.stock_kind','sale',true);
  perform set_config('app.stock_sale',sid::text,true);
  for it in select value from jsonb_array_elements(p_items) order by value->>'product_id' loop
    select * into prod from public.products where id=(it->>'product_id')::uuid and active and deleted_at is null for update;
    if not found then raise exception 'product_unavailable'; end if;
    qty:=(it->>'qty')::numeric;
    price:=coalesce((it->>'unit_price')::numeric,prod.price);
    disc:=coalesce((it->>'discount')::numeric,0);
    if qty is null or qty::text in ('NaN','Infinity','-Infinity') or qty<=0 then raise exception 'invalid_qty'; end if;
    if price::text in ('NaN','Infinity','-Infinity') or price<0 then raise exception 'invalid_price'; end if;
    if price<>prod.price and not public.has_any_role(uid,array['admin','manager']::app_role[]) then raise exception 'price_edit_not_allowed'; end if;
    if disc::text in ('NaN','Infinity','-Infinity') or disc<0 or disc>price*qty then raise exception 'invalid_discount'; end if;
    amt:=round(price*qty-disc,2);
    sub:=sub+amt;
    if prod.track_stock then
      if prod.stock_qty<qty then raise exception 'insufficient_stock'; end if;
      update public.products set stock_qty=stock_qty-qty where id=prod.id;
    end if;
    insert into public.sale_items(sale_id,product_id,name_ar,name_en,category_id,qty,unit_price,list_price,unit_cost,discount,line_total,image_url,stock_deducted)
    values(sid,prod.id,prod.name_ar,prod.name_en,prod.category_id,qty,price,prod.price,prod.cost,disc,amt,prod.image_url,case when prod.track_stock then qty else 0 end);
  end loop;
  if p_order_discount>sub then raise exception 'invalid_discount'; end if;
  if st.tax_enabled then tx:=round((sub-p_order_discount+case when st.delivery_taxable then fee else 0 end)*st.tax_rate/100,2); end if;
  tot:=sub-p_order_discount+tx+fee;
  if jsonb_typeof(p_payments)<>'array' or coalesce(jsonb_array_length(p_payments),0)=0 then raise exception 'invalid_payment'; end if;
  for pay in select * from jsonb_array_elements(p_payments) loop
    amt:=(pay->>'amount')::numeric;
    if amt is null or amt::text in ('NaN','Infinity','-Infinity') or amt<=0 then raise exception 'invalid_payment'; end if;
    if not exists(select 1 from jsonb_array_elements(st.payment_methods) m where m->>'code'=pay->>'method' and (m->>'active')::boolean) then raise exception 'invalid_payment_method'; end if;
    if nullif(pay->>'proof_path','') is not null and (split_part(pay->>'proof_path','/',1)<>uid::text or not exists(select 1 from storage.objects where bucket_id='payment-proofs' and name=pay->>'proof_path')) then raise exception 'invalid_proof'; end if;
    v_paid:=v_paid+amt;
    if pay->>'method'='cash' then cash:=cash+amt; end if;
    if pay->>'method'='deferred' then deferred:=deferred+amt; end if;
  end loop;
  if v_paid<tot then raise exception 'insufficient_payment'; end if;
  ch:=v_paid-tot;
  if ch>cash then raise exception 'change_exceeds_cash'; end if;
  if deferred>0 then
    if p_customer_id is null then raise exception 'customer_required'; end if;
    if deferred>tot then raise exception 'invalid_payment'; end if;
    if not cust.credit_enabled then raise exception 'credit_disabled'; end if;
    select coalesce(sum(amount),0) into bal from public.customer_ledger where customer_id=p_customer_id;
    if bal+deferred>cust.credit_limit then
      if public.has_any_role(uid,array['admin','manager']::app_role[]) and trim(coalesce(p_credit_override_reason,''))<>'' then
        insert into public.audit_logs(user_id,action,entity,entity_id,details)
        values(uid,'credit_override','sale',sid::text,jsonb_build_object('customer',cust.name,'limit',cust.credit_limit,'balance',bal,'amount',deferred,'reason',p_credit_override_reason));
      else raise exception 'credit_limit_exceeded'; end if;
    end if;
    insert into public.customer_ledger(customer_id,kind,amount,sale_id,entry_date,user_id,note)
    values(p_customer_id,'sale',deferred,sid,public.business_today(),uid,inv);
  end if;
  -- Compute due_date only when we have a customer with deferred balance; avoids referencing
  -- the indeterminate `cust` record for walk-in (no-customer) sales.
  if deferred>0 and p_customer_id is not null then
    v_due_date:=public.business_today()+cust.payment_terms_days;
  else
    v_due_date:=null;
  end if;
  for pay in select * from jsonb_array_elements(p_payments) loop
    insert into public.payments(sale_id,method,amount,reference,proof_path)
    values(sid,pay->>'method',case when pay->>'method'='cash' and cash>0 then (pay->>'amount')::numeric-ch*((pay->>'amount')::numeric/cash) else (pay->>'amount')::numeric end,
    left(nullif(trim(pay->>'reference'),''),150),nullif(pay->>'proof_path',''));
  end loop;
  update public.sales
  set subtotal=sub,
      discount=p_order_discount,
      tax=tx,
      total=tot,
      paid=v_paid,
      change_due=ch,
      amount_due=deferred,
      due_date=v_due_date
  where id=sid;
  insert into public.audit_logs(user_id,action,entity,entity_id,details)
  values(uid,'create','sale',sid::text,jsonb_build_object('invoice',inv,'total',tot,'order_type',p_order_type,'deferred',deferred));
  return jsonb_build_object('sale_id',sid,'invoice_no',inv);
end
$function$;

revoke all on function public.complete_counter_sale(uuid,jsonb,jsonb,numeric,text,text,text,text,uuid,text) from public, anon;
grant execute on function public.complete_counter_sale(uuid,jsonb,jsonb,numeric,text,text,text,text,uuid,text) to authenticated;
