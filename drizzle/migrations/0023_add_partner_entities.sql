-- PRD Section 2: Partner/Entity Discounts. Admin registers partner
-- organizations (Royal Court, government bodies, etc.) each with their own
-- discount percentage; selecting one on a purchase replaces the automatic
-- group-size discount tier for that whole purchase.
CREATE TABLE `partner_entities` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(160) NOT NULL UNIQUE,
  `discountPercentage` DECIMAL(5, 2) NOT NULL,
  `isActive` BOOLEAN NOT NULL DEFAULT TRUE,
  `createdBy` INT NOT NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

ALTER TABLE `ticket_purchases` ADD COLUMN `partnerEntityId` INT;
ALTER TABLE `ticket_purchases` ADD COLUMN `partnerEntityName` VARCHAR(160);
