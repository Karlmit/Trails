-- Every pre-existing row defaulted to sort_order = 0 (see the previous
-- migration) -- backfill distinct values per Trip, in the same createdAt
-- order the list already rendered in, so the move endpoint's swap-by-value
-- logic has something meaningful to swap on the very first move (two rows
-- tied at 0 would swap 0 <-> 0, a visible no-op).
UPDATE "important_info" AS t
SET "sort_order" = ranked.rn
FROM (
  SELECT "id", ROW_NUMBER() OVER (PARTITION BY "trip_id" ORDER BY "created_at" ASC) - 1 AS rn
  FROM "important_info"
) AS ranked
WHERE t."id" = ranked."id";
