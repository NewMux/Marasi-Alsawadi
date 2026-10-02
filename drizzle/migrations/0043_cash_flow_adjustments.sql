-- Client feedback (Round 16, items 6/7/10): the Cash Flow balance itself is
-- calculated from existing records (revenue in, paid expenses/capital
-- expenditure out) — nothing historical is modified. This table only holds
-- what the Admin sets by hand in Commercial Settings: an opening balance and
-- manual add/deduct adjustments to the Cash Flow account.
CREATE TABLE `cash_flow_adjustments` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `businessDate` DATE NOT NULL,
  `type` ENUM('opening', 'add', 'deduct') NOT NULL,
  `amount` DECIMAL(12,3) NOT NULL,
  `note` VARCHAR(512) NULL,
  `createdBy` INT NOT NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
