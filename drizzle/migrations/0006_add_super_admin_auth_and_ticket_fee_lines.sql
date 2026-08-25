-- Quotation-aligned authentication, Super Admin settings, and immutable ticket pricing.
-- Apply only to the new dedicated Marasi database after taking a backup.

ALTER TABLE `users`
  MODIFY COLUMN `role` enum('staff','manager','admin','guard','super_admin') NOT NULL DEFAULT 'staff',
  ADD COLUMN `username` varchar(64) NULL AFTER `role`,
  ADD COLUMN `passwordHash` text NULL AFTER `username`,
  ADD COLUMN `mustChangePassword` boolean NOT NULL DEFAULT true AFTER `passwordHash`,
  ADD COLUMN `isActive` boolean NOT NULL DEFAULT true AFTER `mustChangePassword`;

CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);

CREATE TABLE `user_sessions` (
  `id` int AUTO_INCREMENT NOT NULL,
  `userId` int NOT NULL,
  `tokenHash` varchar(64) NOT NULL,
  `expiresAt` timestamp NOT NULL,
  `lastUsedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `revokedAt` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `user_sessions_id` PRIMARY KEY (`id`),
  CONSTRAINT `user_sessions_token_hash_unique` UNIQUE (`tokenHash`),
  CONSTRAINT `user_sessions_user_fk` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE CASCADE
);

CREATE INDEX `user_sessions_user_active_idx` ON `user_sessions` (`userId`, `revokedAt`, `expiresAt`);

CREATE TABLE `ticket_fee_definitions` (
  `id` int AUTO_INCREMENT NOT NULL,
  `name` varchar(128) NOT NULL,
  `code` varchar(48) NOT NULL,
  `calculationType` enum('fixed','percentage') NOT NULL DEFAULT 'fixed',
  `value` decimal(12,4) NOT NULL,
  `applicationBasis` enum('per_ticket','per_transaction') NOT NULL DEFAULT 'per_transaction',
  `appliesGlobally` boolean NOT NULL DEFAULT false,
  `displayOrder` int NOT NULL DEFAULT 0,
  `isActive` boolean NOT NULL DEFAULT true,
  `createdBy` int NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `ticket_fee_definitions_id` PRIMARY KEY (`id`),
  CONSTRAINT `ticket_fee_definitions_code_unique` UNIQUE (`code`),
  CONSTRAINT `ticket_fee_definitions_creator_fk` FOREIGN KEY (`createdBy`) REFERENCES `users` (`id`)
);

CREATE TABLE `service_rate_fees` (
  `id` int AUTO_INCREMENT NOT NULL,
  `rateId` int NOT NULL,
  `feeId` int NOT NULL,
  `isActive` boolean NOT NULL DEFAULT true,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `service_rate_fees_id` PRIMARY KEY (`id`),
  CONSTRAINT `service_rate_fee_unique` UNIQUE (`rateId`, `feeId`),
  CONSTRAINT `service_rate_fees_rate_fk` FOREIGN KEY (`rateId`) REFERENCES `service_rates` (`id`) ON DELETE CASCADE,
  CONSTRAINT `service_rate_fees_fee_fk` FOREIGN KEY (`feeId`) REFERENCES `ticket_fee_definitions` (`id`) ON DELETE CASCADE
);

ALTER TABLE `sales_transactions`
  ADD COLUMN `baseSubtotal` decimal(12,2) NOT NULL DEFAULT 0 AFTER `unitPrice`,
  ADD COLUMN `feeTotal` decimal(12,2) NOT NULL DEFAULT 0 AFTER `baseSubtotal`;

UPDATE `sales_transactions`
SET `baseSubtotal` = `totalAmount`, `feeTotal` = 0
WHERE `baseSubtotal` = 0;

CREATE TABLE `sales_transaction_lines` (
  `id` int AUTO_INCREMENT NOT NULL,
  `transactionId` int NOT NULL,
  `lineType` enum('base','fee') NOT NULL,
  `label` varchar(128) NOT NULL,
  `code` varchar(48) NULL,
  `quantity` int NOT NULL DEFAULT 1,
  `unitAmount` decimal(12,4) NOT NULL,
  `lineAmount` decimal(12,2) NOT NULL,
  `sortOrder` int NOT NULL DEFAULT 0,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `sales_transaction_lines_id` PRIMARY KEY (`id`),
  CONSTRAINT `sales_transaction_lines_transaction_fk` FOREIGN KEY (`transactionId`) REFERENCES `sales_transactions` (`id`) ON DELETE CASCADE
);

CREATE INDEX `sales_transaction_lines_transaction_idx` ON `sales_transaction_lines` (`transactionId`, `sortOrder`);

-- Existing tickets keep their exact stored total. No historical fees are invented.
INSERT INTO `sales_transaction_lines`
  (`transactionId`, `lineType`, `label`, `code`, `quantity`, `unitAmount`, `lineAmount`, `sortOrder`)
SELECT
  st.`id`, 'base', COALESCE(sr.`name`, 'Legacy ticket'), COALESCE(sr.`code`, 'LEGACY'),
  st.`quantity`, st.`unitPrice`, st.`totalAmount`, 0
FROM `sales_transactions` st
LEFT JOIN `service_rates` sr ON sr.`id` = st.`rateId`
WHERE NOT EXISTS (
  SELECT 1 FROM `sales_transaction_lines` line WHERE line.`transactionId` = st.`id`
);
