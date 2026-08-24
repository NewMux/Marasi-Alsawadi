CREATE TABLE `sales_ticket_sequences` (
  `ticketYear` int NOT NULL,
  `lastSequence` int NOT NULL DEFAULT 0,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`ticketYear`)
);

CREATE TABLE `sales_transactions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `ticketNumber` varchar(40) NOT NULL,
  `ticketYear` int NOT NULL,
  `sequenceNumber` int NOT NULL,
  `customerId` int NOT NULL,
  `visitDate` date NOT NULL,
  `department` enum('aqua_park','rooms','fnb','general') NOT NULL DEFAULT 'aqua_park',
  `quantity` int NOT NULL DEFAULT 1,
  `unitPrice` decimal(12,2) NOT NULL,
  `totalAmount` decimal(12,2) NOT NULL,
  `paymentMethod` enum('cash','card','bank','mixed') NOT NULL DEFAULT 'cash',
  `notes` text,
  `issuedBy` int NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  CONSTRAINT `sales_transactions_ticketNumber_unique` UNIQUE (`ticketNumber`),
  CONSTRAINT `sales_ticket_year_sequence` UNIQUE (`ticketYear`,`sequenceNumber`)
);

CREATE TABLE `expense_categories` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(96) NOT NULL,
  `code` varchar(32) NOT NULL,
  `isActive` boolean NOT NULL DEFAULT true,
  `createdBy` int NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  CONSTRAINT `expense_categories_name_unique` UNIQUE (`name`),
  CONSTRAINT `expense_categories_code_unique` UNIQUE (`code`)
);

CREATE TABLE `expense_records` (
  `id` int NOT NULL AUTO_INCREMENT,
  `businessDate` date NOT NULL,
  `categoryId` int,
  `categoryName` varchar(96) NOT NULL,
  `amount` decimal(12,2) NOT NULL,
  `payee` varchar(128),
  `description` varchar(256) NOT NULL,
  `department` enum('front_office','housekeeping','maintenance','aqua_park','fnb','management','general') NOT NULL DEFAULT 'general',
  `financeEntryId` int,
  `createdBy` int NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
);
