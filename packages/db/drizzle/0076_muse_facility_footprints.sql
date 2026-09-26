-- 0076_muse_facility_footprints.sql
-- Impact OS — footprint and clearance as open fields on the equipment library
-- (facility-design roadmap, step Q1).
--
-- The equipment list is the input; the square footage is the output. Each row
-- carries its plan footprint (width along the front × depth, inches), the
-- installation clearances a manufacturer publishes (null where the zone's
-- circulation factor applies instead), the facility zone it works in, whether
-- it sits under a Type I hood, and where the dimensions came from. A row with
-- no incremental floor (bench-mounted, on shelving, overhead, a vehicle) has
-- null width and depth and a source note saying why.
--
--   footprint_basis  'sourced'   — off a named model's spec sheet
--                    'estimated' — category-typical dimensions (a placeholder)
--                    'stated'    — supplied by the operator
--                    'observed'  — measured
--
-- Seeded by item name so a line split across build phases carries the same
-- footprint on both rows (`_data/facility-design.ts` FOOTPRINT_SEED). Rows an
-- admin has already given a footprint or a source note are not touched.

ALTER TABLE muse.equipment ADD COLUMN IF NOT EXISTS footprint_width_in double precision;
ALTER TABLE muse.equipment ADD COLUMN IF NOT EXISTS footprint_depth_in double precision;
ALTER TABLE muse.equipment ADD COLUMN IF NOT EXISTS clearance_front_in double precision;
ALTER TABLE muse.equipment ADD COLUMN IF NOT EXISTS clearance_rear_in double precision;
ALTER TABLE muse.equipment ADD COLUMN IF NOT EXISTS clearance_side_in double precision;
ALTER TABLE muse.equipment ADD COLUMN IF NOT EXISTS footprint_basis text NOT NULL DEFAULT 'estimated';
ALTER TABLE muse.equipment ADD COLUMN IF NOT EXISTS zone text;
ALTER TABLE muse.equipment ADD COLUMN IF NOT EXISTS under_hood boolean NOT NULL DEFAULT false;
ALTER TABLE muse.equipment ADD COLUMN IF NOT EXISTS footprint_source text;

ALTER TABLE muse.equipment DROP CONSTRAINT IF EXISTS muse_equipment_footprint;
ALTER TABLE muse.equipment ADD CONSTRAINT muse_equipment_footprint CHECK (
  (footprint_width_in IS NULL OR footprint_width_in >= 0) AND (footprint_depth_in IS NULL OR footprint_depth_in >= 0)
  AND (clearance_front_in IS NULL OR clearance_front_in >= 0) AND (clearance_rear_in IS NULL OR clearance_rear_in >= 0)
  AND (clearance_side_in IS NULL OR clearance_side_in >= 0)
);
ALTER TABLE muse.equipment DROP CONSTRAINT IF EXISTS muse_equipment_footprint_basis;
ALTER TABLE muse.equipment ADD CONSTRAINT muse_equipment_footprint_basis CHECK (footprint_basis IN ('sourced', 'estimated', 'stated', 'observed'));
ALTER TABLE muse.equipment DROP CONSTRAINT IF EXISTS muse_equipment_zone;
ALTER TABLE muse.equipment ADD CONSTRAINT muse_equipment_zone CHECK (zone IS NULL OR zone IN ('Hot line', 'A la carte', 'Prep', 'Packaging', 'Cook-chill', 'Cold storage', 'Walk-in', 'Warewash', 'Dispatch'));

-- The seed, by item name (FOOTPRINT_SEED). A walk-in's width is its door wall.
UPDATE muse.equipment SET footprint_width_in = 42.625, footprint_depth_in = 44, clearance_front_in = NULL, clearance_rear_in = NULL, clearance_side_in = NULL, footprint_basis = 'sourced', zone = 'Hot line', under_hood = true, footprint_source = 'Rational iCombi Pro 20-full, 42-5/8 x 44 in total'
  WHERE footprint_width_in IS NULL AND footprint_source IS NULL AND item = 'Combi oven, full size 20-pan';
UPDATE muse.equipment SET footprint_width_in = 51, footprint_depth_in = 44, clearance_front_in = NULL, clearance_rear_in = NULL, clearance_side_in = NULL, footprint_basis = 'sourced', zone = 'Hot line', under_hood = true, footprint_source = 'Cleveland KEL-100-T, 51 x 44 in'
  WHERE footprint_width_in IS NULL AND footprint_source IS NULL AND item = 'Steam-jacketed tilting kettle, 100 gal';
