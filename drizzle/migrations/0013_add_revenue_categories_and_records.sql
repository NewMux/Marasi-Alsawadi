CREATE TABLE IF NOT EXISTS `revenue_categories` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(160) NOT NULL,
	`code` varchar(32) NOT NULL,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `revenue_categories_id` PRIMARY KEY(`id`),
	CONSTRAINT `revenue_categories_name_unique` UNIQUE(`name`),
	CONSTRAINT `revenue_categories_code_unique` UNIQUE(`code`)
);

CREATE TABLE IF NOT EXISTS `revenue_records` (
	`id` int AUTO_INCREMENT NOT NULL,
	`businessDate` date NOT NULL,
	`categoryId` int,
	`categoryName` varchar(96) NOT NULL,
	`amount` decimal(12,3) NOT NULL,
	`source` varchar(128),
	`description` varchar(256) NOT NULL,
	`receiptNumber` varchar(64),
	`financeEntryId` int,
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `revenue_records_id` PRIMARY KEY(`id`)
);
