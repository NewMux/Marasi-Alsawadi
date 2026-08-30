-- 0013 created revenue_categories/revenue_records using drizzle-kit's
-- `DEFAULT (now())` expression-default syntax on both createdAt AND
-- updatedAt. Every other table in this project that has both columns
-- (expense_categories, expense_records, from 0003) uses the older, more
-- broadly-supported `DEFAULT CURRENT_TIMESTAMP` / `ON UPDATE
-- CURRENT_TIMESTAMP` form instead, and inserts into revenue_categories
-- were failing in production while the equivalent expense_categories
-- insert works fine — the one concrete DDL difference between them.
-- Both tables are empty (every insert attempt so far has failed), so a
-- clean drop and recreate is safe here.
DROP TABLE IF EXISTS `revenue_records`;
DROP TABLE IF EXISTS `revenue_categories`;

CREATE TABLE `revenue_categories` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(160) NOT NULL,
  `code` varchar(32) NOT NULL,
  `isActive` boolean NOT NULL DEFAULT true,
  `createdBy` int NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  CONSTRAINT `revenue_categories_name_unique` UNIQUE (`name`),
  CONSTRAINT `revenue_categories_code_unique` UNIQUE (`code`)
);

CREATE TABLE `revenue_records` (
  `id` int NOT NULL AUTO_INCREMENT,
  `businessDate` date NOT NULL,
  `categoryId` int,
  `categoryName` varchar(96) NOT NULL,
  `amount` decimal(12,3) NOT NULL,
  `source` varchar(128),
  `description` varchar(256) NOT NULL,
  `receiptNumber` varchar(64),
  `financeEntryId` int,
  `createdBy` int NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
);
