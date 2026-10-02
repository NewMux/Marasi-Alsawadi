-- Client feedback (Round 16, item 4): every Finance Control transaction now
-- carries Total / Paid / Balance. The existing `amount` column stays exactly
-- as it is and IS the Total — nothing is removed or replaced. Every record
-- already in the system was recorded as a complete transaction, so it is
-- backfilled as fully paid: Paid = its current amount, Balance = 0. No
-- existing figure changes. (`updatedAt` is set to itself so the backfill
-- leaves each record's last-edited time untouched.)
ALTER TABLE `expense_records` ADD COLUMN `paidAmount` DECIMAL(12,3) NULL, ADD COLUMN `balanceAmount` DECIMAL(12,3) NOT NULL DEFAULT 0;
ALTER TABLE `revenue_records` ADD COLUMN `paidAmount` DECIMAL(12,3) NULL, ADD COLUMN `balanceAmount` DECIMAL(12,3) NOT NULL DEFAULT 0;
ALTER TABLE `asset_records` ADD COLUMN `paidAmount` DECIMAL(12,3) NULL, ADD COLUMN `balanceAmount` DECIMAL(12,3) NOT NULL DEFAULT 0;
UPDATE `expense_records` SET `paidAmount` = `amount`, `updatedAt` = `updatedAt` WHERE `paidAmount` IS NULL;
UPDATE `revenue_records` SET `paidAmount` = `amount`, `updatedAt` = `updatedAt` WHERE `paidAmount` IS NULL;
UPDATE `asset_records` SET `paidAmount` = `amount`, `updatedAt` = `updatedAt` WHERE `paidAmount` IS NULL;
