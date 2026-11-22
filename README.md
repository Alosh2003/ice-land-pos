# Ice Land

# Project: ICE LAND – Complete POS, Inventory & Accounting Management System

Act as a senior software architect, UI/UX designer, database engineer, and accounting systems specialist.

Build a professional, production-ready web application for an ice cream store called **ICE LAND**.

The application must function as an integrated business management system, combining:
1. Point of Sale (POS).
2. Sales and revenue management.
3. Inventory management.
4. Purchasing and supplier management.
5. Expense management.
6. Cash management.
7. Accounting and financial statements.
8. Business analytics and reporting.

This is not just a dashboard or visual prototype. Build functional workflows with a real database, persistent records, validation, and interconnected modules.

---

# 1. BRAND IDENTITY & DESIGN

Use the provided ICE LAND logo and menu images as the primary design references.

Brand identity:
- Business name: ICE LAND.
- Slogan: IS ALWAYS A GOOD IDEA.
- Primary colors: Turquoise blue and cyan.
- Secondary color: Pink.
- Background: White and very light blue.
- Text: Dark navy.

Design requirements:
- Modern, elegant, clean, and professional interface.
- Premium ice cream shop aesthetic.
- Rounded cards and subtle shadows.
- Consistent spacing and typography.
- Beautiful charts and financial visualizations.
- Fully responsive for desktop, tablets, and mobile.
- Arabic and English language support.
- Arabic must use proper RTL layouts.
- English must use LTR layouts.
- Add a language switcher.
- Currency must be configurable, with Rial as the initial currency.
- Dates and number formats must be configurable.

The interface should look like a commercial SaaS application, not a basic administrative template.

# 2. APPLICATION STRUCTURE

Create a sidebar navigation with these modules:

1. Dashboard
2. Point of Sale
3. Sales
4. Products & Menu
5. Inventory
6. Purchases
7. Suppliers
8. Customers
9. Expenses
10. Cash Management
11. Accounting
12. Reports & Analytics
13. Employees & Users
14. Settings

Each module must have its own functional pages.

# 3. EXECUTIVE DASHBOARD

Create an interactive dashboard displaying:

Financial KPIs:
- Today's Sales.
- Total Sales This Month.
- Total Expenses.
- Gross Profit.
- Net Profit.
- Cash Balance.
- Accounts Receivable.
- Accounts Payable.

Operational KPIs:
- Number of Transactions.
- Average Order Value.
- Best-Selling Product.
- Best-Selling Category.
- Low-Stock Products.
- Inventory Value.

Charts:
- Daily Sales Trend.
- Monthly Revenue Trend.
- Revenue by Product Category.
- Revenue by Payment Method.
- Expenses Breakdown.
- Profitability Trend.
- Top 10 Best-Selling Products.

Add:
- Date range filters.
- Today, Yesterday, This Week, This Month, and Custom Range.
- Comparison with the previous period.
- Recent transactions.
- Recent expenses.
- Low-stock alerts.

All dashboard figures must be calculated from actual database records.

# 4. POINT OF SALE (POS)

This is one of the most important modules.

Build a fast, user-friendly POS interface optimized for counter sales.

Features:

Product selection:
- Display products with images and prices.
- Organize products into categories.
- Search by product name.
- Filter by category.
- Show product availability.
- Allow quick product selection.

Shopping cart:
- Add and remove products.
- Change quantities.
- Edit item prices with appropriate permissions.
- Apply discounts.
- Add order notes.
- Calculate subtotal, discounts, taxes (if enabled), and total automatically.

Payment:
- Cash.
- Other configurable payment methods.
- Split payments.
- Record the amount received.
- Calculate change automatically.
- Support partial payments if enabled.

Order management:
- Generate unique invoice numbers.
- Print receipts.
- Save transaction history.
- Support order cancellation and refunds.
- Record the employee responsible for each transaction.
- Record the exact date and time.
- Allow reprinting receipts.

Every completed sale must automatically:
- Create a sales transaction.
- Update relevant inventory.
- Update cash balances.
- Generate the corresponding accounting entries.
- Update dashboard KPIs.

Prevent duplicate transaction submissions.

# 5. PRODUCTS & MENU MANAGEMENT

Create a product management system with:

- Product name (Arabic and English).
- Product image.
- SKU or product code.
- Category.
- Selling price.
- Cost price.
- Profit margin.
- Stock tracking settings.
- Active/inactive status.
- Description.

Initial categories based on the supplied menu:

A. Ice Cream
B. Special Ice Cream Flavors
C. Milkshakes
D. Sour Milkshakes

Import the initial menu as editable sample products using the supplied menu images.

Use these menu prices as initial reference values:
- Standard ice cream flavors: 400 Rial.
- Other/special ice cream flavors: 500 Rial.
- Milkshakes: 1,200 Rial.
- Sour milkshakes: 1,200 Rial.

