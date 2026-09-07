-- PRD Round 4, Section 5: Partner/Entity Discounts extended to Facility
-- Bookings, with multiple discount rules per entity (one per ticket type or
-- facility, each with its own validity window) replacing the old single
-- flat percentage.
CREATE TABLE `partner_discount_rules` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `partnerEntityId` INT NOT NULL,
  `appliesTo` ENUM('ticket_type', 'facility') NOT NULL,
  `ticketType` ENUM('waterpark', 'companion'),
  `facilityTypeId` INT,
  `facilityTypeName` VARCHAR(160),
  `discountPercentage` DECIMAL(5, 2) NOT NULL,
  `validFrom` DATE NOT NULL,
  `validUntil` DATE NOT NULL,
  `isActive` BOOLEAN NOT NULL DEFAULT TRUE,
  `createdBy` INT NOT NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

ALTER TABLE `partner_entities` DROP COLUMN `discountPercentage`;

ALTER TABLE `facility_bookings` ADD COLUMN `partnerEntityId` INT;
ALTER TABLE `facility_bookings` ADD COLUMN `partnerEntityName` VARCHAR(160);
ALTER TABLE `facility_bookings` ADD COLUMN `discountPercentage` DECIMAL(5, 2);
