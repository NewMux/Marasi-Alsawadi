ALTER TABLE `ticket_purchases`
  ADD COLUMN `status` ENUM('issued','refunded') NOT NULL DEFAULT 'issued',
  ADD COLUMN `refundedAt` TIMESTAMP NULL,
  ADD COLUMN `refundedBy` INT NULL;
