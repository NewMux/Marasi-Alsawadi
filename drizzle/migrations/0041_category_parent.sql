-- Client feedback (Round 16, item 2): a main category can have
-- sub-categories under it (e.g. "Salaries" -> "Full-time salaries"). One
-- level deep only; NULL means a main/top-level category, so every existing
-- category stays exactly as it is today.
ALTER TABLE `expense_categories` ADD COLUMN `parentId` INT NULL;
ALTER TABLE `revenue_categories` ADD COLUMN `parentId` INT NULL;
ALTER TABLE `asset_categories` ADD COLUMN `parentId` INT NULL;
