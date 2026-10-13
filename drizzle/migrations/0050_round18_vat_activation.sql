-- PRD Round 18, Section 8.4: revenue is only split into net + VAT once the
-- migration of existing transactions has been applied (and passed every
-- reconciliation check). Until then nothing changes: new entries stay gross
-- like the old ones, so reports never mix gross and net. NULL = not active.
ALTER TABLE `system_settings`
  ADD COLUMN `vatActivatedAt` TIMESTAMP NULL,
  ADD COLUMN `vatActivatedBy` INT NULL;
