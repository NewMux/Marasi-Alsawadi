-- PRD Round 4, Section 9: Facility Bookings — link to Customer Directory
-- (phone-first, same as Ticket Desk), Payment Method, editable date/duration,
-- and a Confirmed/Cancelled status whose cancellation reverses the booking's
-- revenue (finance_entries/revenue_records rows are removed, the booking row
-- itself stays for record-keeping).
ALTER TABLE `facility_bookings` ADD COLUMN `customerId` INT;
ALTER TABLE `facility_bookings` ADD COLUMN `paymentMethod` ENUM('cash', 'card', 'bank', 'mixed') NOT NULL DEFAULT 'cash';
ALTER TABLE `facility_bookings` ADD COLUMN `status` ENUM('confirmed', 'cancelled') NOT NULL DEFAULT 'confirmed';
ALTER TABLE `facility_bookings` ADD COLUMN `cancelledAt` TIMESTAMP NULL;
ALTER TABLE `facility_bookings` ADD COLUMN `cancelledBy` INT;
ALTER TABLE `facility_bookings` ADD COLUMN `cancelReason` TEXT;
