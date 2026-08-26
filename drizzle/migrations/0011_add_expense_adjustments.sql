CREATE TABLE IF NOT EXISTS `expense_adjustments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`businessDate` date NOT NULL,
	`categoryId` int NOT NULL,
	`categoryName` varchar(160) NOT NULL,
	`type` enum('add','deduct','transfer_out','transfer_in') NOT NULL,
	`amount` decimal(12,2) NOT NULL,
	`relatedCategoryId` int,
	`relatedCategoryName` varchar(160),
	`note` varchar(512),
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `expense_adjustments_id` PRIMARY KEY(`id`)
);
