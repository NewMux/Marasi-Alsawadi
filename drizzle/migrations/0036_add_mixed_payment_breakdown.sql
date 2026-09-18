-- Client feedback (Round 14, Section 6): whenever "Mixed" is selected as the
-- payment method, staff must enter a Cash/Card/Bank breakdown that sums to
-- the transaction total, and receipts must show that exact split instead of
-- one combined "Mixed" line. These columns are only ever populated when
-- paymentMethod = 'mixed'; every other method leaves them NULL.
ALTER TABLE `ticket_purchases`
  ADD COLUMN `cashAmount` DECIMAL(12,3) NULL,
  ADD COLUMN `cardAmount` DECIMAL(12,3) NULL,
  ADD COLUMN `bankAmount` DECIMAL(12,3) NULL;

ALTER TABLE `facility_bookings`
  ADD COLUMN `cashAmount` DECIMAL(12,3) NULL,
  ADD COLUMN `cardAmount` DECIMAL(12,3) NULL,
  ADD COLUMN `bankAmount` DECIMAL(12,3) NULL;
