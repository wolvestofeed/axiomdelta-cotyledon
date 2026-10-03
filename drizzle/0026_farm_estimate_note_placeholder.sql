-- Cotyledon: the seeded estimate's note names what it stands on. Vallecito's 2023 tray figures are
-- the sheet's estimate, never observed, and are tagged PLACEHOLDER; the note on every estimated
-- study already seeded says so. No minute changes.

UPDATE farm.time_studies
SET quality_notes = replace(
  quality_notes,
  'Vallecito Micro Farm 2023 time study, 1020 tray grow cycle (DATED)',
  'Vallecito Micro Farm 2023 estimate, 1020 tray grow cycle, not observed (PLACEHOLDER)'
)
WHERE source = 'seed'
  AND basis = 'estimated'
  AND quality_notes LIKE '%Vallecito Micro Farm 2023 time study, 1020 tray grow cycle (DATED)%';
