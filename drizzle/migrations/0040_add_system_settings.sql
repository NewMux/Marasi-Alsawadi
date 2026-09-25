-- Client feedback (Round 15 — "Reset All Data" feature): a singleton row
-- tracking whether the one-time-use Reset All Data admin tool is currently
-- enabled, plus a minimal audit trail of when it was last used and by whom.
CREATE TABLE `system_settings` (
  `id` INT NOT NULL DEFAULT 1 PRIMARY KEY,
  `resetAllDataToolEnabled` BOOLEAN NOT NULL DEFAULT TRUE,
  `lastResetAt` TIMESTAMP NULL,
  `lastResetBy` INT NULL,
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
