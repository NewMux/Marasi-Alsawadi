-- Client feedback (Round 17, item 5.3): Facility Types get the same
-- main-category / sub-category grouping as Expense, Revenue and Capital
-- Expenditure categories. A new table holds the categories (one level of
-- sub-categories, like Round 16); pricing method, VAT and auto-cancel stay
-- on each Facility Type. The new link column is nullable, so every existing
-- Facility Type stays exactly as it is ("uncategorised") until the Admin
-- assigns one.
CREATE TABLE `facility_categories` (
  `id` INT AUTO_INCREMENT NOT NULL PRIMARY KEY,
  `name` VARCHAR(160) NOT NULL,
  `code` VARCHAR(32) NOT NULL,
  `parentId` INT NULL,
  `isActive` BOOLEAN NOT NULL DEFAULT TRUE,
  `createdBy` INT NOT NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `facility_categories_name_unique` UNIQUE (`name`),
  CONSTRAINT `facility_categories_code_unique` UNIQUE (`code`)
);
ALTER TABLE `facility_types` ADD COLUMN `facilityCategoryId` INT NULL;
