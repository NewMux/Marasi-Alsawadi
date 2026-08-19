CREATE TABLE `daily_settlements` (
  `id` int AUTO_INCREMENT NOT NULL,
  `businessDate` date NOT NULL,
  `department` enum('aqua_park','rooms','fnb','events','general') NOT NULL DEFAULT 'general',
  `expectedAmount` decimal(12,2) NOT NULL DEFAULT '0',
  `cashAmount` decimal(12,2) NOT NULL DEFAULT '0',
  `bankAmount` decimal(12,2) NOT NULL DEFAULT '0',
  `cardAmount` decimal(12,2) NOT NULL DEFAULT '0',
  `bankCharges` decimal(12,2) NOT NULL DEFAULT '0',
  `status` enum('draft','submitted','approved','variance') NOT NULL DEFAULT 'draft',
  `notes` text,
  `submittedBy` int,
  `reviewedBy` int,
  `reviewedAt` timestamp,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `daily_settlements_id` PRIMARY KEY(`id`),
  CONSTRAINT `daily_settlement_business_department` UNIQUE(`businessDate`,`department`)
);

CREATE TABLE `petty_cash_requests` (
  `id` int AUTO_INCREMENT NOT NULL,
  `requestDate` date NOT NULL,
  `department` enum('front_office','housekeeping','maintenance','aqua_park','fnb','management','general') NOT NULL DEFAULT 'general',
  `category` enum('petty_cash','expense','reimbursement') NOT NULL DEFAULT 'expense',
  `amount` decimal(12,2) NOT NULL,
  `payee` varchar(128) NOT NULL,
  `purpose` varchar(256) NOT NULL,
  `sourceReference` varchar(96),
  `status` enum('pending','approved','paid','rejected') NOT NULL DEFAULT 'pending',
  `requestedBy` int NOT NULL,
  `approvedBy` int,
  `approvedAt` timestamp,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `petty_cash_requests_id` PRIMARY KEY(`id`)
);
