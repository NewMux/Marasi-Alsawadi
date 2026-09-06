-- PRD Section 2: Events Hall Booking (Facility & Add-on System) — deliberately
-- not a full booking/calendar system. Each Facility Type/Add-on Service links
-- to a Revenue category so confirming a booking posts real revenue entries.
CREATE TABLE `facility_types` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(160) NOT NULL UNIQUE,
  `code` VARCHAR(32) NOT NULL UNIQUE,
  `pricingMethod` ENUM('hourly', 'daily', 'fixed') NOT NULL,
  `rate` DECIMAL(12, 3) NOT NULL,
  `revenueCategoryId` INT NOT NULL,
  `isActive` BOOLEAN NOT NULL DEFAULT TRUE,
  `createdBy` INT NOT NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE `addon_services` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(160) NOT NULL UNIQUE,
  `code` VARCHAR(32) NOT NULL UNIQUE,
  `pricingMethod` ENUM('per_person', 'fixed', 'hourly') NOT NULL,
  `rate` DECIMAL(12, 3) NOT NULL,
  `revenueCategoryId` INT NOT NULL,
  `isActive` BOOLEAN NOT NULL DEFAULT TRUE,
  `createdBy` INT NOT NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE `facility_bookings` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `facilityTypeId` INT NOT NULL,
  `facilityTypeName` VARCHAR(160) NOT NULL,
  `bookingDate` DATE NOT NULL,
  `quantity` DECIMAL(10, 2) NOT NULL,
  `facilityAmount` DECIMAL(12, 3) NOT NULL,
  `addonsAmount` DECIMAL(12, 3) NOT NULL DEFAULT 0,
  `totalAmount` DECIMAL(12, 3) NOT NULL,
  `customerName` VARCHAR(160),
  `notes` TEXT,
  `createdBy` INT NOT NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE `facility_booking_addons` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `bookingId` INT NOT NULL,
  `addonServiceId` INT NOT NULL,
  `addonServiceName` VARCHAR(160) NOT NULL,
  `quantity` DECIMAL(10, 2) NOT NULL,
  `amount` DECIMAL(12, 3) NOT NULL
);
