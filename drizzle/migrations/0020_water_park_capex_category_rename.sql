-- The Assets/Capital Expenditure category seeded in 0017 was named before
-- the client's "Aqua Park" -> "Water Park" wording was finalized.
UPDATE `asset_categories` SET `name` = 'Water Park Infrastructure' WHERE `name` = 'Waterpark Infrastructure';
