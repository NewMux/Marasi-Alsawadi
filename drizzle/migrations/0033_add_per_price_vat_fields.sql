-- PRD Round 10, Sections 1-2: VAT moves from one hardcoded system-wide 5%
-- into a direct per-price field (apply toggle + editable rate) on both
-- Ticket Types and Facility Types. Every existing row defaults to on/5% so
-- pricing doesn't change unexpectedly during the transition — the old
-- global calculation is removed from the pricing engine in this same
-- release, so it never runs alongside the new field.
ALTER TABLE `ticket_types`
  ADD COLUMN `applyVat` BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN `vatPercent` DECIMAL(5, 2) NOT NULL DEFAULT 5.00;

ALTER TABLE `facility_types`
  ADD COLUMN `applyVat` BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN `vatPercent` DECIMAL(5, 2) NOT NULL DEFAULT 5.00;

-- Facility bookings had no VAT (or assignable fee) concept at all before
-- this round.
ALTER TABLE `facility_bookings`
  ADD COLUMN `vatAmount` DECIMAL(12, 3) NOT NULL DEFAULT 0,
  ADD COLUMN `feeAmount` DECIMAL(12, 3) NOT NULL DEFAULT 0;

-- PRD Round 10, Section 4: fee items can now be assigned to Facility Types
-- as well as Ticket Types, so `rateId` alone is ambiguous (both are
-- autoincrement PKs starting at 1). Every existing row is a ticket-type
-- assignment (the only kind that existed before this round).
ALTER TABLE `service_rate_fees`
  ADD COLUMN `rateType` ENUM('ticket_type', 'facility_type') NOT NULL DEFAULT 'ticket_type';

-- `service_rate_fees_rate_fk` (rateId -> service_rates.id, from migration
-- 0006) is already obsolete since migration 0030 remapped rateId to point
-- at ticket_types.id instead — and now that rateId can also point at
-- facility_types.id, keeping it would reject or misvalidate facility
-- assignments. It also holds the old unique index in place, blocking the
-- rebuild below, so it's dropped here rather than left as dead weight.
ALTER TABLE `service_rate_fees` DROP FOREIGN KEY `service_rate_fees_rate_fk`;
ALTER TABLE `service_rate_fees` DROP INDEX `service_rate_fee_unique`;
ALTER TABLE `service_rate_fees` ADD UNIQUE KEY `service_rate_fee_unique` (`rateType`, `rateId`, `feeId`);
