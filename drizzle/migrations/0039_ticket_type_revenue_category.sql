-- Client feedback (Round 15, item 7.1): the categories offered when
-- recording a manual Revenue transaction must exactly match the live
-- Ticket Types (and Facility Types, already linked) instead of a separate,
-- hardcoded category list. Nullable — existing rows are lazily linked to a
-- matching revenue category the first time they're needed for this.
ALTER TABLE `ticket_types`
  ADD COLUMN `revenueCategoryId` INT NULL;
