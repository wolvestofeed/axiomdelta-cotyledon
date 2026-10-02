-- Cotyledon: a nutrient line's strength in ml per gallon.
--
-- Watering is in fluid ounces and every other volume in gallons, so a stored nutrient line's
-- `mlPerL` becomes `mlPerGal`: a typed strength is multiplied by 3.78541 and keeps its tag; a null
-- (the catalog's strength) stays null. Each workspace's rows are updated inside its own scope.

DO $$
DECLARE
  w record;
BEGIN
  FOR w IN SELECT id FROM farm.workspaces LOOP
    PERFORM set_config('app.workspace_id', w.id::text, true);
    UPDATE farm.grow_plan_lines
       SET line = (line - 'mlPerL') || jsonb_build_object(
             'mlPerGal',
             CASE
               WHEN jsonb_typeof(line->'mlPerL') = 'object' THEN
                 (line->'mlPerL')
                   || jsonb_build_object('value', round(((line->'mlPerL'->>'value')::numeric * 3.78541), 2))
                   || jsonb_build_object('unit', 'ml/gal')
               ELSE 'null'::jsonb
             END),
           updated_at = now()
     WHERE line->>'kind' = 'nutrient' AND line ? 'mlPerL';
  END LOOP;
  PERFORM set_config('app.workspace_id', '', true);
END $$;
