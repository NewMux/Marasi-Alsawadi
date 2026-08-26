-- Client-requested Expense Management update: receipt number + optional
-- attachment on each expense entry, and the client's actual accounting-sheet
-- category list pre-populated (Super Admin can still add/remove afterward).

ALTER TABLE expense_records
  ADD COLUMN receiptNumber VARCHAR(64) NULL AFTER description,
  ADD COLUMN attachmentPath VARCHAR(512) NULL AFTER receiptNumber,
  ADD COLUMN attachmentOriginalName VARCHAR(256) NULL AFTER attachmentPath;

-- The client's "Petty Cash" category name (with its full list of examples)
-- is 124 characters — wider than the original 96-char limit.
ALTER TABLE expense_categories MODIFY COLUMN name VARCHAR(160) NOT NULL;

INSERT INTO expense_categories (name, code, isActive, createdBy)
SELECT 'Salaries (Full Time / Part Time / Over Time / Freelance)', 'SALARIES', TRUE, 1
WHERE NOT EXISTS (SELECT 1 FROM expense_categories WHERE code = 'SALARIES');

INSERT INTO expense_categories (name, code, isActive, createdBy)
SELECT 'Utilities (Electricity / Water / Telephone / Internet)', 'UTILITIES', TRUE, 1
WHERE NOT EXISTS (SELECT 1 FROM expense_categories WHERE code = 'UTILITIES');

INSERT INTO expense_categories (name, code, isActive, createdBy)
SELECT 'Maintenance', 'MAINTENANCE', TRUE, 1
WHERE NOT EXISTS (SELECT 1 FROM expense_categories WHERE code = 'MAINTENANCE');

INSERT INTO expense_categories (name, code, isActive, createdBy)
SELECT 'COGS (Chlorine, Paint, etc.)', 'COGS', TRUE, 1
WHERE NOT EXISTS (SELECT 1 FROM expense_categories WHERE code = 'COGS');

INSERT INTO expense_categories (name, code, isActive, createdBy)
SELECT 'Advertising & Marketing', 'ADVERTISING_MARKETING', TRUE, 1
WHERE NOT EXISTS (SELECT 1 FROM expense_categories WHERE code = 'ADVERTISING_MARKETING');

INSERT INTO expense_categories (name, code, isActive, createdBy)
SELECT 'Office Supplies', 'OFFICE_SUPPLIES', TRUE, 1
WHERE NOT EXISTS (SELECT 1 FROM expense_categories WHERE code = 'OFFICE_SUPPLIES');

INSERT INTO expense_categories (name, code, isActive, createdBy)
SELECT 'Fixture & Furniture', 'FIXTURE_FURNITURE', TRUE, 1
WHERE NOT EXISTS (SELECT 1 FROM expense_categories WHERE code = 'FIXTURE_FURNITURE');

INSERT INTO expense_categories (name, code, isActive, createdBy)
SELECT 'Tax & VAT (Municipality 3% / Tourism 4% / VAT 5%)', 'TAX_VAT', TRUE, 1
WHERE NOT EXISTS (SELECT 1 FROM expense_categories WHERE code = 'TAX_VAT');

INSERT INTO expense_categories (name, code, isActive, createdBy)
SELECT 'Petty Cash (cleaning labor, ticket printing, external labor, gardening labor, cleaning tools, maintenance tools, fuel, etc.)', 'PETTY_CASH', TRUE, 1
WHERE NOT EXISTS (SELECT 1 FROM expense_categories WHERE code = 'PETTY_CASH');

INSERT INTO expense_categories (name, code, isActive, createdBy)
SELECT 'Other Expenses', 'OTHER_EXPENSES', TRUE, 1
WHERE NOT EXISTS (SELECT 1 FROM expense_categories WHERE code = 'OTHER_EXPENSES');