UPDATE muse.equipment SET footprint_width_in = 48, footprint_depth_in = 44, clearance_front_in = NULL, clearance_rear_in = NULL, clearance_side_in = NULL, footprint_basis = 'sourced', zone = 'Hot line', under_hood = true, footprint_source = 'Cleveland SGL-40-TR, 48 x 44 in'
  WHERE footprint_width_in IS NULL AND footprint_source IS NULL AND item = 'Tilting braising pan / skillet, 40 gal';
UPDATE muse.equipment SET footprint_width_in = 40.25, footprint_depth_in = 41.125, clearance_front_in = NULL, clearance_rear_in = NULL, clearance_side_in = NULL, footprint_basis = 'sourced', zone = 'Hot line', under_hood = true, footprint_source = 'Vulcan VC44ED, 40-1/4 x 41-1/8 in'
  WHERE footprint_width_in IS NULL AND footprint_source IS NULL AND item = 'Convection oven, double stack';
UPDATE muse.equipment SET footprint_width_in = 49.375, footprint_depth_in = 47.25, clearance_front_in = NULL, clearance_rear_in = NULL, clearance_side_in = NULL, footprint_basis = 'sourced', zone = 'Hot line', under_hood = true, footprint_source = 'Cleveland KGL-60-T, 49-3/8 x 47-1/4 in'
  WHERE footprint_width_in IS NULL AND footprint_source IS NULL AND item = 'Steam-jacketed tilting kettle, 60 gal';
UPDATE muse.equipment SET footprint_width_in = NULL, footprint_depth_in = NULL, clearance_front_in = NULL, clearance_rear_in = NULL, clearance_side_in = NULL, footprint_basis = 'estimated', zone = NULL, under_hood = false, footprint_source = 'Bench-mounted on a prep table; no incremental floor'
  WHERE footprint_width_in IS NULL AND footprint_source IS NULL AND item = 'Buffalo chopper / food processor';
UPDATE muse.equipment SET footprint_width_in = NULL, footprint_depth_in = NULL, clearance_front_in = NULL, clearance_rear_in = NULL, clearance_side_in = NULL, footprint_basis = 'estimated', zone = NULL, under_hood = false, footprint_source = 'Bench-mounted on a prep table; no incremental floor'
  WHERE footprint_width_in IS NULL AND footprint_source IS NULL AND item = 'Commercial slicer';
UPDATE muse.equipment SET footprint_width_in = 78, footprint_depth_in = 30, clearance_front_in = NULL, clearance_rear_in = NULL, clearance_side_in = NULL, footprint_basis = 'estimated', zone = 'Prep', under_hood = false, footprint_source = 'Average of a 3-comp (90 in) and a 2-comp (66 in) at 30 in deep'
  WHERE footprint_width_in IS NULL AND footprint_source IS NULL AND item = 'Prep sinks, 3-comp and 2-comp';
UPDATE muse.equipment SET footprint_width_in = 96, footprint_depth_in = 30, clearance_front_in = NULL, clearance_rear_in = NULL, clearance_side_in = NULL, footprint_basis = 'estimated', zone = 'Prep', under_hood = false, footprint_source = 'Standard 96 x 30 in work table'
  WHERE footprint_width_in IS NULL AND footprint_source IS NULL AND item = 'Stainless prep tables, 8 ft';
UPDATE muse.equipment SET footprint_width_in = 36.125, footprint_depth_in = 34, clearance_front_in = NULL, clearance_rear_in = NULL, clearance_side_in = NULL, footprint_basis = 'sourced', zone = 'Prep', under_hood = false, footprint_source = 'Hobart HCM450, 36-1/8 x 34 in'
  WHERE footprint_width_in IS NULL AND footprint_source IS NULL AND item = 'Vertical cutter mixer, 45 qt';
UPDATE muse.equipment SET footprint_width_in = 36.5, footprint_depth_in = 58.9, clearance_front_in = NULL, clearance_rear_in = NULL, clearance_side_in = NULL, footprint_basis = 'sourced', zone = 'Prep', under_hood = false, footprint_source = 'Hobart HL800, 36.5 x 58.9 in including bowl-lift travel'
  WHERE footprint_width_in IS NULL AND footprint_source IS NULL AND item = 'Planetary mixer, 80 qt';
