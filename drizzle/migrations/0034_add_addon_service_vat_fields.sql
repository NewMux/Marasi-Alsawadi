-- Client feedback (Round 13): Add-on Services never got the VAT field
-- (apply toggle + editable rate) that migration 0033 added to Ticket Types
-- and Facility Types, so VAT on a facility booking receipt was silently
-- calculated on the facility line only, never on its add-ons. Same
-- pattern, defaulting to on/5% so nothing changes until an Admin edits one.
ALTER TABLE `addon_services`
  ADD COLUMN `applyVat` BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN `vatPercent` DECIMAL(5, 2) NOT NULL DEFAULT 5.00;

-- Snapshot of the VAT actually charged on each add-on line at the time it
-- was attached to a booking, mirroring facility_bookings.vatAmount already
-- snapshotting the facility line's own VAT.
ALTER TABLE `facility_booking_addons`
  ADD COLUMN `vatAmount` DECIMAL(12, 3) NOT NULL DEFAULT 0;
