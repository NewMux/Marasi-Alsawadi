-- PRD Round 7, Section 1: fully Admin-manageable ticket types (grouped
-- "Water Park" / "Other Tickets") and visitor categories, with an editable
-- price for every Ticket Type x Category combination — replacing the old
-- fixed waterpark/companion ticketType enum and the hardcoded-free
-- under_two/person_of_determination/senior categories. Historical purchase
-- lines keep their legacy ticketType/freeEntryCategory columns (now
-- nullable, no longer written) since their basePrice/label are already
-- snapshotted and never re-derived from these lookup tables.
CREATE TABLE `ticket_types` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(128) NOT NULL,
  `code` VARCHAR(48) NOT NULL UNIQUE,
  `ticketGroup` ENUM('water_park', 'other_tickets') NOT NULL DEFAULT 'water_park',
  `isActive` BOOLEAN NOT NULL DEFAULT TRUE,
  `createdBy` INT NOT NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE `visitor_categories` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(128) NOT NULL,
  `code` VARCHAR(48) NOT NULL UNIQUE,
  `displayOrder` INT NOT NULL DEFAULT 0,
  `isActive` BOOLEAN NOT NULL DEFAULT TRUE,
  `createdBy` INT NOT NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE `ticket_prices` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `ticketTypeId` INT NOT NULL,
  `categoryId` INT NOT NULL,
  `unitPrice` DECIMAL(12, 3) NOT NULL DEFAULT 0,
  `isActive` BOOLEAN NOT NULL DEFAULT TRUE,
  `createdBy` INT NOT NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `ticket_prices_type_category_unique` (`ticketTypeId`, `categoryId`)
);
CREATE INDEX `ticket_prices_type_idx` ON `ticket_prices` (`ticketTypeId`);

SET @admin_id = COALESCE((SELECT MIN(`id`) FROM `users`), 1);

-- Seed the one existing ticket type ("Water Park Entry") and the 5 visitor
-- categories the system already effectively used, carrying forward their
-- current prices as the initial matrix (Companion's serviceRates price
-- becomes the Water Park Entry x Companion cell; the 3 previously-hardcoded
-- -free categories seed at 0, exactly matching today's behavior).
INSERT INTO `ticket_types` (`name`, `code`, `ticketGroup`, `createdBy`)
VALUES ('Water Park Entry', 'WATER_PARK_ENTRY', 'water_park', @admin_id);
SET @water_park_entry_id = LAST_INSERT_ID();

INSERT INTO `visitor_categories` (`name`, `code`, `displayOrder`, `createdBy`) VALUES
  ('Chargeable', 'CHARGEABLE', 0, @admin_id),
  ('Companion', 'COMPANION', 1, @admin_id),
  ('Retiree', 'RETIREE', 2, @admin_id),
  ('Special Needs', 'SPECIAL_NEEDS', 3, @admin_id),
  ('Under 2', 'UNDER_TWO', 4, @admin_id);

SET @chargeable_id = (SELECT `id` FROM `visitor_categories` WHERE `code` = 'CHARGEABLE');
SET @companion_id = (SELECT `id` FROM `visitor_categories` WHERE `code` = 'COMPANION');
SET @retiree_id = (SELECT `id` FROM `visitor_categories` WHERE `code` = 'RETIREE');
SET @special_needs_id = (SELECT `id` FROM `visitor_categories` WHERE `code` = 'SPECIAL_NEEDS');
SET @under_two_id = (SELECT `id` FROM `visitor_categories` WHERE `code` = 'UNDER_TWO');

INSERT INTO `ticket_prices` (`ticketTypeId`, `categoryId`, `unitPrice`, `createdBy`)
SELECT @water_park_entry_id, @chargeable_id, COALESCE((SELECT `unitPrice` FROM `service_rates` WHERE `department` = 'aqua_park' AND `ticketType` = 'waterpark' AND `isActive` = TRUE ORDER BY `id` LIMIT 1), 0), @admin_id;
INSERT INTO `ticket_prices` (`ticketTypeId`, `categoryId`, `unitPrice`, `createdBy`)
SELECT @water_park_entry_id, @companion_id, COALESCE((SELECT `unitPrice` FROM `service_rates` WHERE `department` = 'aqua_park' AND `ticketType` = 'companion' AND `isActive` = TRUE ORDER BY `id` LIMIT 1), 0), @admin_id;
INSERT INTO `ticket_prices` (`ticketTypeId`, `categoryId`, `unitPrice`, `createdBy`)
VALUES (@water_park_entry_id, @retiree_id, 0, @admin_id), (@water_park_entry_id, @special_needs_id, 0, @admin_id), (@water_park_entry_id, @under_two_id, 0, @admin_id);

-- Ticket purchase lines: add the new FK-ish columns, loosen the legacy enum
-- columns (kept for historical rows only, no longer written by new code).
ALTER TABLE `ticket_purchase_lines` ADD COLUMN `ticketTypeId` INT;
ALTER TABLE `ticket_purchase_lines` ADD COLUMN `categoryId` INT;
ALTER TABLE `ticket_purchase_lines` MODIFY COLUMN `ticketType` ENUM('waterpark', 'companion') NULL;
ALTER TABLE `ticket_purchase_lines` MODIFY COLUMN `freeEntryCategory` ENUM('under_two', 'person_of_determination', 'senior') NULL;

UPDATE `ticket_purchase_lines` SET `ticketTypeId` = @water_park_entry_id,
  `categoryId` = CASE
    WHEN `freeEntryCategory` = 'senior' THEN @retiree_id
    WHEN `freeEntryCategory` = 'person_of_determination' THEN @special_needs_id
    WHEN `freeEntryCategory` = 'under_two' THEN @under_two_id
    WHEN `ticketType` = 'companion' THEN @companion_id
    ELSE @chargeable_id
  END
WHERE `ticketTypeId` IS NULL;

-- Fees were assigned per serviceRates row (one per legacy ticketType); they
-- now apply per Ticket Type instead (both former rates collapse into the
-- one "Water Park Entry" type), so remap service_rate_fees.rateId from the
-- old serviceRates ids onto the new ticketTypeId.
UPDATE `service_rate_fees` `srf`
JOIN `service_rates` `sr` ON `sr`.`id` = `srf`.`rateId`
SET `srf`.`rateId` = @water_park_entry_id
WHERE `sr`.`department` = 'aqua_park' AND `sr`.`ticketType` IN ('waterpark', 'companion');

-- Partner/Entity Discounts "Applies To -> Ticket Type": extend to the new
-- dynamic ticket type list (Section 1.4).
ALTER TABLE `partner_discount_rules` ADD COLUMN `ticketTypeId` INT;
UPDATE `partner_discount_rules` SET `ticketTypeId` = @water_park_entry_id WHERE `appliesTo` = 'ticket_type' AND `ticketTypeId` IS NULL;

-- Facility Bookings (Section 3): purchaser name editable after creation via
-- the existing Edit action.
-- (facility_bookings.customerName already exists and is nullable — no
-- column change needed, only the Edit form/mutation gain the field.)
