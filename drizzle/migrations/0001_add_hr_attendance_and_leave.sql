CREATE TABLE `staff_attendance` (
  `id` int AUTO_INCREMENT NOT NULL,
  `staffId` int NOT NULL,
  `workDate` date NOT NULL,
  `status` enum('present','late','absent','leave') NOT NULL DEFAULT 'present',
  `clockInAt` timestamp NULL,
  `clockOutAt` timestamp NULL,
  `notes` text,
  `recordedBy` int,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `staff_attendance_id` PRIMARY KEY(`id`)
);

CREATE TABLE `staff_leave_requests` (
  `id` int AUTO_INCREMENT NOT NULL,
  `staffId` int NOT NULL,
  `leaveType` enum('annual','sick','unpaid','other') NOT NULL DEFAULT 'annual',
  `startDate` date NOT NULL,
  `endDate` date NOT NULL,
  `status` enum('pending','approved','rejected','cancelled') NOT NULL DEFAULT 'pending',
  `notes` text,
  `reviewedBy` int,
  `reviewedAt` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `staff_leave_requests_id` PRIMARY KEY(`id`)
);