Include the following products as initial examples:
- Apple
- Berry
- Mango
- Cherry
- Strawberry
- Galaxy
- Lotus
- Toffee
- Caramel
- Vanilla
- Pistachio
- Cookies
- Snickers
- Italian
- Cheesecake Berry
- Cheesecake Strawberry

Preserve the Arabic product names from the supplied menu where possible. Allow the administrator to correct or complete names and prices.

Do not assume every flavor has the same inventory cost.

# 6. INVENTORY MANAGEMENT

Create an inventory system suitable for an ice cream business.

Support two types of inventory:

A. Finished Products:
- Ready-to-sell products.
- Quantity available.
- Minimum stock level.
- Cost per unit.

B. Raw Materials and Ingredients:
- Milk.
- Cream.
- Sugar.
- Ice cream bases.
- Fruits.
- Chocolate.
- Syrups.
- Nuts.
- Cups.
- Cones.
- Spoons.
- Packaging materials.

Inventory functions:
- Record stock purchases.
- Record stock consumption.
- Record stock adjustments.
- Record damaged or wasted materials.
- Track expiry dates.
- Track stock movements.
- Set minimum stock alerts.
- Calculate inventory valuation.

Implement an optional recipe/BOM system.

For example, a product can have a recipe containing:
- Ice cream quantity.
- Milk quantity.
- Chocolate quantity.
- Cup quantity.

When a product is sold, deduct the associated ingredients automatically according to its recipe.

Allow recipe quantities to be configured by the administrator.

Never deduct ingredients for products without an assigned recipe.

# 7. PURCHASING & SUPPLIERS

Build purchasing management.

Supplier records:
- Supplier name.
- Contact information.
- Address.
- Opening balance.
- Current balance.

Purchase management:
- Create purchase orders.
- Record purchased items.
- Record quantities.
- Record unit costs.
- Record discounts.
- Record additional costs.
- Record payment status.
- Support paid, partially paid, and unpaid purchases.
- Attach invoice references.
- Record purchase dates.

When a purchase is confirmed:
- Update inventory.
- Update accounts payable.
- Update cash or bank balances based on payment.
- Generate accounting entries.

# 8. EXPENSE MANAGEMENT

Create an expense management module.

Initial expense categories:
- Rent.
- Electricity.
- Water.
- Salaries.
- Transportation.
- Maintenance.
- Packaging.
- Marketing.
- Cleaning.
- Equipment.
- Miscellaneous.

Allow custom expense categories.

Each expense should include:
- Expense title.
- Category.
- Amount.
- Date.
- Payment method.
- Description.
- Receipt attachment.
- Employee who recorded it.

Expenses must automatically affect the appropriate accounting accounts and profit calculations.

Support recurring expenses and monthly expense summaries.

# 9. CASH MANAGEMENT

Create a cash management system.

Features:
- Cash register.
- Opening cash balance.
- Cash inflows.
- Cash outflows.
- Cash transfers.
- Cash withdrawals.
- Cash deposits.
- Closing cash balance.
- Daily cash reconciliation.

Implement employee cash shifts:

At the beginning of each shift:
- Record opening cash.

During the shift:
- Record cash sales.
- Record cash expenses.
- Record withdrawals and deposits.

At closing:
- Calculate expected cash.
- Allow employee to enter actual cash counted.
- Calculate cash differences.
- Record shortages or overages.
- Require explanations for discrepancies.

Keep a complete cash movement history.

# 10. ACCOUNTING MODULE

Implement a proper double-entry accounting system.

Create a configurable Chart of Accounts.

Default account structure:

Assets:
- Cash.
- Bank.
- Inventory.
- Accounts Receivable.
- Equipment.

Liabilities:
- Accounts Payable.
- Outstanding Expenses.

Equity:
- Owner's Capital.
- Retained Earnings.

Revenue:
- Ice Cream Sales.
- Milkshake Sales.
- Other Revenue.

Cost of Goods Sold:
- Product Cost.
- Ingredient Consumption.

Expenses:
- Rent.
- Salaries.
- Utilities.
- Marketing.
- Maintenance.
- Other Expenses.

Accounting functionality:

1. Journal Entries.
2. General Ledger.
3. Trial Balance.
4. Accounts Receivable.
5. Accounts Payable.
6. Income Statement.
7. Balance Sheet.
8. Cash Flow Statement.

Every financial transaction must generate balanced journal entries.

Examples:

Cash sale:
- Debit Cash.
- Credit Sales Revenue.

Inventory consumption:
- Debit Cost of Goods Sold.
- Credit Inventory.

Expense paid in cash:
- Debit Expense Account.
- Credit Cash.

Purchase on credit:
- Debit Inventory.
- Credit Accounts Payable.

Implement automatic journal entry generation for sales, purchases, payments, refunds, and expenses.

Every journal entry must satisfy:
Total Debits = Total Credits.

Never allow users to edit or delete posted accounting entries without proper authorization and an audit trail.

Support accounting periods and period closing.

# 11. CUSTOMERS & EMPLOYEES

