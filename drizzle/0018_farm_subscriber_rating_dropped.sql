-- MicroFarm: subscribers carry no rating.
--
-- The rating columns came over with the source client's mark, which rated the organizations the
-- source client served. A subscriber is a person or a business buying flats; nothing rates them.
-- Supplier ratings are untouched.

ALTER TABLE farm.subscribers DROP COLUMN IF EXISTS rating_status;
ALTER TABLE farm.subscribers DROP COLUMN IF EXISTS rating_stars;
ALTER TABLE farm.subscribers DROP COLUMN IF EXISTS rating_rated_on;
