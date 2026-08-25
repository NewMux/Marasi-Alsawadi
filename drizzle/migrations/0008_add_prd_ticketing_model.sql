-- PRD Phase 1: Waterpark/Companion ticketing and continuous numbering.
-- Run only after the existing quoted-scope migrations on the dedicated Marasi database.

ALTER TABLE service_rates
  ADD COLUMN ticketType ENUM('waterpark', 'companion') NULL AFTER department;

CREATE TABLE IF NOT EXISTS ticket_number_sequences (
  id INT NOT NULL PRIMARY KEY,
  lastNumber INT NOT NULL DEFAULT 0,
  updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ticket_discount_tiers (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  minTickets INT NOT NULL,
  maxTickets INT NULL,
  percentage DECIMAL(5,2) NOT NULL,
  isActive BOOLEAN NOT NULL DEFAULT TRUE,
  createdBy INT NOT NULL,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX ticket_discount_tier_range (minTickets, maxTickets)
);

CREATE TABLE IF NOT EXISTS ticket_purchases (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  customerId INT NOT NULL,
  visitDate DATE NOT NULL,
  chargeableTicketCount INT NOT NULL DEFAULT 0,
  discountPercentage DECIMAL(5,2) NOT NULL DEFAULT 0,
  baseSubtotal DECIMAL(12,2) NOT NULL DEFAULT 0,
  discountAmount DECIMAL(12,2) NOT NULL DEFAULT 0,
  vatAmount DECIMAL(12,2) NOT NULL DEFAULT 0,
  feeTotal DECIMAL(12,2) NOT NULL DEFAULT 0,
  totalAmount DECIMAL(12,2) NOT NULL,
  paymentMethod ENUM('cash', 'card', 'bank', 'mixed') NOT NULL DEFAULT 'cash',
  notes TEXT NULL,
  issuedBy INT NOT NULL,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX ticket_purchase_customer (customerId),
  INDEX ticket_purchase_visit_date (visitDate)
);

CREATE TABLE IF NOT EXISTS ticket_purchase_lines (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  purchaseId INT NOT NULL,
  ticketNumber VARCHAR(40) NOT NULL UNIQUE,
  ticketType ENUM('waterpark', 'companion') NOT NULL,
  freeEntryCategory ENUM('under_two', 'person_of_determination', 'senior') NULL,
  rateId INT NULL,
  label VARCHAR(128) NOT NULL,
  basePrice DECIMAL(12,2) NOT NULL,
  discountPercentage DECIMAL(5,2) NOT NULL DEFAULT 0,
  discountAmount DECIMAL(12,2) NOT NULL DEFAULT 0,
  vatAmount DECIMAL(12,2) NOT NULL DEFAULT 0,
  feeAmount DECIMAL(12,2) NOT NULL DEFAULT 0,
  totalAmount DECIMAL(12,2) NOT NULL,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX ticket_purchase_line_purchase (purchaseId),
  INDEX ticket_purchase_line_rate (rateId)
);

CREATE TABLE IF NOT EXISTS ticket_purchase_fees (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  purchaseId INT NOT NULL,
  feeId INT NULL,
  label VARCHAR(128) NOT NULL,
  code VARCHAR(48) NULL,
  calculationType ENUM('fixed', 'percentage') NOT NULL,
  applicationBasis ENUM('per_ticket', 'per_transaction') NOT NULL,
  value DECIMAL(12,4) NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX ticket_purchase_fee_purchase (purchaseId)
);

-- Seeded so the first issued ticket is 17843, matching the plain continuous
-- numbering already used by the backend-free local app (see
-- STARTING_TICKET_NUMBER in server/ticketingRules.ts).
INSERT INTO ticket_number_sequences (id, lastNumber)
VALUES (1, 17842)
ON DUPLICATE KEY UPDATE id = VALUES(id);

-- PRD defaults. Super Admin may edit prices and discount tiers after bootstrap.
INSERT INTO service_rates (name, code, department, ticketType, unitPrice, currency, description, isActive, createdAt, updatedAt)
SELECT 'Waterpark ticket', 'WATERPARK', 'aqua_park', 'waterpark', 3.00, 'OMR', 'Visitor uses the pool or water attractions', TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM service_rates WHERE code = 'WATERPARK');

INSERT INTO service_rates (name, code, department, ticketType, unitPrice, currency, description, isActive, createdAt, updatedAt)
SELECT 'Companion ticket', 'COMPANION', 'aqua_park', 'companion', 2.00, 'OMR', 'Visitor enters but does not use the pool', TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM service_rates WHERE code = 'COMPANION');

-- A client/admin can change these later; these are only the PRD defaults.
INSERT INTO ticket_discount_tiers (minTickets, maxTickets, percentage, isActive, createdBy)
SELECT 25, 29, 15.00, TRUE, 1
WHERE NOT EXISTS (SELECT 1 FROM ticket_discount_tiers WHERE minTickets = 25 AND maxTickets = 29);
INSERT INTO ticket_discount_tiers (minTickets, maxTickets, percentage, isActive, createdBy)
SELECT 50, 99, 25.00, TRUE, 1
WHERE NOT EXISTS (SELECT 1 FROM ticket_discount_tiers WHERE minTickets = 50 AND maxTickets = 99);
INSERT INTO ticket_discount_tiers (minTickets, maxTickets, percentage, isActive, createdBy)
SELECT 100, NULL, 50.00, TRUE, 1
WHERE NOT EXISTS (SELECT 1 FROM ticket_discount_tiers WHERE minTickets = 100 AND maxTickets IS NULL);
