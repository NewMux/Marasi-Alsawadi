-- PRD Round 5: (1)/(2) any number of attachments per expense/revenue/asset
-- entry, available on both create and edit. (3) a discrete log of every
-- petty cash top-up/allocation, separate from the existing spend log.
CREATE TABLE `attachments` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `entryType` ENUM('expense', 'revenue', 'asset') NOT NULL,
  `entryId` INT NOT NULL,
  `path` VARCHAR(512) NOT NULL,
  `originalName` VARCHAR(256) NOT NULL,
  `uploadedBy` INT NOT NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX `attachments_entry_idx` ON `attachments` (`entryType`, `entryId`);

CREATE TABLE `petty_cash_allocations` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `fundId` INT NOT NULL,
  `amount` DECIMAL(12, 3) NOT NULL,
  `note` VARCHAR(256),
  `createdBy` INT NOT NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX `petty_cash_allocations_fund_idx` ON `petty_cash_allocations` (`fundId`);
