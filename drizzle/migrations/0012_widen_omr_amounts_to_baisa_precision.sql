-- OMR is a 3-decimal-place currency (1 rial = 1000 baisa), but every money
-- column in the schema was created with scale 2 (cents-style), silently
-- rounding away the 3rd decimal digit on insert. Receipts and reports
-- already *display* amounts to 3 decimals (e.g. "OMR 3.150"), so this only
-- widens storage to match precision the app already claims to have.
-- Widening a DECIMAL column's scale is non-lossy — existing 2-decimal
-- values (e.g. 12.50) are stored exactly as 12.500, nothing is rounded.
-- Scoped to the tables actually reachable from the active app today; the
-- dormant legacy tables (reservations, aqua_park_tickets, sales_transactions
-- and friends) are intentionally left untouched, same as prior migrations.

ALTER TABLE `service_rates`
  MODIFY COLUMN `unitPrice` DECIMAL(12,3) NOT NULL;

ALTER TABLE `ticket_purchases`
  MODIFY COLUMN `baseSubtotal` DECIMAL(12,3) NOT NULL DEFAULT 0,
  MODIFY COLUMN `discountAmount` DECIMAL(12,3) NOT NULL DEFAULT 0,
  MODIFY COLUMN `vatAmount` DECIMAL(12,3) NOT NULL DEFAULT 0,
  MODIFY COLUMN `feeTotal` DECIMAL(12,3) NOT NULL DEFAULT 0,
  MODIFY COLUMN `totalAmount` DECIMAL(12,3) NOT NULL;

ALTER TABLE `ticket_purchase_lines`
  MODIFY COLUMN `basePrice` DECIMAL(12,3) NOT NULL,
  MODIFY COLUMN `discountAmount` DECIMAL(12,3) NOT NULL DEFAULT 0,
  MODIFY COLUMN `vatAmount` DECIMAL(12,3) NOT NULL DEFAULT 0,
  MODIFY COLUMN `feeAmount` DECIMAL(12,3) NOT NULL DEFAULT 0,
  MODIFY COLUMN `totalAmount` DECIMAL(12,3) NOT NULL;

ALTER TABLE `ticket_purchase_fees`
  MODIFY COLUMN `amount` DECIMAL(12,3) NOT NULL;

ALTER TABLE `finance_entries`
  MODIFY COLUMN `amount` DECIMAL(12,3) NOT NULL;

ALTER TABLE `expense_records`
  MODIFY COLUMN `amount` DECIMAL(12,3) NOT NULL;

ALTER TABLE `expense_adjustments`
  MODIFY COLUMN `amount` DECIMAL(12,3) NOT NULL;
