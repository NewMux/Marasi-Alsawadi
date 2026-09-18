-- Client feedback (Round 14 follow-up, item 2): the visual availability
-- timeline for hourly facilities needs to know WHEN in the day a booking
-- starts, not just its duration. Null for daily/fixed facilities and for
-- any hourly booking made before this column existed.
ALTER TABLE `facility_bookings`
  ADD COLUMN `startTime` VARCHAR(5) NULL;
