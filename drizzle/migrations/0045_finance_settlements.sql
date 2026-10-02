-- Client feedback (Round 16 follow-up): Cash Flow must show a settled
-- balance on the day the cash actually moved, not on the transaction's
-- original date — otherwise a closed month's Cash Flow report would change
-- when one of its balances is paid off later. Each payment made against an
-- outstanding Balance is recorded here with its own settlement date. New
-- table only: no existing record, amount or column is changed.
CREATE TABLE `finance_settlements` (
  `id` INT AUTO_INCREMENT NOT NULL PRIMARY KEY,
  `recordType` ENUM('expense','revenue','asset') NOT NULL,
  `recordId` INT NOT NULL,
  `amount` DECIMAL(12,3) NOT NULL,
  `settlementDate` DATE NOT NULL,
  `createdBy` INT NOT NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX `finance_settlements_record_idx` (`recordType`, `recordId`),
  INDEX `finance_settlements_date_idx` (`settlementDate`)
);
