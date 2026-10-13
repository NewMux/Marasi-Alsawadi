-- Client feedback (Round 18): General Ledger amend/delete with an audit
-- trail, Cash/Bank corrections (payment-method change, transfer, adjust
-- balance), the Tax Account (VAT) and Security Deposits. Additive only: new
-- tables, and new nullable / defaulted columns. No existing value is
-- changed by this migration — in particular finance_entries.amount (the
-- gross amount every report has used so far) is untouched; the VAT split of
-- existing entries is filled in separately by `pnpm vat:migrate`, which
-- reconciles before applying and can be rolled back (Section 8.4).

-- 4.4 / 4.6.4: append-only audit trail. The app has no endpoint that edits
-- or deletes a row here. oldValues/newValues are JSON snapshots; a deleted
-- transaction's full original record is kept in oldValues.
CREATE TABLE `finance_audit_log` (
  `id` INT AUTO_INCREMENT NOT NULL PRIMARY KEY,
  `action` VARCHAR(40) NOT NULL,
  `recordType` VARCHAR(40) NOT NULL,
  `recordId` INT NULL,
  `reference` VARCHAR(255) NULL,
  `amount` DECIMAL(12,3) NULL,
  `oldValues` LONGTEXT NULL,
  `newValues` LONGTEXT NULL,
  `reason` TEXT NULL,
  `businessDate` DATE NULL,
  `userId` INT NOT NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX `finance_audit_log_created_idx` (`createdAt`),
  INDEX `finance_audit_log_record_idx` (`recordType`, `recordId`)
);

-- 4.6.2 / 4.6.3 / 8.3: money moved between or out of the Cash and Bank
-- accounts that is neither revenue nor an expense: a Cash <-> Bank transfer,
-- a balance adjustment (counting difference, bank charges, interest...),
-- and a VAT payment to the tax authority.
CREATE TABLE `account_movements` (
  `id` INT AUTO_INCREMENT NOT NULL PRIMARY KEY,
  `kind` ENUM('transfer','adjustment','vat_payment') NOT NULL,
  `businessDate` DATE NOT NULL,
  `fromAccount` ENUM('cash','bank') NULL,
  `toAccount` ENUM('cash','bank') NULL,
  `account` ENUM('cash','bank') NULL,
  `direction` ENUM('increase','decrease') NULL,
  `category` VARCHAR(40) NULL,
  `amount` DECIMAL(12,3) NOT NULL,
  `reason` TEXT NOT NULL,
  `vatPeriodFrom` DATE NULL,
  `vatPeriodTo` DATE NULL,
  `createdBy` INT NOT NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX `account_movements_date_idx` (`businessDate`)
);

-- 7.1: a security deposit held against a facility booking. A liability, not
-- revenue; only a deduction becomes income (its own finance entry).
CREATE TABLE `facility_deposits` (
  `id` INT AUTO_INCREMENT NOT NULL PRIMARY KEY,
  `bookingId` INT NOT NULL,
  `amount` DECIMAL(12,3) NOT NULL,
  `paymentMethod` ENUM('cash','card') NOT NULL,
  `businessDate` DATE NOT NULL,
  `status` ENUM('held','returned','returned_partial','forfeited') NOT NULL DEFAULT 'held',
  `refundAmount` DECIMAL(12,3) NULL,
  `deductionAmount` DECIMAL(12,3) NULL,
  `deductionReason` TEXT NULL,
  `refundMethod` ENUM('cash','card') NULL,
  `settledDate` DATE NULL,
  `settledAt` TIMESTAMP NULL,
  `settledBy` INT NULL,
  `deductionFinanceEntryId` INT NULL,
  `createdBy` INT NOT NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX `facility_deposits_booking_idx` (`bookingId`),
  INDEX `facility_deposits_status_idx` (`status`)
);

-- 5.3 / 4.6.1: the payment method a manual transaction was actually made
-- with (Card / Cash / Bank). NULL on existing rows = their paymentAccount
-- (cash / bank) as before.
ALTER TABLE `revenue_records` ADD COLUMN `paymentMethod` ENUM('cash','card','bank') NULL;
ALTER TABLE `expense_records` ADD COLUMN `paymentMethod` ENUM('cash','card','bank') NULL;
ALTER TABLE `asset_records` ADD COLUMN `paymentMethod` ENUM('cash','card','bank') NULL;

-- Section 8: the VAT split of each revenue finance entry. amount stays the
-- gross (what was paid); netAmount + vatAmount = amount. NULL = not yet
-- split (reports then keep using amount, exactly as before).
ALTER TABLE `finance_entries`
  ADD COLUMN `vatAmount` DECIMAL(12,3) NULL,
  ADD COLUMN `netAmount` DECIMAL(12,3) NULL,
  ADD COLUMN `vatSource` VARCHAR(16) NULL,
  ADD COLUMN `vatAppliedAt` TIMESTAMP NULL;

-- 8.1 / 8.5 / 8.7: VAT settings.
ALTER TABLE `system_settings`
  ADD COLUMN `vatRatePercent` DECIMAL(5,2) NOT NULL DEFAULT 5.00,
  ADD COLUMN `vatPeriodStartMonth` INT NOT NULL DEFAULT 1,
  ADD COLUMN `vatStartDate` DATE NOT NULL DEFAULT '2026-10-08',
  ADD COLUMN `vatSettledThrough` DATE NULL;
