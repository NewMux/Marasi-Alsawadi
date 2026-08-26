-- Brings `reservations` up to the current schema.ts shape and preserves
-- exact OMR values for accommodation bookings and revenue reports.
--
-- drizzle/0000_chubby_marrow.sql only ever created the original, simpler
-- `reservations` shape (ratePerNight DECIMAL(10,2), plain DATE checkIn/
-- checkOut, no reference/kind/quantity). No migration between 0000 and this
-- one ever brought it up to date with drizzle/schema.ts, so the rename this
-- migration originally assumed (`unitRate` already existing) never actually
-- happened on a real database until this file was first run.
ALTER TABLE `reservations`
  ADD COLUMN `reference` VARCHAR(40) NOT NULL AFTER `id`,
  ADD COLUMN `kind` ENUM('room','chalet','aqua_day_pass') NOT NULL DEFAULT 'room' AFTER `reference`,
  ADD COLUMN `checkInAt` TIMESTAMP NULL AFTER `unitId`,
  ADD COLUMN `checkOutAt` TIMESTAMP NULL AFTER `checkInAt`,
  ADD COLUMN `visitDate` TIMESTAMP NULL AFTER `checkOutAt`,
  ADD COLUMN `quantity` INT NOT NULL DEFAULT 1 AFTER `children`,
  ADD CONSTRAINT `reservations_reference_unique` UNIQUE (`reference`),
  MODIFY COLUMN `unitId` INT NULL,
  CHANGE COLUMN `ratePerNight` `unitRate` DECIMAL(12,2) NOT NULL DEFAULT 0,
  MODIFY COLUMN `totalAmount` DECIMAL(12,2) NOT NULL DEFAULT 0,
  MODIFY COLUMN `source` ENUM('walk_in','phone','online','agent') NOT NULL DEFAULT 'walk_in',
  MODIFY COLUMN `createdBy` INT NOT NULL,
  DROP COLUMN `checkIn`,
  DROP COLUMN `checkOut`;
