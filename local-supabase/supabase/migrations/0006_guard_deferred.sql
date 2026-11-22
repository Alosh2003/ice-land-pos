-- ICE LAND local backend — migration 0006: protect deferred payment method
-- The "deferred" method cannot be deactivated while any customer balance exists.

create or replace function public.guard_payment_methods() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_old_active boolean;
  v_new_active boolean;
  v_balances numeric;
begin
  select (m->>'active')::boolean into v_old_active
  from jsonb_array_elements(old.payment_methods) m where m->>'code'='deferred';
  select (m->>'active')::boolean into v_new_active
  from jsonb_array_elements(new.payment_methods) m where m->>'code'='deferred';

  if v_old_active and not v_new_active then
    select coalesce(sum(amount), 0) into v_balances from public.customer_ledger;
    if v_balances <> 0 then
      raise exception 'deferred_has_balances';
    end if;
  end if;

  return new;
end $$;

drop trigger if exists settings_payment_guard on public.settings;
create trigger settings_payment_guard before update on public.settings
  for each row execute function public.guard_payment_methods();