Customers:
- Customer name.
- Phone number.
- Total purchases.
- Transaction history.
- Outstanding balance, if applicable.

Employees:
- Employee name.
- Username.
- Role.
- Status.
- Login history.

Roles and permissions:

Administrator:
Full access.

Manager:
Access to operations, reports, and approved financial functions.

Cashier:
POS and assigned cash register operations.

Accountant:
Accounting, expenses, purchasing, and financial reports.

Implement role-based access control and restrict sensitive operations.

# 12. REPORTS & ANALYTICS

Create a dedicated reporting center.

Sales reports:
- Daily sales.
- Weekly sales.
- Monthly sales.
- Annual sales.
- Sales by product.
- Sales by category.
- Sales by employee.
- Sales by payment method.

Financial reports:
- Profit and Loss.
- Balance Sheet.
- Cash Flow.
- Trial Balance.
- General Ledger.
- Expense Analysis.
- Gross Profit.
- Net Profit.

Inventory reports:
- Current stock.
- Inventory valuation.
- Stock movement.
- Wastage.
- Low-stock products.
- Expiring products.

Business performance:
- Average transaction value.
- Sales growth.
- Product profitability.
- Revenue distribution.
- Expense-to-revenue ratio.
- Gross profit margin.
- Net profit margin.

Allow filtering and exporting reports to Excel, CSV, and PDF.

# 13. DATABASE & BACKEND

Use Supabase as the backend.

Implement:
- PostgreSQL database.
- Supabase Authentication.
- Row Level Security (RLS).
- Secure role-based permissions.
- Persistent database storage.
- Proper foreign-key relationships.
- Database constraints.
- Data validation.
- Audit logs.

Create normalized database tables for:

- users
- roles
- permissions
- employees
- products
- categories
- recipes
- ingredients
- inventory
- stock_movements
- suppliers
- purchases
- purchase_items
- customers
- sales
- sale_items
- payments
- expenses
- expense_categories
- cash_registers
- cash_shifts
- cash_movements
- accounts
- journal_entries
- journal_entry_lines
- accounting_periods
- audit_logs

Use database transactions for critical operations such as sales, inventory deductions, and accounting postings.

Ensure that failed operations do not leave partially updated financial records.

# 14. SYSTEM SETTINGS

Allow the administrator to configure:

- Store name and logo.
- Store address and contact information.
- Currency.
- Language.
- Date format.
- Receipt design.
- Tax settings.
- Discount permissions.
- Payment methods.
- Product categories.
- Expense categories.
- Inventory thresholds.
- User permissions.
- Accounting settings.

Tax must be configurable and disabled by default until the administrator enables it.

# 15. SECURITY & DATA INTEGRITY

Important requirements:

- Authenticate all users.
- Apply appropriate database permissions.
- Prevent unauthorized financial modifications.
- Validate all monetary inputs.
- Prevent negative inventory unless explicitly authorized.
- Use unique invoice numbers.
- Maintain complete audit logs.
- Track who created, updated, approved, or reversed transactions.
- Use soft deletion where appropriate.
- Never silently delete financial history.
- Provide a backup and recovery strategy.

# 16. USER EXPERIENCE

Prioritize operational efficiency.

The cashier must be able to complete a normal sale in a few clicks.

The accountant must be able to trace any financial figure back to its original transaction.

The manager must understand the store's financial and operational performance from the dashboard.

Provide:
- Search.
- Sorting.
- Filtering.
- Pagination.
- Clear loading states.
- Error messages.
- Success notifications.
- Confirmation dialogs for sensitive operations.
- Empty states.
- Printable documents.

# 17. IMPLEMENTATION STRATEGY

Build the application in stages while maintaining one consistent architecture.

Phase 1:
- Branding.
- Authentication.
- Dashboard.
- Product management.
- POS.
- Sales history.

Phase 2:
- Inventory.
- Recipes.
- Suppliers.
- Purchases.
- Expenses.

Phase 3:
- Cash management.
- Double-entry accounting.
- Financial statements.

Phase 4:
- Advanced analytics.
- Reports.
- Employee permissions.
- Audit logs.
- System settings.

Do not create fake functionality or buttons that do nothing.

Do not use hardcoded dashboard numbers as if they were real financial data.

Use realistic sample data only in a clearly identified demo environment.

Before considering the project complete, test:
1. Creating a product.
2. Completing a sale.
3. Updating inventory.
4. Recording a purchase.
5. Recording an expense.
6. Closing a cash shift.
7. Generating journal entries.
8. Generating a Profit and Loss statement.
9. Verifying that debits equal credits.
10. Verifying that dashboard figures match the underlying transactions.

FINAL OBJECTIVE:

Deliver a complete, reliable, scalable, and visually impressive accounting and store management system for ICE LAND.

The application must be easy enough for a cashier to use daily while providing the financial controls and reporting required by a professional accountant or business owner.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://ice-land.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/579c6ea7-b39b-4e53-9f76-0d2512273584).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
