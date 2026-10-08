-- Client feedback (Round 17, item 5.1): payments are now separated into a
-- Cash Account and a Bank Account (card payments count as Bank). Ticket
-- purchases and facility bookings already store their payment method and
-- mixed Cash/Card/Bank split, so their account is derived from that. Every
-- other money movement gets an explicit account here. Additive only: each
-- column is new, and every existing row takes the default 'cash' — the
-- agreed backfill, matching how Cash Flow has treated them until now. No
-- existing amount, date or other column is changed.
ALTER TABLE `revenue_records` ADD COLUMN `paymentAccount` ENUM('cash','bank') NOT NULL DEFAULT 'cash';
ALTER TABLE `expense_records` ADD COLUMN `paymentAccount` ENUM('cash','bank') NOT NULL DEFAULT 'cash';
ALTER TABLE `asset_records` ADD COLUMN `paymentAccount` ENUM('cash','bank') NOT NULL DEFAULT 'cash';
ALTER TABLE `finance_settlements` ADD COLUMN `paymentAccount` ENUM('cash','bank') NOT NULL DEFAULT 'cash';
ALTER TABLE `cash_flow_adjustments` ADD COLUMN `account` ENUM('cash','bank') NOT NULL DEFAULT 'cash';
