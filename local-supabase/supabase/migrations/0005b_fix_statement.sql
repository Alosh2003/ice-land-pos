-- Recreate customer_statement and collections_report with fixes

DROP FUNCTION IF EXISTS public.customer_statement(uuid, date, date);
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
  SELECT coalesce(sum(amount), 0) INTO v_opening
  FROM public.customer_ledger
  WHERE customer_id = p_customer_id AND entry_date < p_from;

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

  RETURN QUERY
  SELECT
    p_to AS entry_date,
    'closing'::text AS kind,
    'Closing balance'::text AS reference,
    0::numeric AS amount,
    v_opening + v_closing AS balance_after,
    ''::text AS note,
    NULL::uuid AS user_id,
    NULL::timestamptz AS created_at;
END;
$$;

REVOKE ALL ON FUNCTION public.customer_statement(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.customer_statement(uuid, date, date) TO authenticated;

DROP FUNCTION IF EXISTS public.collections_report(date, date);
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
