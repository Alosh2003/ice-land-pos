-- ICE LAND local backend — migration 0005: deferred payment (credit) enhancements
-- - Add deleted_at to customers (soft delete)
-- - Replace "card" with "deferred" payment method in settings
-- - Add customer_statement(customer_id, from, to) RPC
-- - Add receivables_aging() RPC
-- - Add overdue flag helper

-- Soft delete on customers
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- Replace "card" with "deferred" in default payment methods (admin can re-enable card later)
UPDATE public.settings
SET payment_methods = jsonb_set(
  payment_methods,
  '{1}',
  '{"code":"deferred","ar":"آجل","en":"Deferred / On account","active":true}',
  true
)
WHERE id = 1;

-- Helper: is a customer overdue (has unpaid invoices past due date)
CREATE OR REPLACE FUNCTION public.customer_overdue(p_customer_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.sales
    WHERE customer_id = p_customer_id
      AND status = 'completed'
      AND amount_due > amount_settled
      AND due_date IS NOT NULL
      AND due_date < public.business_today()
  );
$$;

REVOKE ALL ON FUNCTION public.customer_overdue(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.customer_overdue(uuid) TO authenticated;

-- Customer account statement: opening balance + every movement in date range
CREATE OR REPLACE FUNCTION public.customer_statement(
  p_customer_id uuid,
  p_from date,
  p_to date
) RETURNS TABLE(
  entry_date date,
  kind text,
  reference text,
  amount numeric,
  balance_after numeric,
  note text,
  user_id uuid,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_opening numeric;
  v_closing numeric;
BEGIN
  -- Opening balance = sum of all ledger entries before p_from
  SELECT coalesce(sum(amount), 0) INTO v_opening
  FROM public.customer_ledger
  WHERE customer_id = p_customer_id AND entry_date < p_from;

  -- Closing balance = opening + all movements in range
  SELECT coalesce(sum(amount), 0) INTO v_closing
  FROM public.customer_ledger
  WHERE customer_id = p_customer_id
    AND entry_date >= p_from AND entry_date <= p_to;

  RETURN QUERY
  SELECT
    l.entry_date,
    l.kind,
    coalesce(l.note, '') AS reference,
    l.amount,
    v_opening + sum(l.amount) OVER (ORDER BY l.entry_date, l.created_at ROWS UNBOUNDED PRECEDING) AS balance_after,
    l.note,
    l.user_id,
    l.created_at
  FROM public.customer_ledger l
  WHERE l.customer_id = p_customer_id
    AND l.entry_date >= p_from
    AND l.entry_date <= p_to
  ORDER BY l.entry_date, l.created_at;

  -- Return closing balance as a final row with kind='closing'
  RETURN QUERY
  SELECT
    p_to AS entry_date,
    'closing' AS kind,
    'Closing balance'::text AS reference,
    0 AS amount,
    v_opening + v_closing AS balance_after,
    ''::text AS note,
    NULL::uuid AS user_id,
    NULL::timestamptz AS created_at;
END;
$$;

REVOKE ALL ON FUNCTION public.customer_statement(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.customer_statement(uuid, date, date) TO authenticated;

-- Receivables aging: group outstanding amounts by age buckets
CREATE OR REPLACE FUNCTION public.receivables_aging()
RETURNS TABLE(
  customer_id uuid,
  customer_name text,
  phone text,
  current_due numeric,      -- not yet due
  age_1_30 numeric,         -- 1-30 days overdue
  age_31_60 numeric,        -- 31-60 days overdue
  age_61_90 numeric,        -- 61-90 days overdue
  age_90_plus numeric,      -- 90+ days overdue
  total_outstanding numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id AS customer_id,
    c.name AS customer_name,
    c.phone AS phone,
    coalesce(sum(CASE
      WHEN s.due_date IS NULL OR s.due_date >= public.business_today()
      THEN s.amount_due - s.amount_settled
      ELSE 0
    END), 0) AS current_due,
    coalesce(sum(CASE
      WHEN s.due_date IS NOT NULL
       AND s.due_date < public.business_today()
       AND s.due_date >= public.business_today() - interval '30 days'
      THEN s.amount_due - s.amount_settled
      ELSE 0
    END), 0) AS age_1_30,
    coalesce(sum(CASE
      WHEN s.due_date IS NOT NULL
       AND s.due_date < public.business_today() - interval '30 days'
       AND s.due_date >= public.business_today() - interval '60 days'
      THEN s.amount_due - s.amount_settled
      ELSE 0
    END), 0) AS age_31_60,
    coalesce(sum(CASE
      WHEN s.due_date IS NOT NULL
       AND s.due_date < public.business_today() - interval '60 days'
       AND s.due_date >= public.business_today() - interval '90 days'
      THEN s.amount_due - s.amount_settled
      ELSE 0
    END), 0) AS age_61_90,
    coalesce(sum(CASE
      WHEN s.due_date IS NOT NULL
       AND s.due_date < public.business_today() - interval '90 days'
      THEN s.amount_due - s.amount_settled
      ELSE 0
    END), 0) AS age_90_plus,
    coalesce(sum(s.amount_due - s.amount_settled), 0) AS total_outstanding
  FROM public.customers c
  LEFT JOIN public.sales s ON s.customer_id = c.id
    AND s.status = 'completed'
    AND s.amount_due > s.amount_settled
  WHERE c.active AND c.deleted_at IS NULL AND c.credit_enabled
  GROUP BY c.id, c.name, c.phone
  HAVING coalesce(sum(s.amount_due - s.amount_settled), 0) > 0
  ORDER BY total_outstanding DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.receivables_aging() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.receivables_aging() TO authenticated;

-- Collections report: payments received grouped by date and cashier
CREATE OR REPLACE FUNCTION public.collections_report(p_from date, p_to date)
RETURNS TABLE(
  paid_on date,
  cashier_id uuid,
  cashier_name text,
  total_collected numeric,
  payment_count integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    cp.paid_on,
    cp.cashier_id,
    cp.cashier_name,
    sum(cp.amount) AS total_collected,
    count(*)::integer AS payment_count
  FROM public.customer_payments cp
  WHERE cp.paid_on >= p_from AND cp.paid_on <= p_to
    AND cp.reversed_at IS NULL
  GROUP BY cp.paid_on, cp.cashier_id, cp.cashier_name
  ORDER BY cp.paid_on DESC, total_collected DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.collections_report(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.collections_report(date, date) TO authenticated;
