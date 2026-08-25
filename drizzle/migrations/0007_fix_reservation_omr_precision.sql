-- Preserve exact OMR values for accommodation bookings and revenue reports.
ALTER TABLE `reservations`
  MODIFY COLUMN `unitRate` DECIMAL(12,2) NOT NULL DEFAULT 0,
  MODIFY COLUMN `totalAmount` DECIMAL(12,2) NOT NULL DEFAULT 0;
