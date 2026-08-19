CREATE TABLE `activity_log` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int,
	`action` varchar(128) NOT NULL,
	`entityType` varchar(64),
	`entityId` int,
	`details` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `activity_log_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `aqua_park_capacity` (
	`id` int AUTO_INCREMENT NOT NULL,
	`date` date NOT NULL,
	`maxCapacity` int NOT NULL DEFAULT 200,
	`updatedBy` int,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `aqua_park_capacity_id` PRIMARY KEY(`id`),
	CONSTRAINT `aqua_park_capacity_date_unique` UNIQUE(`date`)
);
--> statement-breakpoint
CREATE TABLE `aqua_park_tickets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`date` date NOT NULL,
	`guestName` varchar(128) NOT NULL,
	`quantity` int NOT NULL DEFAULT 1,
	`pricePerTicket` decimal(10,2) NOT NULL,
	`totalAmount` decimal(10,2) NOT NULL,
	`ticketType` enum('adult','child','group') NOT NULL DEFAULT 'adult',
	`entered` boolean NOT NULL DEFAULT false,
	`enteredAt` timestamp,
	`issuedBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `aqua_park_tickets_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `daily_tasks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`title` varchar(256) NOT NULL,
	`description` text,
	`assignedTo` int,
	`department` varchar(64),
	`priority` enum('low','medium','high') NOT NULL DEFAULT 'medium',
	`status` enum('pending','in_progress','done') NOT NULL DEFAULT 'pending',
	`dueDate` date,
	`completedAt` timestamp,
	`createdBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `daily_tasks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `finance_entries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`date` date NOT NULL,
	`stream` enum('rooms','aqua_park','fnb','extras') NOT NULL,
	`type` enum('revenue','expense') NOT NULL DEFAULT 'revenue',
	`amount` decimal(12,2) NOT NULL,
	`description` varchar(256),
	`referenceId` int,
	`referenceType` varchar(64),
	`sourceFile` varchar(512),
	`createdBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `finance_entries_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `guests` (
	`id` int AUTO_INCREMENT NOT NULL,
	`fullName` varchar(128) NOT NULL,
	`phone` varchar(32),
	`email` varchar(320),
	`nationality` varchar(64),
	`idNumber` varchar(64),
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `guests_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `housekeeping_tasks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`unitId` int NOT NULL,
	`assignedTo` int,
	`taskType` enum('turnover','daily','deep_clean','inspection') NOT NULL DEFAULT 'turnover',
	`status` enum('pending','in_progress','done') NOT NULL DEFAULT 'pending',
	`roomStatus` enum('clean','dirty','inspected','out_of_order') NOT NULL DEFAULT 'dirty',
	`notes` text,
	`scheduledFor` date,
	`completedAt` timestamp,
	`createdBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `housekeeping_tasks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `inventory_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sku` varchar(64) NOT NULL,
	`name` varchar(128) NOT NULL,
	`category` enum('fnb','housekeeping','aqua_park','maintenance','general') NOT NULL DEFAULT 'general',
	`quantityOnHand` decimal(10,2) NOT NULL DEFAULT '0',
	`lowStockThreshold` decimal(10,2) NOT NULL DEFAULT '10',
	`unit` varchar(32) NOT NULL DEFAULT 'unit',
	`supplier` varchar(128),
	`lastRestockedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `inventory_items_id` PRIMARY KEY(`id`),
	CONSTRAINT `inventory_items_sku_unique` UNIQUE(`sku`)
);
--> statement-breakpoint
CREATE TABLE `maintenance_requests` (
	`id` int AUTO_INCREMENT NOT NULL,
	`title` varchar(256) NOT NULL,
	`description` text,
	`location` varchar(128),
	`unitId` int,
	`priority` enum('low','medium','high','urgent') NOT NULL DEFAULT 'medium',
	`status` enum('open','assigned','in_progress','resolved','closed') NOT NULL DEFAULT 'open',
	`assignedTo` int,
	`reportedBy` int,
	`resolvedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `maintenance_requests_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `property_units` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` varchar(32) NOT NULL,
	`name` varchar(128) NOT NULL,
	`type` enum('room','chalet') NOT NULL DEFAULT 'room',
	`capacity` int NOT NULL DEFAULT 2,
	`ratePerNight` decimal(10,2) NOT NULL DEFAULT '0',
	`status` enum('available','occupied','maintenance','out_of_order') NOT NULL DEFAULT 'available',
	`floor` varchar(16),
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `property_units_id` PRIMARY KEY(`id`),
	CONSTRAINT `property_units_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `reservations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`guestId` int NOT NULL,
	`unitId` int NOT NULL,
	`checkIn` date NOT NULL,
	`checkOut` date NOT NULL,
	`adults` int NOT NULL DEFAULT 1,
	`children` int NOT NULL DEFAULT 0,
	`ratePerNight` decimal(10,2) NOT NULL,
	`totalAmount` decimal(10,2) NOT NULL,
	`status` enum('pending','confirmed','checked_in','checked_out','cancelled') NOT NULL DEFAULT 'pending',
	`source` varchar(64) DEFAULT 'direct',
	`notes` text,
	`createdBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `reservations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `staff_profiles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int,
	`fullName` varchar(128) NOT NULL,
	`position` varchar(128),
	`department` enum('front_office','housekeeping','maintenance','aqua_park','fnb','management') NOT NULL DEFAULT 'front_office',
	`phone` varchar(32),
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `staff_profiles_id` PRIMARY KEY(`id`),
	CONSTRAINT `staff_profiles_userId_unique` UNIQUE(`userId`)
);
--> statement-breakpoint
CREATE TABLE `staff_shifts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`staffId` int NOT NULL,
	`department` varchar(64),
	`startTime` timestamp NOT NULL,
	`endTime` timestamp NOT NULL,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `staff_shifts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` int AUTO_INCREMENT NOT NULL,
	`openId` varchar(64) NOT NULL,
	`name` text,
	`email` varchar(320),
	`loginMethod` varchar(64),
	`role` enum('staff','manager','admin') NOT NULL DEFAULT 'staff',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`lastSignedIn` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_openId_unique` UNIQUE(`openId`)
);
--> statement-breakpoint
CREATE TABLE `workbook_imports` (
	`id` int AUTO_INCREMENT NOT NULL,
	`fileName` varchar(256) NOT NULL,
	`fileKey` varchar(512),
	`rowsImported` int NOT NULL DEFAULT 0,
	`mapping` text,
	`importedBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `workbook_imports_id` PRIMARY KEY(`id`)
);
