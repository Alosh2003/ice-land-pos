-- ICE LAND local backend — migration 0009: Performance indexes
-- Indexes for common query patterns. Audit logs are queried often and grow over time.

-- Audit log lookups (used by audit page, customer_guard, and audit_products)
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity_created ON public.audit_logs(entity, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_created ON public.audit_logs(user_id, created_at DESC);

-- Product lookup by SKU (products table has unique constraint on sku, so this is not critical but helpful)
CREATE INDEX IF NOT EXISTS idx_products_category_active ON public.products(category_id) WHERE active AND deleted_at IS NULL;

-- Sales: customer + status lookup (used by customer_balances, customer_payment allocations)
CREATE INDEX IF NOT EXISTS idx_sales_customer_status ON public.sales(customer_id, status) WHERE status = 'completed';

-- Stock movements: product + date (used by inventory page)
CREATE INDEX IF NOT EXISTS idx_stock_movements_product_date ON public.stock_movements(product_id, business_date DESC);

-- Daily counts: product + date
CREATE INDEX IF NOT EXISTS idx_daily_counts_product_date ON public.daily_counts(product_id, business_date);

-- Apply
SELECT 'Performance indexes created' AS status;
