-- Cotyledon: a subscriber may be a Forecast Subscriber (src/data/subscribers.ts), on the master list
-- with forecast figures and never on Actual; the folded check on farm.subscribers.status left it out.

ALTER TABLE farm.subscribers DROP CONSTRAINT IF EXISTS farm_subscribers_status;
ALTER TABLE farm.subscribers ADD CONSTRAINT farm_subscribers_status CHECK (status IN ('prospect', 'contracted', 'forecast', 'inactive'));
