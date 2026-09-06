-- PRD Section 3 (Petty Cash Staff Role): the custodian's spend form gets an
-- optional receipt attachment, mirroring expense_records' existing columns.
ALTER TABLE `petty_cash_spends` ADD COLUMN `attachmentPath` VARCHAR(512);
ALTER TABLE `petty_cash_spends` ADD COLUMN `attachmentOriginalName` VARCHAR(256);