UPDATE muse.equipment SET footprint_width_in = 41, footprint_depth_in = 35, clearance_front_in = NULL, clearance_rear_in = NULL, clearance_side_in = NULL, footprint_basis = 'sourced', zone = 'Cook-chill', under_hood = false, footprint_source = 'Traulsen TBC13 (supersedes RBC200), 41 x 35 in, 200 lb rated'
  WHERE footprint_width_in IS NULL AND footprint_source IS NULL AND item = 'Blast chiller, 200 lb capacity';
UPDATE muse.equipment SET footprint_width_in = 48, footprint_depth_in = 51.36, clearance_front_in = NULL, clearance_rear_in = NULL, clearance_side_in = NULL, footprint_basis = 'sourced', zone = 'Cook-chill', under_hood = false, footprint_source = 'Cres Cor R-171-SUA-20E mobile chill cabinet, 17.12 sq ft plan area; width and depth to be confirmed against the sheet'
  WHERE footprint_width_in IS NULL AND footprint_source IS NULL AND item = 'Casing handling, chill carts';
UPDATE muse.equipment SET footprint_width_in = 48, footprint_depth_in = 22, clearance_front_in = NULL, clearance_rear_in = NULL, clearance_side_in = NULL, footprint_basis = 'sourced', zone = 'Cook-chill', under_hood = false, footprint_source = 'Cleveland MFS Metering Filling Station, 48 x 22 in'
  WHERE footprint_width_in IS NULL AND footprint_source IS NULL AND item = 'Cook-chill pump fill station';
UPDATE muse.equipment SET footprint_width_in = 98, footprint_depth_in = 93, clearance_front_in = 60, clearance_rear_in = 24, clearance_side_in = 24, footprint_basis = 'sourced', zone = 'Cook-chill', under_hood = false, footprint_source = 'Cleveland P-TC-220 vertical tumble chiller, 98 x 93 in. Published clearances 60 in front, 24 in rear, 12 in one side and 36 in the electrical side (carried as 24 in each side)'
  WHERE footprint_width_in IS NULL AND footprint_source IS NULL AND item = 'Tumble chiller / ice water bath system';
UPDATE muse.equipment SET footprint_width_in = NULL, footprint_depth_in = NULL, clearance_front_in = NULL, clearance_rear_in = NULL, clearance_side_in = NULL, footprint_basis = 'estimated', zone = NULL, under_hood = false, footprint_source = 'Mounts on the sealer or its conveyor; no incremental floor'
  WHERE footprint_width_in IS NULL AND footprint_source IS NULL AND item = 'Date and lot coder, inkjet';
UPDATE muse.equipment SET footprint_width_in = NULL, footprint_depth_in = NULL, clearance_front_in = NULL, clearance_rear_in = NULL, clearance_side_in = NULL, footprint_basis = 'estimated', zone = NULL, under_hood = false, footprint_source = 'Bench-mounted; no incremental floor'
  WHERE footprint_width_in IS NULL AND footprint_source IS NULL AND item = 'Label printer / applicator';
UPDATE muse.equipment SET footprint_width_in = 96, footprint_depth_in = 30, clearance_front_in = NULL, clearance_rear_in = NULL, clearance_side_in = NULL, footprint_basis = 'estimated', zone = 'Packaging', under_hood = false, footprint_source = 'Standard 96 x 30 in work table'
  WHERE footprint_width_in IS NULL AND footprint_source IS NULL AND item = 'Packaging tables, stainless';
UPDATE muse.equipment SET footprint_width_in = 50.39, footprint_depth_in = 42.83, clearance_front_in = NULL, clearance_rear_in = NULL, clearance_side_in = NULL, footprint_basis = 'sourced', zone = 'Packaging', under_hood = false, footprint_source = 'Ilpra FoodPack Synergy, 1280 x 1088 mm'
  WHERE footprint_width_in IS NULL AND footprint_source IS NULL AND item = 'Tray sealer, semi-automatic';
UPDATE muse.equipment SET footprint_width_in = 75, footprint_depth_in = 41, clearance_front_in = NULL, clearance_rear_in = NULL, clearance_side_in = NULL, footprint_basis = 'sourced', zone = 'Packaging', under_hood = false, footprint_source = 'VacMaster VP800 double chamber, 75 x 41 in'
  WHERE footprint_width_in IS NULL AND footprint_source IS NULL AND item = 'Vacuum packaging machine, chamber';
