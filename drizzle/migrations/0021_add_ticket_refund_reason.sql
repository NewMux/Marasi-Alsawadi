-- PRD Section 1(e): cancelling an issued ticket purchase (the existing
-- "Return" flow) may now record an optional reason.
ALTER TABLE `ticket_purchases` ADD COLUMN `refundReason` TEXT;
