
create type public.app_role as enum ('admin','manager','cashier','accountant');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  email text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role app_role not null,
  unique(user_id, role)
);
grant select, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.user_roles where user_id=_user_id and role=_role) $$;
create or replace function public.has_any_role(_user_id uuid, _roles app_role[])
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.user_roles where user_id=_user_id and role = any(_roles)) $$;
create or replace function public.is_staff(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.user_roles where user_id=_user_id) $$;

create policy "profiles self or staff read" on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_staff(auth.uid()));
create policy "profiles self update" on public.profiles for update to authenticated using (id = auth.uid());
create policy "roles read own or admin" on public.user_roles for select to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(),'admin'));

-- first user becomes admin, others cashier
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles(id, full_name, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)), new.email);
  if not exists (select 1 from public.user_roles where role='admin') then
    insert into public.user_roles(user_id, role) values (new.id, 'admin');
  else
    insert into public.user_roles(user_id, role) values (new.id, 'cashier');
  end if;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- settings (single row)
create table public.settings (
  id int primary key default 1 check (id = 1),
  store_name text not null default 'ICE LAND',
  slogan text not null default 'IS ALWAYS A GOOD IDEA',
  phone text default '784040888',
  address text default '',
  instagram text default 'icela.nd8',
  logo_url text,
  currency_code text not null default 'YER',
  currency_symbol_ar text not null default 'ريال',
  currency_symbol_en text not null default 'Rial',
  currency_decimals int not null default 0 check (currency_decimals between 0 and 3),
  date_format text not null default 'dd/MM/yyyy',
  tax_enabled boolean not null default false,
  tax_rate numeric(6,3) not null default 0 check (tax_rate >= 0 and tax_rate <= 100),
  payment_methods jsonb not null default '[{"code":"cash","ar":"نقدي","en":"Cash","active":true},{"code":"card","ar":"بطاقة","en":"Card","active":true},{"code":"transfer","ar":"تحويل","en":"Transfer","active":true}]',
  receipt_footer text default 'شكراً لزيارتكم — Thank you!',
  updated_at timestamptz not null default now()
);
insert into public.settings(id) values (1);
grant select, update on public.settings to authenticated;
grant all on public.settings to service_role;
alter table public.settings enable row level security;
create policy "settings read staff" on public.settings for select to authenticated using (public.is_staff(auth.uid()));
create policy "settings admin update" on public.settings for update to authenticated using (public.has_role(auth.uid(),'admin'));

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name_ar text not null, name_en text not null,
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create table public.products (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.categories(id),
  name_ar text not null, name_en text not null,
  sku text unique,
  description text,
  image_url text,
  price numeric(14,2) not null check (price >= 0),
  cost numeric(14,2) not null default 0 check (cost >= 0),
  track_stock boolean not null default false,
  stock_qty numeric(14,3) not null default 0,
  active boolean not null default true,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.customers (
  id uuid primary key default gen_random_uuid(),
  name text not null, phone text,
  created_at timestamptz not null default now()
);
create sequence public.invoice_seq start 1;
create table public.sales (
  id uuid primary key default gen_random_uuid(),
  invoice_no text not null unique,
  idempotency_key uuid not null unique,
  customer_id uuid references public.customers(id),
  cashier_id uuid not null,
  status text not null default 'completed' check (status in ('completed','refunded','cancelled')),
  subtotal numeric(14,2) not null,
  discount numeric(14,2) not null default 0,
  tax numeric(14,2) not null default 0,
  total numeric(14,2) not null,
  paid numeric(14,2) not null,
  change_due numeric(14,2) not null default 0,
  notes text,
  refund_reason text, refunded_by uuid, refunded_at timestamptz,
  created_at timestamptz not null default now()
);
create table public.sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id),
  product_id uuid not null references public.products(id),
  name_ar text not null, name_en text not null,
  category_id uuid not null references public.categories(id),
  qty numeric(14,3) not null check (qty > 0),
  unit_price numeric(14,2) not null check (unit_price >= 0),
  list_price numeric(14,2) not null,
  unit_cost numeric(14,2) not null default 0,
  discount numeric(14,2) not null default 0,
  line_total numeric(14,2) not null
);
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id),
  method text not null,
  amount numeric(14,2) not null,
  created_at timestamptz not null default now()
);
create table public.audit_logs (
  id bigint generated always as identity primary key,
  user_id uuid, action text not null, entity text not null, entity_id text,
  details jsonb, created_at timestamptz not null default now()
);
create index on public.sales(created_at);
create index on public.sale_items(sale_id);
create index on public.payments(sale_id);