UPDATE muse.equipment SET footprint_width_in = 28, footprint_depth_in = 33, clearance_front_in = NULL, clearance_rear_in = NULL, clearance_side_in = NULL, footprint_basis = 'estimated', zone = 'Cold storage', under_hood = false, footprint_source = 'Standard mobile holding cabinet, 28 x 33 in'
  WHERE footprint_width_in IS NULL AND footprint_source IS NULL AND item = 'Mobile refrigerated holding cabinet';
UPDATE muse.equipment SET footprint_width_in = 54, footprint_depth_in = 34, clearance_front_in = NULL, clearance_rear_in = NULL, clearance_side_in = NULL, footprint_basis = 'estimated', zone = 'Cold storage', under_hood = false, footprint_source = 'Standard 2-section reach-in, 54 x 34 in'
  WHERE footprint_width_in IS NULL AND footprint_source IS NULL AND item = 'Reach-in refrigerator, 2-door';
UPDATE muse.equipment SET footprint_width_in = 144, footprint_depth_in = 240, clearance_front_in = NULL, clearance_rear_in = NULL, clearance_side_in = NULL, footprint_basis = 'sourced', zone = 'Walk-in', under_hood = false, footprint_source = 'Nominal 12 x 20 ft from the item name; door on the 12 ft wall'
  WHERE footprint_width_in IS NULL AND footprint_source IS NULL AND item = 'Walk-in cooler, 12x20, with refrigeration';
UPDATE muse.equipment SET footprint_width_in = 120, footprint_depth_in = 144, clearance_front_in = NULL, clearance_rear_in = NULL, clearance_side_in = NULL, footprint_basis = 'sourced', zone = 'Walk-in', under_hood = false, footprint_source = 'Nominal 10 x 12 ft from the item name; door on the 10 ft wall'
  WHERE footprint_width_in IS NULL AND footprint_source IS NULL AND item = 'Walk-in freezer, 10x12, with refrigeration';
UPDATE muse.equipment SET footprint_width_in = 120, footprint_depth_in = 144, clearance_front_in = NULL, clearance_rear_in = NULL, clearance_side_in = NULL, footprint_basis = 'sourced', zone = 'Walk-in', under_hood = false, footprint_source = 'Nominal 10 x 12 ft from the item name; door on the 10 ft wall'
  WHERE footprint_width_in IS NULL AND footprint_source IS NULL AND item = 'Walk-in cooler, 10x12, with refrigeration';
UPDATE muse.equipment SET footprint_width_in = 96, footprint_depth_in = 120, clearance_front_in = NULL, clearance_rear_in = NULL, clearance_side_in = NULL, footprint_basis = 'sourced', zone = 'Walk-in', under_hood = false, footprint_source = 'Nominal 8 x 10 ft from the item name; door on the 8 ft wall'
  WHERE footprint_width_in IS NULL AND footprint_source IS NULL AND item = 'Walk-in freezer, 8x10, with refrigeration';
UPDATE muse.equipment SET footprint_width_in = 12, footprint_depth_in = 8, clearance_front_in = NULL, clearance_rear_in = NULL, clearance_side_in = NULL, footprint_basis = 'estimated', zone = 'Warewash', under_hood = false, footprint_source = 'Lot of 6: five wall-hung hand sinks and one 24 x 24 in mop sink, averaged to 0.67 sq ft each'
  WHERE footprint_width_in IS NULL AND footprint_source IS NULL AND item = 'Hand sinks and mop sink';
UPDATE muse.equipment SET footprint_width_in = 120, footprint_depth_in = 30, clearance_front_in = NULL, clearance_rear_in = NULL, clearance_side_in = NULL, footprint_basis = 'estimated', zone = 'Warewash', under_hood = false, footprint_source = '3-comp with two drainboards, 120 x 30 in'
  WHERE footprint_width_in IS NULL AND footprint_source IS NULL AND item = 'Pot sink, 3-comp with disposer';
UPDATE muse.equipment SET footprint_width_in = 84, footprint_depth_in = 26.6875, clearance_front_in = NULL, clearance_rear_in = NULL, clearance_side_in = NULL, footprint_basis = 'sourced', zone = 'Warewash', under_hood = false, footprint_source = 'Champion 80 PRO-HD, 84 x 26-11/16 in'
  WHERE footprint_width_in IS NULL AND footprint_source IS NULL AND item = 'Rack conveyor dishwasher + booster';
