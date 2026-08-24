ALTER TABLE `users`
  MODIFY COLUMN `role` enum('staff','manager','admin','guard') NOT NULL DEFAULT 'staff';

ALTER TABLE `sales_transactions`
  ADD COLUMN `publicToken` varchar(96) NULL AFTER `ticketNumber`,
  ADD COLUMN `status` enum('paid','voided','checked_in','expired') NOT NULL DEFAULT 'paid' AFTER `publicToken`;

UPDATE `sales_transactions`
SET `publicToken` = SHA2(CONCAT('legacy-ticket:', `id`, ':', `ticketNumber`), 256)
WHERE `publicToken` IS NULL;

ALTER TABLE `sales_transactions`
  MODIFY COLUMN `publicToken` varchar(96) NOT NULL,
  ADD CONSTRAINT `sales_transactions_publicToken_unique` UNIQUE (`publicToken`);

CREATE TABLE `ticket_check_ins` (
  `id` int NOT NULL AUTO_INCREMENT,
  `ticketId` int,
  `scannedBy` int,
  `scannedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `result` enum('allowed','denied') NOT NULL,
  `denialReason` varchar(160),
  `scannedValue` varchar(512) NOT NULL,
  `requestKey` varchar(96) NOT NULL,
  PRIMARY KEY (`id`),
  CONSTRAINT `ticket_check_ins_requestKey_unique` UNIQUE (`requestKey`)
);

CREATE TABLE `whatsapp_messages` (
  `id` int NOT NULL AUTO_INCREMENT,
  `ticketId` int NOT NULL,
  `customerPhone` varchar(32) NOT NULL,
  `provider` varchar(48) NOT NULL,
  `providerMessageId` varchar(160),
  `templateName` varchar(128) NOT NULL,
  `status` enum('queued','sent','delivered','read','failed') NOT NULL DEFAULT 'queued',
  `attempts` int NOT NULL DEFAULT 0,
  `errorMessage` text,
  `createdBy` int,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
);

CREATE TABLE `whatsapp_webhook_events` (
  `id` int NOT NULL AUTO_INCREMENT,
  `eventKey` varchar(160) NOT NULL,
  `payload` text NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  CONSTRAINT `whatsapp_webhook_events_eventKey_unique` UNIQUE (`eventKey`)
);
