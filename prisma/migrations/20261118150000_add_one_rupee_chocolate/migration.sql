-- Data-only: adds a ₹1 chocolate (Desserts) for cheap real-payment checks.
-- Inserts nothing if the Desserts category is missing or the item already exists.
INSERT INTO "FoodItem" ("id", "name", "slug", "description", "price", "isVeg", "isAvailable", "isPopular", "prepTimeMinutes", "categoryId", "createdAt", "updatedAt")
SELECT 'fooditem_chocolate_1rs', 'Chocolate', 'chocolate', 'A small chocolate bar, ready at the counter.', 1.00, true, true, false, 1, c."id", NOW(), NOW()
FROM "FoodCategory" c
WHERE c."slug" = 'desserts'
ON CONFLICT ("slug") DO NOTHING;