UPDATE muse.equipment SET footprint_width_in = 36, footprint_depth_in = 24, clearance_front_in = NULL, clearance_rear_in = NULL, clearance_side_in = NULL, footprint_basis = 'estimated', zone = 'Warewash', under_hood = false, footprint_source = 'Standard sanitation cart, 36 x 24 in'
  WHERE footprint_width_in IS NULL AND footprint_source IS NULL AND item = 'Sanitation cart, chemical dispensing';
UPDATE muse.equipment SET footprint_width_in = NULL, footprint_depth_in = NULL, clearance_front_in = NULL, clearance_rear_in = NULL, clearance_side_in = NULL, footprint_basis = 'estimated', zone = NULL, under_hood = false, footprint_source = 'Lives in dry storage; that room is sized by program allowance'
  WHERE footprint_width_in IS NULL AND footprint_source IS NULL AND item = 'Wire shelving and dunnage racks';
UPDATE muse.equipment SET footprint_width_in = NULL, footprint_depth_in = NULL, clearance_front_in = NULL, clearance_rear_in = NULL, clearance_side_in = NULL, footprint_basis = 'estimated', zone = NULL, under_hood = false, footprint_source = 'Stored on the shelving above; no incremental floor'
  WHERE footprint_width_in IS NULL AND footprint_source IS NULL AND item = 'Sheet pans, hotel pans, cambros, smallwares';
UPDATE muse.equipment SET footprint_width_in = NULL, footprint_depth_in = NULL, clearance_front_in = NULL, clearance_rear_in = NULL, clearance_side_in = NULL, footprint_basis = 'estimated', zone = NULL, under_hood = false, footprint_source = 'Bench and dock-mounted; no incremental floor'
  WHERE footprint_width_in IS NULL AND footprint_source IS NULL AND item = 'Scales, receiving and portion';
UPDATE muse.equipment SET footprint_width_in = NULL, footprint_depth_in = NULL, clearance_front_in = NULL, clearance_rear_in = NULL, clearance_side_in = NULL, footprint_basis = 'estimated', zone = NULL, under_hood = false, footprint_source = 'No floor'
  WHERE footprint_width_in IS NULL AND footprint_source IS NULL AND item = 'Thermometers, dataloggers, calibration kit';
UPDATE muse.equipment SET footprint_width_in = 30, footprint_depth_in = 24, clearance_front_in = NULL, clearance_rear_in = NULL, clearance_side_in = NULL, footprint_basis = 'estimated', zone = 'Dispatch', under_hood = false, footprint_source = 'Standard insulated transport cart, 30 x 24 in'
  WHERE footprint_width_in IS NULL AND footprint_source IS NULL AND item = 'Insulated transport carts';
UPDATE muse.equipment SET footprint_width_in = NULL, footprint_depth_in = NULL, clearance_front_in = NULL, clearance_rear_in = NULL, clearance_side_in = NULL, footprint_basis = 'estimated', zone = NULL, under_hood = false, footprint_source = 'Vehicle. Dock and parking, not enclosed building area'
  WHERE footprint_width_in IS NULL AND footprint_source IS NULL AND item = 'Refrigerated delivery van';
UPDATE muse.equipment SET footprint_width_in = NULL, footprint_depth_in = NULL, clearance_front_in = NULL, clearance_rear_in = NULL, clearance_side_in = NULL, footprint_basis = 'estimated', zone = NULL, under_hood = false, footprint_source = 'IT closet; inside the support program'
  WHERE footprint_width_in IS NULL AND footprint_source IS NULL AND item = 'Network, temperature monitoring, cameras';
UPDATE muse.equipment SET footprint_width_in = NULL, footprint_depth_in = NULL, clearance_front_in = NULL, clearance_rear_in = NULL, clearance_side_in = NULL, footprint_basis = 'estimated', zone = NULL, under_hood = false, footprint_source = 'Bench-mounted; no incremental floor'
  WHERE footprint_width_in IS NULL AND footprint_source IS NULL AND item = 'Terminals, tablets, label printers';
UPDATE muse.equipment SET footprint_width_in = 32, footprint_depth_in = 36, clearance_front_in = NULL, clearance_rear_in = NULL, clearance_side_in = NULL, footprint_basis = 'estimated', zone = 'Dispatch', under_hood = false, footprint_source = 'Full-height insulated holding cabinet, 32 x 36 in'
  WHERE footprint_width_in IS NULL AND footprint_source IS NULL AND item = 'Hot holding cabinets, insulated';