grant select on public.categories, public.products, public.customers, public.sales, public.sale_items, public.payments, public.audit_logs to authenticated;
grant insert, update on public.categories, public.products to authenticated;
grant insert on public.customers to authenticated;
grant all on public.categories, public.products, public.customers, public.sales, public.sale_items, public.payments, public.audit_logs to service_role;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.customers enable row level security;
alter table public.sales enable row level security;
alter table public.sale_items enable row level security;
alter table public.payments enable row level security;
alter table public.audit_logs enable row level security;

create policy "cat read" on public.categories for select to authenticated using (public.is_staff(auth.uid()));
create policy "cat write" on public.categories for insert to authenticated with check (public.has_any_role(auth.uid(), array['admin','manager']::app_role[]));
create policy "cat update" on public.categories for update to authenticated using (public.has_any_role(auth.uid(), array['admin','manager']::app_role[]));
create policy "prod read" on public.products for select to authenticated using (public.is_staff(auth.uid()));
create policy "prod write" on public.products for insert to authenticated with check (public.has_any_role(auth.uid(), array['admin','manager']::app_role[]));
create policy "prod update" on public.products for update to authenticated using (public.has_any_role(auth.uid(), array['admin','manager']::app_role[]));
create policy "cust read" on public.customers for select to authenticated using (public.is_staff(auth.uid()));
create policy "cust insert" on public.customers for insert to authenticated with check (public.is_staff(auth.uid()));
create policy "sales read" on public.sales for select to authenticated using (public.has_any_role(auth.uid(), array['admin','manager','accountant']::app_role[]) or cashier_id = auth.uid());
create policy "items read" on public.sale_items for select to authenticated using (exists(select 1 from public.sales s where s.id = sale_id));
create policy "pay read" on public.payments for select to authenticated using (exists(select 1 from public.sales s where s.id = sale_id));
create policy "audit read" on public.audit_logs for select to authenticated using (public.has_any_role(auth.uid(), array['admin','manager','accountant']::app_role[]));

-- product audit
create or replace function public.audit_products() returns trigger language plpgsql security definer set search_path=public as $$
begin
  new.updated_at := now();
  insert into public.audit_logs(user_id, action, entity, entity_id, details)
  values (auth.uid(), lower(tg_op), 'product', new.id::text,
    case when tg_op='UPDATE' then jsonb_build_object('old_price',old.price,'new_price',new.price,'old_cost',old.cost,'new_cost',new.cost,'active',new.active,'deleted',new.deleted_at is not null)
    else jsonb_build_object('name',new.name_en,'price',new.price) end);
  return new;
end $$;
create trigger products_audit before insert or update on public.products for each row execute function public.audit_products();

create or replace function public.audit_settings() returns trigger language plpgsql security definer set search_path=public as $$
begin new.updated_at := now();
  insert into public.audit_logs(user_id, action, entity, entity_id, details) values (auth.uid(),'update','settings','1', to_jsonb(new));
  return new; end $$;
create trigger settings_audit before update on public.settings for each row execute function public.audit_settings();

