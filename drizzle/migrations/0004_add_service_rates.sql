CREATE TABLE `service_rates` (
  `id` int AUTO_INCREMENT NOT NULL,
  `name` varchar(128) NOT NULL,
  `code` varchar(48) NOT NULL,
  `department` enum('aqua_park','rooms','fnb','general') NOT NULL DEFAULT 'aqua_park',
  `unitPrice` decimal(12,2) NOT NULL,
  `currency` varchar(3) NOT NULL DEFAULT 'OMR',
  `description` text,
  `isActive` boolean NOT NULL DEFAULT true,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `service_rates_id` PRIMARY KEY(`id`),
  CONSTRAINT `service_rates_code_unique` UNIQUE(`code`)
);

ALTER TABLE `sales_transactions` ADD `rateId` int;
