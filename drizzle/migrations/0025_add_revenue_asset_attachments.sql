-- PRD Round 3, Section 3: the unified "Record Transaction" form supports an
-- optional attachment for all three category types, not just expenses.
ALTER TABLE `revenue_records` ADD COLUMN `attachmentPath` VARCHAR(512);
ALTER TABLE `revenue_records` ADD COLUMN `attachmentOriginalName` VARCHAR(256);
ALTER TABLE `asset_records` ADD COLUMN `attachmentPath` VARCHAR(512);
ALTER TABLE `asset_records` ADD COLUMN `attachmentOriginalName` VARCHAR(256);
