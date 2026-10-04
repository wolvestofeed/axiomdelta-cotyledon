-- Cotyledon: the home grow room is the owner's already. Its five seeded rows move from Planned to
-- In service, so a forecast takes them into fixed assets at the start against owners' equity with
-- no cash paid. A row whose status was changed on Equipment is left as it stands.

UPDATE farm.equipment
SET status = 'in_service'
WHERE status = 'planned'
  AND key IN (
    'Grow rack, 6-tier 24x48 wire shelving',
    'Dark rack, 6-tier 24x48 wire shelving',
    'LED grow light, Mars Hydro VG80',
    'Clip fan, 6 in',
    '1020 three-piece flat set'
  );
