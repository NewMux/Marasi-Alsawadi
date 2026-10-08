-- Client feedback (Round 17, item 5.4): restoring data is never a
-- self-service action. The client submits a "Request Data Restore" with the
-- point in time they want, and NewMux reviews and performs the restore on
-- the server. This table is only that request queue — new table, nothing
-- existing is touched.
CREATE TABLE `data_restore_requests` (
  `id` INT AUTO_INCREMENT NOT NULL PRIMARY KEY,
  `restorePoint` DATETIME NOT NULL,
  `reason` TEXT NOT NULL,
  `status` ENUM('pending','in_progress','completed','rejected','cancelled') NOT NULL DEFAULT 'pending',
  `requestedBy` INT NOT NULL,
  `handledBy` INT NULL,
  `handledNote` TEXT NULL,
  `handledAt` TIMESTAMP NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
