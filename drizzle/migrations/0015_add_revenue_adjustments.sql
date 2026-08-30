CREATE TABLE `revenue_adjustments` (
  `id` int NOT NULL AUTO_INCREMENT,
  `businessDate` date NOT NULL,
  `categoryId` int NOT NULL,
  `categoryName` varchar(160) NOT NULL,
  `type` enum('add','deduct','transfer_out','transfer_in') NOT NULL,
  `amount` decimal(12,3) NOT NULL,
  `relatedCategoryId` int,
  `relatedCategoryName` varchar(160),
  `note` varchar(512),
  `createdBy` int NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
);
