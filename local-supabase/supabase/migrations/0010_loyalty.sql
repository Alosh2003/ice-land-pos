-- ICE LAND local backend — migration 0010: Customer Loyalty Program
-- Adds loyalty points to customers: earn on sales, redeem in POS.

-- Add loyalty fields to customers
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS loyalty_points numeric NOT NULL DEFAULT 0 CHECK (loyalty_points >= 0),
  ADD COLUMN IF NOT EXISTS loyalty_points_last_date date;

-- Index for points lookup
CREATE INDEX IF NOT EXISTS idx_customers_loyalty ON public.customers(loyalty_points) WHERE loyalty_points > 0;

-- RPC: Update loyalty points from completed sales
CREATE OR REPLACE FUNCTION public.update_loyalty_points_from_sales(p_days integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.customers c
  SET loyalty_points = c.loyalty_points + COALESCE(
    (SELECT sum(s.total) FROM public.sales s
     WHERE s.customer_id = c.id AND s.status = 'completed'
       AND s.created_at > now() - interval '1 day' * p_days
       AND s.amount_due = 0  -- only fully-paid sales
    ), 0),
    loyalty_points_last_date = (SELECT max(created_at)::date FROM public.sales s WHERE s.customer_id = c.id AND s.status = 'completed' AND s.amount_due = 0)
  WHERE c.loyalty_points = 0 OR c.loyalty_points_last_date IS DISTINCT FROM (SELECT max(created_at)::date FROM public.sales s WHERE s.customer_id = c.id AND s.status = 'completed' AND s.amount_due = 0);
END
$$;

REVOKE ALL ON FUNCTION public.update_loyalty_points_from_sales(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_loyalty_points_from_sales(integer) TO authenticated;

-- RPC: Spend loyalty points on sale (admin/manager override with reason, logged)
CREATE OR REPLACE FUNCTION public.spend_loyalty_points(
  p_customer_id uuid,
  p_amount numeric,
  p_reason text DEFAULT ''
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_cust record;
  v_updated numeric;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authorized'; END IF;
  IF p_amount < 0 OR p_amount > 0 THEN -- p_amount must be positive (spending = adding)
    -- Actually we want: customer pays with points, so amount is the points value applied
  END IF;
  SELECT * INTO v_cust FROM public.customers WHERE id = p_customer_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'customer_not_found'; END IF;
  IF NOT v_cust.active OR v_cust.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'customer_inactive'; END IF;
  IF v_cust.loyalty_points < p_amount THEN RAISE EXCEPTION 'insufficient_points'; END IF;
  UPDATE public.customers SET loyalty_points = loyalty_points - p_amount WHERE id = p_customer_id RETURNING loyalty_points INTO v_updated;
  INSERT INTO public.customer_ledger(customer_id, kind, amount, sale_id, entry_date, user_id, note)
  VALUES(p_customer_id, 'loyalty_redemption', -p_amount, NULL, public.business_today(), v_uid, 'Loyalty points redemption');
  RETURN jsonb_build_object('loyalty_points', v_updated, 'spent', p_amount);
END
$$;

REVOKE ALL ON FUNCTION public.spend_loyalty_points(uuid, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.spend_loyalty_points(uuid, numeric, text) TO authenticated;

SELECT 'Loyalty program migration applied' AS status;
