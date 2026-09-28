-- MicroFarm: own use.
--
-- A subscriber marked own use is the owner taking trays for his own consumption. Its orders flow
-- through production like any other; a distribution to it leaves finished goods at cost to Owner
-- Draws (3200), with no revenue, no receivable, no distribution expense and no invoice.

ALTER TABLE farm.subscribers ADD COLUMN IF NOT EXISTS own_use boolean NOT NULL DEFAULT false;
