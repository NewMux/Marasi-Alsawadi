-- PRD Round 4, Section 6: Fixed Assets Overview & Report — Location (free
-- text), Status (Active/Under Maintenance/Disposed), and an optional
-- Expected Useful Life reference number. No depreciation/net-book-value
-- fields — deliberately out of scope. Asset ID/Tag is derived from `id` at
-- read time, not a stored column.
ALTER TABLE `asset_records` ADD COLUMN `location` VARCHAR(160);
ALTER TABLE `asset_records` ADD COLUMN `status` ENUM('active', 'under_maintenance', 'disposed') NOT NULL DEFAULT 'active';
ALTER TABLE `asset_records` ADD COLUMN `usefulLifeYears` INT;
