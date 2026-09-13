-- PRD Round 9 follow-up (group discounts, Section 2): each ticket type now
-- carries its own independent set of quantity tiers instead of one shared
-- table applying to every ticket type. Existing tiers were all defined
-- against the original fixed Water Park/Companion pair, so they're
-- backfilled onto whichever ticket type the "water_park" group's oldest
-- (originally seeded) row is — falling back to any ticket type at all if,
-- on some environment, none is tagged "water_park" yet.
ALTER TABLE `ticket_discount_tiers` ADD COLUMN `ticketTypeId` INT;

SET @default_group_discount_ticket_type_id = (
  SELECT `id` FROM `ticket_types` WHERE `ticketGroup` = 'water_park' ORDER BY `id` ASC LIMIT 1
);
SET @default_group_discount_ticket_type_id = COALESCE(
  @default_group_discount_ticket_type_id,
  (SELECT `id` FROM `ticket_types` ORDER BY `id` ASC LIMIT 1)
);

UPDATE `ticket_discount_tiers` SET `ticketTypeId` = @default_group_discount_ticket_type_id WHERE `ticketTypeId` IS NULL;

ALTER TABLE `ticket_discount_tiers` MODIFY COLUMN `ticketTypeId` INT NOT NULL;

-- Data-quality issue flagged directly in the findings report: two active
-- Water Park tiers overlapped (100-500 and 100-1000, both 30%) because
-- nothing ever prevented it — application-level overlap validation is
-- added alongside this migration so it can't happen again. Retire the
-- wider, redundant duplicate now; a no-op wherever this exact pair doesn't
-- exist.
UPDATE `ticket_discount_tiers`
SET `isActive` = FALSE
WHERE `minTickets` = 100 AND `maxTickets` = 1000 AND `isActive` = TRUE;
