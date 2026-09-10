-- PRD Round 8, Section 2: restore the behavioral fields the old fixed
-- Water Park categories had, now as per-category Admin-configurable
-- settings (applying across every ticket type, same as price):
--   * maxPerBooking — e.g. the old "Companion" cap of 2 per family.
--   * countsTowardGroupDiscount — e.g. the old free categories (Retiree,
--     Special Needs, Under 2) were excluded from the group-discount
--     ticket count; this was dropped in Round 7's generalization in favor
--     of deriving it from price, but the PRD asks for it back as an
--     explicit, independently-configurable flag.
ALTER TABLE `visitor_categories` ADD COLUMN `maxPerBooking` INT;
ALTER TABLE `visitor_categories` ADD COLUMN `countsTowardGroupDiscount` BOOLEAN NOT NULL DEFAULT TRUE;

UPDATE `visitor_categories` SET `maxPerBooking` = 2 WHERE `code` = 'COMPANION';
UPDATE `visitor_categories` SET `countsTowardGroupDiscount` = FALSE WHERE `code` IN ('RETIREE', 'SPECIAL_NEEDS', 'UNDER_TWO');
