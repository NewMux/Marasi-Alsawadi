-- Fixes a live bug reported by the client: every guest/customer INSERT
-- failed because drizzle/schema.ts declares `idReference`, but the actual
-- `guests` table (created by drizzle/0000_chubby_marrow.sql) has never been
-- renamed from the older `idNumber` — no migration ever touched this table.
-- Same class of drift as the `reservations.unitRate` bug fixed in 0007.
ALTER TABLE guests
  CHANGE COLUMN idNumber idReference VARCHAR(96) NULL;
