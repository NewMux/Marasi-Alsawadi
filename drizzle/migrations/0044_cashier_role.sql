-- Client feedback (Round 16, item 12): a new Cashier role (Front Office plus
-- only their own transactions). Adding an enum value is additive — every
-- existing user keeps their current role.
ALTER TABLE `users` MODIFY COLUMN `role` ENUM('staff', 'manager', 'admin', 'guard', 'super_admin', 'petty_cash', 'cashier') NOT NULL DEFAULT 'staff';
