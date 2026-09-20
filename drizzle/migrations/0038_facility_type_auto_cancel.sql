-- Client feedback (Round 15, item 6): the single global auto-cancellation
-- window (facility_booking_settings) is superseded by a per-facility field —
-- each facility now carries its own toggle and its own free/open number of
-- hours, set by the Admin when the facility is added or edited.
ALTER TABLE `facility_types`
  ADD COLUMN `autoCancelEnabled` BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN `autoCancelHours` INT NOT NULL DEFAULT 24;
