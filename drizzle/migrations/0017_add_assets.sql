CREATE TABLE `asset_categories` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(160) NOT NULL,
  `code` VARCHAR(32) NOT NULL,
  `isActive` BOOLEAN NOT NULL DEFAULT TRUE,
  `createdBy` INT NOT NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `asset_categories_name_unique` (`name`),
  UNIQUE KEY `asset_categories_code_unique` (`code`)
);

CREATE TABLE `asset_records` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `businessDate` DATE NOT NULL,
  `categoryId` INT NULL,
  `categoryName` VARCHAR(96) NOT NULL,
  `amount` DECIMAL(12,3) NOT NULL,
  `vendor` VARCHAR(128) NULL,
  `description` VARCHAR(256) NOT NULL,
  `receiptNumber` VARCHAR(64) NULL,
  `createdBy` INT NOT NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
);

CREATE TABLE `asset_adjustments` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `businessDate` DATE NOT NULL,
  `categoryId` INT NOT NULL,
  `categoryName` VARCHAR(160) NOT NULL,
  `type` ENUM('add','deduct','transfer_out','transfer_in') NOT NULL,
  `amount` DECIMAL(12,3) NOT NULL,
  `relatedCategoryId` INT NULL,
  `relatedCategoryName` VARCHAR(160) NULL,
  `note` VARCHAR(512) NULL,
  `createdBy` INT NOT NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
);

-- Seed the resort's actual capital-asset categories (Super Admin can still
-- add/edit/remove afterward from Commercial Settings, same as expense/revenue
-- categories).
INSERT INTO `asset_categories` (`name`, `code`, `isActive`, `createdBy`)
SELECT 'Fixed Assets', 'FIXED_ASSETS', TRUE, 1
WHERE NOT EXISTS (SELECT 1 FROM `asset_categories` WHERE `code` = 'FIXED_ASSETS');

INSERT INTO `asset_categories` (`name`, `code`, `isActive`, `createdBy`)
SELECT 'Fixtures & Furniture', 'FIXTURES', TRUE, 1
WHERE NOT EXISTS (SELECT 1 FROM `asset_categories` WHERE `code` = 'FIXTURES');

INSERT INTO `asset_categories` (`name`, `code`, `isActive`, `createdBy`)
SELECT 'Waterpark Infrastructure', 'WATERPARK_INFRA', TRUE, 1
WHERE NOT EXISTS (SELECT 1 FROM `asset_categories` WHERE `code` = 'WATERPARK_INFRA');

-- Fixtures & Furniture is a capital asset, not a period expense — retire the
-- old expense category so it no longer appears for new expense entries.
-- Existing expense records already logged under it are left untouched, so
-- historical Net Result stays exactly as previously reported; only new
-- fixture/furniture purchases go through the Assets ledger from here on.
UPDATE `expense_categories` SET `isActive` = FALSE WHERE `code` = 'FIXTURE_FURNITURE';
