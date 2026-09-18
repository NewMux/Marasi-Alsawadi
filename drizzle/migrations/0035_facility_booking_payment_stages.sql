-- Client feedback (Round 14, Section 5): facility bookings move from a
-- single "confirmed at creation" step to a two-stage Booking -> Payment
-- flow. "confirmed" now only ever means paid; a brand new booking starts
-- as "booking" (awaiting payment, no revenue posted yet). cancelKind
-- distinguishes a staff-initiated cancel from the automatic unpaid-window
-- sweep. paidAt/paidBy record when Add Payment actually ran, separate from
-- createdAt/createdBy (when the booking itself was first made).
ALTER TABLE `facility_bookings`
  MODIFY COLUMN `status` ENUM('booking', 'confirmed', 'cancelled') NOT NULL DEFAULT 'confirmed',
  ADD COLUMN `cancelKind` ENUM('manual', 'auto'),
  ADD COLUMN `paidAt` TIMESTAMP NULL,
  ADD COLUMN `paidBy` INT;

-- Stage 3: Admin-configurable auto-cancellation window + on/off toggle,
-- a singleton settings row (same pattern as ticket_number_sequences).
CREATE TABLE IF NOT EXISTS `facility_booking_settings` (
  `id` INT NOT NULL DEFAULT 1 PRIMARY KEY,
  `autoCancelEnabled` BOOLEAN NOT NULL DEFAULT FALSE,
  `autoCancelHours` INT NOT NULL DEFAULT 24,
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
INSERT INTO `facility_booking_settings` (`id`) VALUES (1);