UPDATE muse.equipment SET footprint_width_in = NULL, footprint_depth_in = NULL, clearance_front_in = NULL, clearance_rear_in = NULL, clearance_side_in = NULL, footprint_basis = 'estimated', zone = NULL, under_hood = false, footprint_source = 'Lot; stored on shelving in wares storage'
  WHERE footprint_width_in IS NULL AND footprint_source IS NULL AND item = 'Catering transport, chafing, beverage';
UPDATE muse.equipment SET footprint_width_in = NULL, footprint_depth_in = NULL, clearance_front_in = NULL, clearance_rear_in = NULL, clearance_side_in = NULL, footprint_basis = 'estimated', zone = NULL, under_hood = false, footprint_source = 'Vehicle. Dock and parking, not enclosed building area'
  WHERE footprint_width_in IS NULL AND footprint_source IS NULL AND item = 'Refrigerated delivery van, second';
UPDATE muse.equipment SET footprint_width_in = NULL, footprint_depth_in = NULL, clearance_front_in = NULL, clearance_rear_in = NULL, clearance_side_in = NULL, footprint_basis = 'estimated', zone = NULL, under_hood = false, footprint_source = 'Lot; stored on shelving in wares storage'
  WHERE footprint_width_in IS NULL AND footprint_source IS NULL AND item = 'Buffet and action station equipment';
UPDATE muse.equipment SET footprint_width_in = 32, footprint_depth_in = 36, clearance_front_in = NULL, clearance_rear_in = NULL, clearance_side_in = NULL, footprint_basis = 'estimated', zone = 'A la carte', under_hood = true, footprint_source = 'Double-vat floor fryer with filtration, 32 x 36 in'
  WHERE footprint_width_in IS NULL AND footprint_source IS NULL AND item = 'Fry station, double vat';
UPDATE muse.equipment SET footprint_width_in = 36, footprint_depth_in = 32, clearance_front_in = NULL, clearance_rear_in = NULL, clearance_side_in = NULL, footprint_basis = 'estimated', zone = 'A la carte', under_hood = true, footprint_source = '36 in griddle on an equipment stand'
  WHERE footprint_width_in IS NULL AND footprint_source IS NULL AND item = 'Griddle / plancha, 36 in';
UPDATE muse.equipment SET footprint_width_in = 36, footprint_depth_in = 32, clearance_front_in = NULL, clearance_rear_in = NULL, clearance_side_in = NULL, footprint_basis = 'estimated', zone = 'A la carte', under_hood = true, footprint_source = '36 in charbroiler on a stand; salamander wall-mounted'
  WHERE footprint_width_in IS NULL AND footprint_source IS NULL AND item = 'Charbroiler and salamander';
UPDATE muse.equipment SET footprint_width_in = 48, footprint_depth_in = 32, clearance_front_in = NULL, clearance_rear_in = NULL, clearance_side_in = NULL, footprint_basis = 'estimated', zone = 'A la carte', under_hood = false, footprint_source = 'Undercounter / worktop refrigeration, 48 x 32 in'
  WHERE footprint_width_in IS NULL AND footprint_source IS NULL AND item = 'A la carte line refrigeration units';
UPDATE muse.equipment SET footprint_width_in = 60, footprint_depth_in = 24, clearance_front_in = NULL, clearance_rear_in = NULL, clearance_side_in = NULL, footprint_basis = 'estimated', zone = 'A la carte', under_hood = false, footprint_source = 'Heated pass shelf unit, 60 x 24 in'
  WHERE footprint_width_in IS NULL AND footprint_source IS NULL AND item = 'Heated expo and pickup shelving';
UPDATE muse.equipment SET footprint_width_in = NULL, footprint_depth_in = NULL, clearance_front_in = NULL, clearance_rear_in = NULL, clearance_side_in = NULL, footprint_basis = 'estimated', zone = NULL, under_hood = false, footprint_source = 'Overhead; no floor. Drives hood linear feet through the units under it'
  WHERE footprint_width_in IS NULL AND footprint_source IS NULL AND item = 'Hood extension for the line';
UPDATE muse.equipment SET footprint_width_in = NULL, footprint_depth_in = NULL, clearance_front_in = NULL, clearance_rear_in = NULL, clearance_side_in = NULL, footprint_basis = 'estimated', zone = NULL, under_hood = false, footprint_source = 'Bench and wall-mounted; no incremental floor'
  WHERE footprint_width_in IS NULL AND footprint_source IS NULL AND item = 'POS and delivery integration hardware';
