ALTER TABLE `users`
  MODIFY COLUMN `role` enum('staff','manager','admin','guard','super_admin','petty_cash') NOT NULL DEFAULT 'staff';

CREATE TABLE `petty_cash_funds` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `custodianUserId` INT NOT NULL,
  `fixedAmount` DECIMAL(12,3) NOT NULL,
  `isActive` BOOLEAN NOT NULL DEFAULT TRUE,
  `createdBy` INT NOT NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `petty_cash_funds_custodian_unique` (`custodianUserId`)
);

CREATE TABLE `petty_cash_spends` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `fundId` INT NOT NULL,
  `businessDate` DATE NOT NULL,
  `amount` DECIMAL(12,3) NOT NULL,
  `description` VARCHAR(256) NOT NULL,
  `expenseRecordId` INT NULL,
  `createdBy` INT NOT NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
);
