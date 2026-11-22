-- ICE LAND local backend — migration 0011: Earn loyalty points on sales

CREATE OR REPLACE FUNCTION public.earn_loyalty_points() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  -- Award points when a sale is first completed or fully paid (amount_due becomes 0)
  IF NEW.status = 'completed' AND NEW.customer_id IS NOT NULL
     AND (OLD.status <> 'completed' OR OLD.amount_due > 0) THEN
    UPDATE public.customers SET loyalty_points = loyalty_points + NEW.total
    WHERE id = NEW.customer_id AND active AND deleted_at IS NULL;
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS sales_loyalty ON public.sales;
CREATE TRIGGER sales_loyalty AFTER UPDATE ON public.sales
  FOR EACH ROW EXECUTE FUNCTION public.earn_loyalty_points();

SELECT 'Loyalty earn-on-sale trigger installed' AS status;