-- atomic sale
create or replace function public.complete_sale(p_idempotency_key uuid, p_items jsonb, p_payments jsonb,
  p_order_discount numeric default 0, p_notes text default null, p_customer_id uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid(); v_existing record; v_set record;
  v_sale_id uuid := gen_random_uuid(); v_item jsonb; v_prod record;
  v_qty numeric; v_price numeric; v_ldisc numeric; v_line numeric;
  v_subtotal numeric := 0; v_tax numeric := 0; v_total numeric; v_paid numeric := 0; v_cash numeric := 0;
  v_can_price boolean; v_inv text; v_pay jsonb; v_change numeric;
begin
  if v_uid is null or not public.is_staff(v_uid) then raise exception 'not_authorized'; end if;
  select id, invoice_no into v_existing from public.sales where idempotency_key = p_idempotency_key;
  if found then return jsonb_build_object('sale_id', v_existing.id, 'invoice_no', v_existing.invoice_no, 'duplicate', true); end if;
  if jsonb_array_length(coalesce(p_items,'[]')) = 0 then raise exception 'empty_cart'; end if;
  if coalesce(p_order_discount,0) < 0 then raise exception 'invalid_discount'; end if;
  select * into v_set from public.settings where id=1;
  v_can_price := public.has_any_role(v_uid, array['admin','manager']::app_role[]);

  v_inv := 'IL-' || lpad(nextval('public.invoice_seq')::text, 6, '0');
  insert into public.sales(id, invoice_no, idempotency_key, customer_id, cashier_id, subtotal, discount, tax, total, paid, notes)
  values (v_sale_id, v_inv, p_idempotency_key, p_customer_id, v_uid, 0,0,0,0,0, nullif(trim(p_notes),''));

  for v_item in select * from jsonb_array_elements(p_items) loop
    select * into v_prod from public.products where id = (v_item->>'product_id')::uuid and active and deleted_at is null for update;
    if not found then raise exception 'product_unavailable'; end if;
    v_qty := (v_item->>'qty')::numeric;
    if v_qty is null or v_qty <= 0 then raise exception 'invalid_qty'; end if;
    v_price := coalesce((v_item->>'unit_price')::numeric, v_prod.price);
    if v_price < 0 then raise exception 'invalid_price'; end if;
    if v_price <> v_prod.price and not v_can_price then raise exception 'price_edit_not_allowed'; end if;
    v_ldisc := coalesce((v_item->>'discount')::numeric, 0);
    if v_ldisc < 0 or v_ldisc > v_price * v_qty then raise exception 'invalid_discount'; end if;
    v_line := round(v_price * v_qty - v_ldisc, 2);
    if v_prod.track_stock then
      if v_prod.stock_qty < v_qty then raise exception 'insufficient_stock'; end if;
      update public.products set stock_qty = stock_qty - v_qty where id = v_prod.id;
    end if;
    insert into public.sale_items(sale_id, product_id, name_ar, name_en, category_id, qty, unit_price, list_price, unit_cost, discount, line_total)
    values (v_sale_id, v_prod.id, v_prod.name_ar, v_prod.name_en, v_prod.category_id, v_qty, v_price, v_prod.price, v_prod.cost, v_ldisc, v_line);
    if v_price <> v_prod.price then
      insert into public.audit_logs(user_id, action, entity, entity_id, details) values (v_uid,'price_override','sale',v_sale_id::text, jsonb_build_object('product',v_prod.name_en,'list',v_prod.price,'charged',v_price));
    end if;
    v_subtotal := v_subtotal + v_line;
  end loop;

  if p_order_discount > v_subtotal then raise exception 'invalid_discount'; end if;
  if v_set.tax_enabled then v_tax := round((v_subtotal - p_order_discount) * v_set.tax_rate / 100, 2); end if;
  v_total := v_subtotal - p_order_discount + v_tax;

  for v_pay in select * from jsonb_array_elements(coalesce(p_payments,'[]')) loop
    if (v_pay->>'amount')::numeric <= 0 then raise exception 'invalid_payment'; end if;
    v_paid := v_paid + (v_pay->>'amount')::numeric;
    if v_pay->>'method' = 'cash' then v_cash := v_cash + (v_pay->>'amount')::numeric; end if;
  end loop;
  if v_paid < v_total then raise exception 'insufficient_payment'; end if;
  v_change := v_paid - v_total;
  if v_change > v_cash then raise exception 'change_exceeds_cash'; end if;

  -- record payments net of change (change comes from cash)
  for v_pay in select * from jsonb_array_elements(p_payments) loop
    insert into public.payments(sale_id, method, amount) values (v_sale_id, v_pay->>'method',
      case when v_pay->>'method'='cash' and v_cash > 0 then (v_pay->>'amount')::numeric - v_change * ((v_pay->>'amount')::numeric / v_cash) else (v_pay->>'amount')::numeric end);
  end loop;

  update public.sales set subtotal=v_subtotal, discount=p_order_discount, tax=v_tax, total=v_total, paid=v_paid, change_due=v_change where id=v_sale_id;
  insert into public.audit_logs(user_id, action, entity, entity_id, details) values (v_uid,'create','sale',v_sale_id::text, jsonb_build_object('invoice',v_inv,'total',v_total));
  return jsonb_build_object('sale_id', v_sale_id, 'invoice_no', v_inv, 'total', v_total, 'change', v_change, 'duplicate', false);
end $$;

create or replace function public.refund_sale(p_sale_id uuid, p_reason text, p_status text default 'refunded')
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_sale record; v_it record;
begin
  if not public.has_any_role(v_uid, array['admin','manager']::app_role[]) then raise exception 'not_authorized'; end if;
  if p_status not in ('refunded','cancelled') then raise exception 'invalid_status'; end if;
  if coalesce(trim(p_reason),'') = '' then raise exception 'reason_required'; end if;
  select * into v_sale from public.sales where id = p_sale_id for update;
  if not found then raise exception 'not_found'; end if;
  if v_sale.status <> 'completed' then raise exception 'already_reversed'; end if;
  for v_it in select si.* from public.sale_items si join public.products p on p.id = si.product_id where si.sale_id = p_sale_id and p.track_stock loop
    update public.products set stock_qty = stock_qty + v_it.qty where id = v_it.product_id;
  end loop;
  update public.sales set status=p_status, refund_reason=p_reason, refunded_by=v_uid, refunded_at=now() where id=p_sale_id;
  insert into public.audit_logs(user_id, action, entity, entity_id, details) values (v_uid, p_status, 'sale', p_sale_id::text, jsonb_build_object('invoice',v_sale.invoice_no,'reason',p_reason,'total',v_sale.total));
end $$;

-- dashboard aggregate
create or replace function public.dashboard_stats(p_from timestamptz, p_to timestamptz)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_len interval := p_to - p_from; r jsonb;
begin
  if not public.has_any_role(auth.uid(), array['admin','manager','accountant']::app_role[]) then raise exception 'not_authorized'; end if;
  with s as (select * from public.sales where status='completed' and created_at >= p_from and created_at < p_to),
  ps as (select * from public.sales where status='completed' and created_at >= p_from - v_len and created_at < p_from),
  it as (select si.* from public.sale_items si join s on s.id = si.sale_id)
  select jsonb_build_object(
    'revenue', coalesce((select sum(total) from s),0),
    'count', (select count(*) from s),
    'cogs', coalesce((select sum(unit_cost*qty) from it),0),
    'prev_revenue', coalesce((select sum(total) from ps),0),
    'prev_count', (select count(*) from ps),
    'daily', coalesce((select jsonb_agg(d order by d->>'day') from (select jsonb_build_object('day', to_char(date_trunc('day', created_at),'YYYY-MM-DD'), 'revenue', sum(total), 'count', count(*)) d from s group by date_trunc('day', created_at)) x),'[]'),
    'by_category', coalesce((select jsonb_agg(jsonb_build_object('name_ar',c.name_ar,'name_en',c.name_en,'revenue',t.rev)) from (select category_id, sum(line_total) rev from it group by category_id) t join public.categories c on c.id=t.category_id),'[]'),
    'by_payment', coalesce((select jsonb_agg(jsonb_build_object('method',method,'amount',amt)) from (select p.method, sum(p.amount) amt from public.payments p join s on s.id=p.sale_id group by p.method) t),'[]'),
    'top_products', coalesce((select jsonb_agg(x) from (select jsonb_build_object('name_ar',name_ar,'name_en',name_en,'qty',sum(qty),'revenue',sum(line_total)) x from it group by product_id,name_ar,name_en order by sum(qty) desc limit 10) t),'[]')
  ) into r;
  return r;
end $$;

revoke execute on function public.complete_sale, public.refund_sale, public.dashboard_stats from public, anon;
grant execute on function public.complete_sale, public.refund_sale, public.dashboard_stats to authenticated;

-- seed menu
with c as (
  insert into public.categories(name_ar,name_en,sort_order) values
  ('آيس كريم','Ice Cream',1),('نكهات خاصة','Special Flavors',2),('ميلك شيك','Milkshakes',3),('حامض الميلك شيك','Sour Milkshakes',4)
  returning id, sort_order)
insert into public.products(category_id,name_ar,name_en,sku,price)
select c.id, v.ar, v.en, v.sku, v.price from c join (values
 (1,'تفاح','Apple','IC-01',400),(1,'توت','Berry','IC-02',400),(1,'مانجو','Mango','IC-03',400),(1,'كرز','Cherry','IC-04',400),(1,'فراولة','Strawberry','IC-05',400),(1,'جلكسي','Galaxy','IC-06',400),
 (2,'دبي','Dubai','SP-01',500),(2,'أوريو','Oreo','SP-02',500),(2,'لوتس','Lotus','SP-03',500),(2,'توفي','Toffee','SP-04',500),(2,'كندر','Kinder','SP-05',500),(2,'كرميل','Caramel','SP-06',500),
 (2,'حامض كيوي','Sour Kiwi','SP-07',500),(2,'حامض كرز بري','Sour Cherry Berry','SP-08',500),(2,'فانيليا','Vanilla','SP-09',500),(2,'عنب','Grape','SP-10',500),
 (2,'تشيز كيك كرز','Cheesecake Cherry','SP-11',500),(2,'تشيز كيك لوتس','Cheesecake Lotus','SP-12',500),(2,'بستاشيو','Pistachio','SP-13',500),(2,'كوفي','Coffee','SP-14',500),
 (2,'تشيز كيك فراولة','Cheesecake Strawberry','SP-15',500),(2,'تشيز كيك توت','Cheesecake Berry','SP-16',500),(2,'كوكيز','Cookies','SP-17',500),(2,'سنيكرز','Snickers','SP-18',500),(2,'إيطالي','Italian','SP-19',500),
 (3,'تشيز كيك توت','Cheesecake Berry Shake','MS-01',1200),(3,'تشيز كيك فراولة','Cheesecake Strawberry Shake','MS-02',1200),(3,'كوفي','Coffee Shake','MS-03',1200),(3,'بستاشيو','Pistachio Shake','MS-04',1200),
 (3,'سنيكرز','Snickers Shake','MS-05',1200),(3,'جلكسي','Galaxy Shake','MS-06',1200),(3,'مانجو','Mango Shake','MS-07',1200),(3,'توفي','Toffee Shake','MS-08',1200),(3,'لوتس','Lotus Shake','MS-09',1200),
 (3,'كوكيز','Cookies Shake','MS-10',1200),(3,'إيطالي','Italian Shake','MS-11',1200),
 (4,'توت','Sour Berry Shake','SM-01',1200),(4,'كرز','Sour Cherry Shake','SM-02',1200),(4,'تفاح','Sour Apple Shake','SM-03',1200)
) v(cat,ar,en,sku,price) on v.cat = c.sort_order;
