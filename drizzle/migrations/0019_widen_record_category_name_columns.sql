-- expense_categories.name/revenue_categories.name/asset_categories.name allow
-- up to 160 characters (widened in 0009 for the client's 124-character "Petty
-- Cash" category name), but the denormalized categoryName copy stored on
-- each expense/revenue/asset record was never widened to match — so any
-- record entered against a category with a name over 96 characters fails
-- outright. This aligns all three *_records tables with their category
-- tables' actual 160-character limit.
ALTER TABLE `expense_records` MODIFY COLUMN `categoryName` VARCHAR(160) NOT NULL;
ALTER TABLE `revenue_records` MODIFY COLUMN `categoryName` VARCHAR(160) NOT NULL;
ALTER TABLE `asset_records` MODIFY COLUMN `categoryName` VARCHAR(160) NOT NULL;
