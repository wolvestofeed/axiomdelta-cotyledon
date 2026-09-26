/**
 * MicroFarm — the ten-unit menu, as library seed rows.
 *
 * Source: Robert's baseline sowing sheet (2026-09-13), 100 student units per
 * crop plan. Every as-purchased quantity and every yield the sheet states is
 * carried as STATED; where the sheet gives no yield the line carries 1.0 and
 * says so; every price and every harvested cup weight is a PLACEHOLDER until a
 * quote or a USDA FoodData Central lookup replaces it. Sowing size is never
 * typed here: the engine derives it from the canopy mass of the hot components
 * (`deriveCapacity`), so the "final sowing numbers" are what the Crop plans and
 * Capacity pages compute from these lines.
 *
 * The student crop plans serve Subscriptions only. The corporate / retail (adult)
 * units are their own library rows, AMK-A-002 … AMK-A-011, derived from the
 * student crop plan. The PROTEIN SERVING LEADS: crop plan
 * development says how many ounces of chicken, beef or beans an adult unit
 * serves, and where a unit has no spec yet the target defaults by unit type —
 * meat 6 oz (the sheet's range is 6 or 8), plant-based 4 oz (4 to 6) — as a
 * PLACEHOLDER. The protein lines are scaled so the packed protein reaches the
 * target (the multiplier is DERIVED, never below 1); the vegetable lines take
 * the sheet's 1.6 (PLACEHOLDER, the low end of 1.6–2.0); grains, sides and
 * seasonings are the student crop plan's. An order that names an adult crop plan is
 * counted at that crop plan's unit; the channel unit factor no longer
 * applies to it.
 *
 * The code crop plan AMK-E-001 (the operating model's costed bowl) stays the
 * reference crop plan; the student menu is AMK-E-002 … AMK-E-011 in sheet order.
 */

import { cropPlan as codeCropPlan, type InputLine, type CropPlanDef, type CropPlanSpec } from '@/data/plan-data';
import { tagged, type StatusTag } from '@/data/tagged';
import { nutrientProfile, type NutritionSpec, type TrayFormat } from '@/data/nutrient-profile';

const SHEET = "Baseline sowing sheet, 100 student units";

export const MENU_CODES = ['AMK-E-002', 'AMK-E-003', 'AMK-E-004', 'AMK-E-005', 'AMK-E-006', 'AMK-E-007', 'AMK-E-008', 'AMK-E-009', 'AMK-E-010', 'AMK-E-011'] as const;
export const ADULT_CODES = ['AMK-A-002', 'AMK-A-003', 'AMK-A-004', 'AMK-A-005', 'AMK-A-006', 'AMK-A-007', 'AMK-A-008', 'AMK-A-009', 'AMK-A-010', 'AMK-A-011'] as const;

/** The sheet's range for the adult upgrade of vegetable lines. */
export const ADULT_UPGRADE_RANGE = { low: 1.6, high: 2.0 } as const;
/** Placeholder vegetable multiplier until each unit's upgrade spec names its own. */
export const ADULT_UPGRADE_PLACEHOLDER = ADULT_UPGRADE_RANGE.low;

/** Adult protein serving targets, packed oz, when crop plan development has not named the unit's own. */
export const ADULT_PROTEIN_TARGET_OZ = {
  meat: { low: 6, high: 8, default: 6 },
  plant: { low: 4, high: 6, default: 4 },
} as const;

export type ProteinKind = 'meat' | 'plant';

/**
 * The protein of each unit: the lines whose packed ounces are the serving
 * crop plan development sets, and whether the unit is meat or plant-based.
 * Explicit, not inferred from nutrition (black beans on the fajita pack are a
 * side; the chicken is the protein; on the beef bowl the sheet's beef-and-bean
 * mix is the protein, so both lines scale).
 */
export const UNIT_PROTEIN: Record<string, { kind: ProteinKind; lines: string[] }> = {
  'AMK-E-002': { kind: 'meat', lines: ['Ground beef, regenerative', 'Black beans, harvested'] },
  'AMK-E-003': { kind: 'meat', lines: ['Chicken thighs, boneless skinless'] },
  'AMK-E-004': { kind: 'meat', lines: ['Gulf drum / redfish, raw'] },
  'AMK-E-005': { kind: 'meat', lines: ['Chicken, harvested and diced'] },
  'AMK-E-006': { kind: 'plant', lines: ['Heirloom bean blend, dry'] },
  'AMK-E-007': { kind: 'meat', lines: ['Chicken breast strips, raw'] },
  'AMK-E-008': { kind: 'meat', lines: ['Beef and pork blend, regenerative'] },
  'AMK-E-009': { kind: 'meat', lines: ['Pork shoulder, heritage'] },
  'AMK-E-010': { kind: 'plant', lines: ['Pinto beans, dry', 'Cheese, shredded'] },
  'AMK-E-011': { kind: 'meat', lines: ['Chicken, diced raw'] },
};

/**
 * Per-unit adult protein servings from crop plan development, packed oz. Empty
 * until a unit's spec is received; a unit not listed here takes the default
 * for its kind as a placeholder.
 */
export const ADULT_PROTEIN_SPEC_OZ: Record<string, number> = {};

// ── Nutrition shorthands ────────────────────────────────────────────────────
const NONE: NutritionSpec = { component: 'NONE', status: 'STATED', source: 'Seasoning, binder, sauce or fat; does not credit toward a unit component.' };
const MMA: NutritionSpec = { component: 'MMA', status: 'SOURCED', source: 'USDA Food Buying Guide §1: harvested lean meat, poultry or fish without bone credits 1 oz = 1 oz eq.' };
const CHEESE: NutritionSpec = { component: 'MMA', status: 'SOURCED', source: 'FBG §1: natural or processed cheese credits 1 oz = 1 oz eq M/MA.' };
const beansMma = (cupWeightG: number, status: StatusTag, source: string): NutritionSpec => ({ component: 'MMA', legumeElection: 'MMA', vegSubgroup: 'BEANS_PEAS_LENTILS', cupWeightG, status, source: `Harvested beans credit 1/4 cup = 1 oz eq M/MA (FBG §1); this line elects M/MA (7 CFR 210.10(c)(2)(ii)(C)). ${source}` });
const veg = (vegSubgroup: NonNullable<NutritionSpec['vegSubgroup']>, cupWeightG: number, status: StatusTag = 'PLACEHOLDER'): NutritionSpec => ({ component: 'VEG', vegSubgroup, cupWeightG, status, source: status === 'PLACEHOLDER' ? `Harvested cup weight ${cupWeightG} g is a working figure pending a USDA FoodData Central lookup; the subgroup is as read from the sheet.` : `Cup weight ${cupWeightG} g.` });
const fruit = (cupWeightG: number): NutritionSpec => ({ component: 'FRUIT', cupWeightG, status: 'PLACEHOLDER', source: `Cup weight ${cupWeightG} g is a working figure pending a USDA FoodData Central lookup.` });
const grainH = (cupWeightG: number, status: StatusTag, source: string): NutritionSpec => ({ component: 'GRAINS', grainGroup: 'H', cupWeightG, status, source: `Exhibit A Group H: 1/2 cup harvested grain or pasta = 1 oz eq. ${source}` });
const grainEach = (group: 'A' | 'B' | 'C', unitWeightG: number, what: string): NutritionSpec => ({ component: 'GRAINS', grainGroup: group, unitWeightG, status: 'STATED', source: `Exhibit A Group ${group}. Unit weight ${unitWeightG} g per the sheet (${what}).` });
const grainLb = (group: 'A' | 'B' | 'C', what: string): NutritionSpec => ({ component: 'GRAINS', grainGroup: group, status: 'STATED', source: `Exhibit A Group ${group}; ${what}.` });

// ── Line shorthand ──────────────────────────────────────────────────────────
interface L {
  n: string;
  comp: string;
  seed: number;
  cost: number;
  unit?: 'lb' | 'each';
  /** Yield to harvested as the sheet states it; omit when the sheet gives none. */
  y?: number;
  ySheet?: string;
  hot?: boolean;
  pack?: number;
  massOz?: number;
  credit?: NutritionSpec;
  spec?: string;
  priceStatus?: StatusTag;
  priceSource?: string;
  /**
   * FDA Food Traceability List category (21 CFR 1.1990) the line falls under AS RECEIVED.
   * By default the farm buys raw and cuts in house, so a line is on
   * the list as its whole food is — finfish, melons, fresh herbs, fresh peppers. A line bought
   * pre-cut carries the fresh-cut category instead. Set per line, never read from the name;
   * absent means out of scope.
   */
  ftl?: string;
}

function line(l: L): InputLine {
  const unit = l.unit ?? 'lb';
  const y = l.y ?? 1;
  const stated = l.y !== undefined;
  return {
    name: l.n,
    component: l.comp,
    spec: l.spec ?? '',
    seedQtyPerSowing: l.seed,
    unit,
    yieldToHarvest: y,
    harvestedYieldPerSowing: l.seed * y,
    seedUnitCost: l.cost,
    packSize: l.pack ?? (unit === 'each' ? 100 : 25),
    isHotComponent: l.hot ?? true,
    unitMassOz: l.massOz,
    status: l.priceStatus ?? 'PLACEHOLDER',
    source: l.priceSource ?? 'Placeholder, quote required',
    yieldStatus: stated ? 'STATED' : 'PLACEHOLDER',
    yieldSource: stated
      ? `${SHEET}: ${l.ySheet ?? `${l.seed} lb raw yields ~${Math.round(l.seed * y * 10) / 10} lb harvested`}.`
      : `No yield on the baseline sheet; 1.0 carried until a pan is weighed.`,
    nutrition: l.credit ?? NONE,
    ...(l.ftl !== undefined ? { foodTraceabilityList: l.ftl } : {}),
  };
}

/** The same absorbed-liquid pattern as the code crop plan: mass lands in the grain line, cost on its own line. */
const absorbed = (n: string, comp: string, seed: number, cost: number, spec = ''): InputLine =>
  line({ n, comp, seed, cost, y: 0, ySheet: `${n} is absorbed into the harvested component; its mass is carried on the grain line`, spec });

function spec(): CropPlanSpec {
  const g: TrayFormat = '9-12';
  const p = nutrientProfile(g);
  return {
    trayFormat: tagged<TrayFormat>(g, 'PLACEHOLDER', 'tray format', 'The baseline sheet says "student units" and no tray format; 9-12 is carried as a placeholder until the district contract names one.'),
    nutritionTarget: {
      mmaOzEq: tagged(p.mma.dailyMin, 'SOURCED', 'oz eq', `7 CFR 210.10(c) grades ${g} unit daily minimum, meats/meat alternates`),
      grainsOzEq: tagged(p.grains.dailyMin, 'SOURCED', 'oz eq', `7 CFR 210.10(c) grades ${g} unit daily minimum, grains`),
    },
    carriesVegetableRequirement: tagged<boolean>(false, 'STATED', 'boolean', 'Sides complete the reimbursable unit unless this is set.'),
    servingGrowUnitCapacityOz: tagged(16, 'PLACEHOLDER', 'oz', 'Grow unit capacity — the hard physical bound on packed weight. A packaging quote replaces it.'),
    packingUtensil: tagged<string>('not specified', 'PLACEHOLDER', 'utensil', 'A standardized crop plan states the serving utensil by size. Required for the production record.'),
  };
}

function mk(code: string, name: string, components: string, method: string, allergens: string, inputs: InputLine[]): CropPlanDef {
  return {
    code,
    name,
    category: 'Hot entree, subscription (student unit)',
    status: 'in_service',
    channels: [1],
    components,
    productionMethod: `Grow. ${method} ${SHEET}.`,
    allergensPresent: allergens,
    allergenFreeClaims: '',
    sowingUnits: 100,
    spec: spec(),
    inputs,
  };
}

const BEEF_SOURCE = { priceStatus: 'SOURCED' as StatusTag, priceSource: 'USDA Q2 2026 grass-fed 80–89% lean avg $10.67/lb retail. $7.50 is a direct-from-ranch volume target.' };
const PINTO_SOURCE = { priceStatus: 'SOURCED' as StatusTag, priceSource: 'WebstaurantStore organic dried pinto, 25 lb at $44.99 = $1.80/lb' };
const RICE_H = grainH(202, 'SOURCED', 'Cup weight 202 g per USDA FoodData Central, rice, brown, long-grain, harvested.');
const BROTH_LB_PER_GAL = 8.34;

export const menuCropPlans: CropPlanDef[] = [
  mk('AMK-E-002', 'Regenerative Beef & Black Bean Bowl',
    'Seasoned regenerative ground beef and black beans, Spanish brown rice, fresh pico de gallo with roasted local corn',
    'Beef and beans harvested and seasoned; rice harvested in broth with tomato paste; both blackouted. Pico and corn packed cold.',
    'None declared (verify the taco seasoning)',
    [
      line({ n: 'Ground beef, regenerative', comp: 'Beef & bean mix', seed: 12, cost: 7.5, y: 0.75, ySheet: '12 lb raw regenerative ground beef yields ~9 lb harvested', credit: MMA, spec: 'Regenerative, Central TX ranch', ...BEEF_SOURCE }),
      line({ n: 'Black beans, harvested', comp: 'Beef & bean mix', seed: 6.5, cost: 2.2, y: 1, ySheet: '6.5 lb harvested organic black beans, no further loss', credit: beansMma(172, 'UNCONFIRMED', 'Cup weight 172 g believed from USDA FoodData Central, black beans, harvested; not yet verified.'), spec: 'Certified organic' }),
      line({ n: 'Taco seasoning', comp: 'Beef & bean mix', seed: 1, cost: 8, y: 1, ySheet: '1 lb seasoning carried into the mix', pack: 5 }),
      line({ n: 'Brown rice, dry', comp: 'Spanish rice', seed: 10, cost: 1.55, y: 2.5, ySheet: '10 lb dry brown rice yields ~25 lb harvested with the broth and tomato paste', credit: RICE_H, spec: 'Certified organic' }),
      absorbed('Vegetable broth, low sodium', 'Spanish rice', BROTH_LB_PER_GAL, 1.2, '1 gal'),
      absorbed('Tomato paste', 'Spanish rice', 1, 2.5),
      line({ n: 'Pico de gallo with roasted corn', comp: 'Pico & corn', seed: 12.5, cost: 3.5, hot: false, credit: veg('OTHER', 160), spec: 'Fresh mild pico, roasted local corn' }),
    ]),
  mk('AMK-E-003', 'Hill Country Smoked Chicken & Sweet Potato Hash',
    'Smoked boneless chicken thighs, roasted sweet potato hash with smoked paprika, steamed green beans',
    'Thighs harvested in the jar stand oven at 250–275°F; sweet potato diced, oiled and roasted; green beans steamed; all blackouted.',
    'None declared',
    [
      line({ n: 'Chicken thighs, boneless skinless', comp: 'Smoked chicken', seed: 24, cost: 3.25, y: 18.7 / 24, ySheet: '24 lb raw thighs yields ~18.7 lb harvested/smoked', credit: MMA, spec: 'Pasture-raised' }),
      line({ n: 'Sweet potatoes', comp: 'Sweet potato hash', seed: 28, cost: 1.1, y: 25 / 28, ySheet: '28 lb raw diced sweet potato yields ~25 lb roasted', credit: veg('RED_ORANGE', 200), pack: 40 }),
      absorbed('Olive oil', 'Sweet potato hash', 0.125, 9, '2 oz'),
      line({ n: 'Smoked paprika', comp: 'Sweet potato hash', seed: 0.25, cost: 12, y: 1, ySheet: 'seasoning carried into the hash', pack: 5 }),
      line({ n: 'Green beans, fresh', comp: 'Green beans', seed: 26, cost: 2.4, credit: veg('OTHER', 125), spec: 'Steamed' }),
    ]),
  mk('AMK-E-004', 'Gulf Coast Fish & Crispy Potatoes',
    'Cornmeal-crusted Gulf drum or redfish bites, roasted potato wedges, carrot matchsticks',
    'Fish breaded and baked; potato wedges oiled and roasted; carrots steamed or roasted; all blackouted.',
    'Fish',
    [
      line({ n: 'Gulf drum / redfish, raw', comp: 'Fish bites', ftl: 'Finfish', seed: 23, cost: 9, y: 18.7 / 23, ySheet: '23 lb raw fish with 2 lb breading yields ~18.7 lb harvested', credit: MMA, spec: 'Gulf of Mexico, wild' }),
      absorbed('Whole grain cornmeal breading', 'Fish bites', 2, 1.2),
      line({ n: 'Potato wedges, raw', comp: 'Crispy potatoes', seed: 28, cost: 0.9, y: 25 / 28, ySheet: '28 lb raw potato wedges yields ~25 lb roasted', credit: veg('STARCHY', 150), pack: 50 }),
      absorbed('Olive oil', 'Crispy potatoes', 0.25, 9, '4 oz'),
      line({ n: 'Carrot matchsticks', comp: 'Carrots', seed: 25, cost: 1.0, credit: veg('RED_ORANGE', 155), spec: 'Local; steamed or roasted' }),
    ]),
  mk('AMK-E-005', 'Texas Farmhouse Chicken Salad',
    'Diced chicken salad with celery, egg mayo or Greek yogurt and dill; whole grain crackers; Texas melon cubes',
    'Chicken harvested, diced and blackouted; salad assembled cold; crackers and melon packed cold.',
    'Egg (mayo) or milk (Greek yogurt), wheat (crackers)',
    [
      line({ n: 'Chicken, harvested and diced', comp: 'Chicken salad', seed: 18, cost: 5.5, y: 1, ySheet: '18 lb harvested/diced chicken', credit: MMA, spec: 'Pasture-raised' }),
      line({ n: 'Celery, diced', comp: 'Chicken salad', seed: 3, cost: 1.5, y: 1, ySheet: 'raw into the salad', hot: false, credit: veg('OTHER', 150), spec: 'Certified organic' }),
      line({ n: 'Egg mayo or Greek yogurt', comp: 'Chicken salad', seed: 3, cost: 4, y: 1, ySheet: 'dressing into the salad', hot: false, pack: 10, spec: 'Pasture-raised egg mayo or Greek yogurt' }),
      line({ n: 'Dill, fresh', comp: 'Chicken salad', ftl: 'Herbs (fresh)', seed: 0.1, cost: 12, y: 1, ySheet: 'herb into the salad', hot: false, pack: 1 }),
      line({ n: 'Whole grain crackers', comp: 'Crackers', seed: 6.5, cost: 4.5, y: 1, ySheet: '6.5 lb = 1 oz per unit', hot: false, credit: grainLb('A', '1 oz per unit as served'), pack: 10 }),
      line({ n: 'Texas melon, cubed', comp: 'Melon', ftl: 'Melons (fresh)', seed: 25, cost: 1.6, y: 1, ySheet: '25 lb fresh melon cubes', hot: false, credit: fruit(170), pack: 40 }),
    ]),
  mk('AMK-E-006', 'Three-Bean & Root Vegetable Texas Chili',
    'Heirloom three-bean chili with carrots, onions and crushed tomato (6 oz units); heritage cornbread; roasted zucchini',
    'Beans harvested from dry with the vegetables, tomato and broth; zucchini roasted; both blackouted. Cornbread packed cold.',
    'Wheat, egg, milk (cornbread — verify the crop plan)',
    [
      line({ n: 'Heirloom bean blend, dry', comp: 'Chili', seed: 10, cost: 2.6, y: 2.2, ySheet: '10 lb dry heirloom bean blend yields ~22 lb harvested', credit: beansMma(171, 'UNCONFIRMED', 'Cup weight 171 g carried from harvested pinto beans; the blend has not been weighed.'), spec: 'Heirloom blend' }),
      line({ n: 'Carrots and onions, diced', comp: 'Chili', seed: 5, cost: 1.3, y: 1, ySheet: 'into the chili', credit: veg('OTHER', 150), spec: 'Certified organic' }),
      line({ n: 'Crushed tomatoes', comp: 'Chili', seed: 15, cost: 1.4, y: 1, ySheet: 'into the chili', credit: veg('RED_ORANGE', 242, 'UNCONFIRMED'), pack: 30 }),
      line({ n: 'Vegetable broth', comp: 'Chili', seed: 3, cost: 1.2, y: 1, ySheet: 'into the chili' }),
      line({ n: 'Chili spices', comp: 'Chili', seed: 0.5, cost: 8, y: 1, ySheet: 'seasoning carried into the chili', pack: 5 }),
      line({ n: 'Heritage cornbread', comp: 'Cornbread', seed: 12.5, cost: 3, y: 1, ySheet: '12.5 lb = 2 oz per unit', hot: false, credit: grainLb('C', '2 oz per unit as served'), pack: 10 }),
      line({ n: 'Zucchini, raw', comp: 'Roasted zucchini', seed: 28, cost: 1.8, y: 25 / 28, ySheet: '28 lb raw zucchini yields ~25 lb roasted', credit: veg('OTHER', 180), pack: 40 }),
    ]),
  mk('AMK-E-007', 'Pasture-Raised Chicken Fajitas',
    'Chicken breast strips, sautéed bell peppers and onions, whole wheat tortillas, black beans',
    'Chicken and vegetables sautéed and blackouted; beans heated and blackout; tortillas packed cold.',
    'Wheat (tortillas)',
    [
      line({ n: 'Chicken breast strips, raw', comp: 'Fajita chicken', seed: 24, cost: 4.25, y: 18.7 / 24, ySheet: '24 lb raw chicken breast strips yields ~18.7 lb harvested', credit: MMA, spec: 'Pasture-raised' }),
      line({ n: 'Bell peppers and onions, sliced', comp: 'Fajita vegetables', ftl: 'Peppers (fresh)', seed: 22, cost: 1.9, credit: veg('OTHER', 150), spec: 'Sautéed', pack: 40 }),
      line({ n: 'Whole wheat tortilla, 1 oz', comp: 'Tortillas', seed: 100, unit: 'each', cost: 0.15, y: 1, ySheet: '100 tortillas at 1 oz each, packed cold', hot: false, massOz: 1, credit: grainEach('B', 28, '1 oz each'), pack: 120 }),
      line({ n: 'Black beans, harvested', comp: 'Black beans', seed: 19, cost: 2.2, y: 1, ySheet: '19 lb harvested = 3 oz per unit', credit: beansMma(172, 'UNCONFIRMED', 'Cup weight 172 g believed from USDA FoodData Central, black beans, harvested; not yet verified.') }),
    ]),
  mk('AMK-E-008', 'Regenerative Meatballs with Hidden-Veg Marinara',
    'Beef and pork meatballs (3 oz), whole wheat penne, tomato purée marinara blended with roasted carrots and spinach',
    'Meatballs formed with oat-flour binder and baked; penne harvested; marinara blended and heated; all blackouted.',
    'Wheat (penne); oats (binder)',
    [
      line({ n: 'Beef and pork blend, regenerative', comp: 'Meatballs', seed: 22, cost: 6.5, y: 0.85, ySheet: '22 lb raw blend with 2 lb binder yields ~18.7 lb harvested', credit: MMA, spec: 'Regenerative beef/pork blend' }),
      absorbed('Oat flour and binders', 'Meatballs', 2, 2),
      line({ n: 'Whole wheat penne, dry', comp: 'Penne', seed: 11, cost: 1.8, y: 25 / 11, ySheet: '11 lb dry whole wheat penne yields ~25 lb harvested', credit: grainH(140, 'PLACEHOLDER', 'Harvested cup weight 140 g is a working figure pending a USDA FoodData Central lookup.') }),
      line({ n: 'Tomato purée marinara with roasted carrots and spinach', comp: 'Marinara', seed: 25, cost: 1.5, y: 1, ySheet: '25 lb blended', credit: veg('RED_ORANGE', 245), spec: 'Certified organic', pack: 30 }),
    ]),
  mk('AMK-E-009', 'BBQ Pulled Pork with Green Apple Cabbage Slaw',
    'Heritage pork shoulder, pulled and tossed in low-sugar BBQ sauce; whole grain bun; green apple cabbage slaw',
    'Shoulder roasted overnight in the jar stand oven at 225°F and held at 160°F, pulled by the morning shift, sauced and blackouted; slaw assembled cold; buns packed cold.',
    'Wheat (buns)',
    [
      line({ n: 'Pork shoulder, heritage', comp: 'Pulled pork', seed: 26, cost: 3.75, y: 18.7 / 26, ySheet: '26 lb raw pork shoulder yields ~18.7 lb harvested/pulled', credit: MMA, spec: 'Heritage breed' }),
      line({ n: 'BBQ sauce, low sugar', comp: 'Pulled pork', seed: 2, cost: 3, y: 1, ySheet: 'tossed with the pork', pack: 10 }),
      line({ n: 'Whole grain bun, 2–2.5 oz', comp: 'Buns', seed: 100, unit: 'each', cost: 0.45, y: 1, ySheet: '100 buns at 2–2.5 oz each, packed cold', hot: false, massOz: 2.25, credit: grainEach('B', 64, '2.25 oz each, the midpoint of 2–2.5 oz'), pack: 48 }),
      line({ n: 'Cabbage, shredded', comp: 'Apple cabbage slaw', seed: 20, cost: 0.9, y: 1, ySheet: 'raw into the slaw', hot: false, credit: veg('OTHER', 150), spec: 'Certified organic', pack: 50 }),
      line({ n: 'Green apples, julienned', comp: 'Apple cabbage slaw', seed: 5, cost: 1.6, y: 1, ySheet: 'raw into the slaw', hot: false, credit: fruit(110), pack: 40 }),
      line({ n: 'Apple cider vinaigrette', comp: 'Apple cabbage slaw', seed: 2, cost: 4, y: 1, ySheet: 'dressing into the slaw', hot: false, pack: 10 }),
    ]),
  mk('AMK-E-010', 'Roasted Squash & Corn Enchilada Casserole',
    'Layered casserole (6 oz) of roasted summer squash, roasted corn, mild enchilada sauce, cheese and corn tortillas; pinto beans',
    'Squash and corn roasted; casserole layered, baked and blackouted; beans harvested from dry and blackout.',
    'Milk (cheese)',
    [
      line({ n: 'Summer squash, roasted', comp: 'Enchilada casserole', seed: 10, cost: 1.8, y: 1, ySheet: '10 lb roasted squash into the casserole', credit: veg('OTHER', 180), spec: 'Certified organic', pack: 40 }),
      line({ n: 'Corn, roasted', comp: 'Enchilada casserole', seed: 8, cost: 1.5, y: 1, ySheet: '8 lb roasted corn into the casserole', credit: veg('STARCHY', 165) }),
      line({ n: 'Enchilada sauce, mild', comp: 'Enchilada casserole', seed: 12, cost: 2.2, y: 1, ySheet: '12 lb sauce into the casserole', pack: 30 }),
      line({ n: 'Cheese, shredded', comp: 'Enchilada casserole', seed: 5, cost: 5.4, y: 1, ySheet: '5 lb shredded cheese into the casserole', credit: CHEESE, pack: 5 }),
      line({ n: 'Corn tortillas, layered', comp: 'Enchilada casserole', seed: 5, cost: 1.8, y: 1, ySheet: '5 lb non-GMO corn tortillas layered', credit: grainLb('B', '0.8 oz per unit as served, 28 g = 1 oz eq'), spec: 'Non-GMO', pack: 10 }),
      line({ n: 'Pinto beans, dry', comp: 'Pinto beans', seed: 25 / 1.9792, cost: 1.8, y: 1.9792, ySheet: '25 lb harvested pinto beans, backed out to dry at the USDA FBG drained yield of 1.979 lb harvested per lb dry', credit: beansMma(171, 'SOURCED', 'Cup weight 171 g per USDA FoodData Central, pinto beans, harvested.'), spec: 'Certified organic', ...PINTO_SOURCE }),
    ]),
  mk('AMK-E-011', 'Honey-Garlic Chicken with Sesame Broccoli',
    'Diced chicken in local honey-garlic glaze, brown rice, steamed broccoli florets finished with sesame seeds',
    'Chicken harvested and glazed; rice harvested; broccoli steamed; all blackouted.',
    'Sesame',
    [
      line({ n: 'Chicken, diced raw', comp: 'Honey-garlic chicken', seed: 24, cost: 4.25, y: 18.7 / 24, ySheet: '24 lb raw diced chicken yields ~18.7 lb harvested', credit: MMA, spec: 'Pasture-raised' }),
      line({ n: 'Honey-garlic glaze, local honey', comp: 'Honey-garlic chicken', seed: 2, cost: 5, y: 1, ySheet: 'tossed with the chicken', pack: 10 }),
      line({ n: 'Brown rice, dry', comp: 'Brown rice', seed: 10, cost: 1.55, y: 2.5, ySheet: '10 lb dry brown rice yields ~25 lb harvested', credit: RICE_H, spec: 'Certified organic' }),
      line({ n: 'Broccoli florets, raw', comp: 'Sesame broccoli', seed: 28, cost: 2.2, y: 25 / 28, ySheet: '28 lb raw broccoli florets yields ~25 lb steamed', credit: veg('DARK_GREEN', 156), spec: 'Certified organic', pack: 40 }),
      line({ n: 'Sesame seeds', comp: 'Sesame broccoli', seed: 0.25, cost: 6, y: 1, ySheet: 'finish on the broccoli', pack: 5 }),
    ]),
];

/** Packed ounces per unit of a line: harvested yield over the authored sowing, or each-units × unit mass. */
function packedOz(l: InputLine, sowingUnits: number): number {
  return l.unit === 'each' ? (l.harvestedYieldPerSowing / sowingUnits) * (l.unitMassOz ?? 0) : (l.harvestedYieldPerSowing / sowingUnits) * 16;
}

/** True for the vegetable lines the sheet scales for an adult unit. */
export function isVegetableLine(l: InputLine): boolean {
  return l.nutrition?.component === 'VEG';
}

export function isProteinLine(student: CropPlanDef, l: InputLine): boolean {
  return (UNIT_PROTEIN[student.code]?.lines ?? []).includes(l.name);
}

/** True for the lines the sheet scales for an adult unit: protein and vegetables. */
export function isUpgradedLine(l: InputLine, student?: CropPlanDef): boolean {
  return isVegetableLine(l) || (student ? isProteinLine(student, l) : l.nutrition?.component === 'MMA');
}

/** The protein a student crop plan plates per unit, oz, over its named protein lines. */
export function studentProteinOz(student: CropPlanDef): number {
  return student.inputs.filter((l) => isProteinLine(student, l)).reduce((s, l) => s + packedOz(l, student.sowingUnits), 0);
}

export interface AdultOptions {
  /** Packed protein the adult unit serves, oz. Omit = the unit's spec, else the default for its kind. */
  proteinTargetOz?: number;
  /** Provenance of the protein target: STATED when crop plan development named it. */
  proteinStatus?: StatusTag;
  /** Multiplier on the vegetable lines. Omit = the sheet's 1.6 placeholder. */
  vegetableMultiplier?: number;
  vegetableStatus?: StatusTag;
}

/**
 * The adult (corporate / retail) variant of a student crop plan. The protein
 * lines are scaled so the packed protein reaches the target (the multiplier is
 * derived and never below 1 — an adult unit is not smaller than the student
 * one); the vegetable lines take their multiplier; every other line is the
 * student's. Harvested yields, canopy mass and the sowing size follow through the
 * same chain. Codes AMK-E-nnn → AMK-A-nnn, on Restaurants and Ghost
 * farm.
 */
export function adultVariant(student: CropPlanDef, opts: AdultOptions = {}): CropPlanDef {
  const code = student.code.replace(/^AMK-E-/, 'AMK-A-');
  const unit = UNIT_PROTEIN[student.code];
  const kind: ProteinKind = unit?.kind ?? 'meat';
  const spec = ADULT_PROTEIN_SPEC_OZ[student.code];
  const proteinTargetOz = opts.proteinTargetOz ?? spec ?? ADULT_PROTEIN_TARGET_OZ[kind].default;
  const proteinStatus: StatusTag = opts.proteinStatus ?? (opts.proteinTargetOz !== undefined || spec !== undefined ? 'STATED' : 'PLACEHOLDER');
  const servedOz = studentProteinOz(student);
  const proteinMultiplier = servedOz > 0 ? Math.max(1, proteinTargetOz / servedOz) : 1;
  const vegetableMultiplier = opts.vegetableMultiplier ?? ADULT_UPGRADE_PLACEHOLDER;
  const vegetableStatus: StatusTag = opts.vegetableStatus ?? (opts.vegetableMultiplier !== undefined ? 'STATED' : 'PLACEHOLDER');
  const range = ADULT_PROTEIN_TARGET_OZ[kind];
  const scale = (l: InputLine, m: number, why: string): InputLine => ({
    ...l,
    seedQtyPerSowing: l.seedQtyPerSowing * m,
    harvestedYieldPerSowing: l.seedQtyPerSowing * m * l.yieldToHarvest,
    yieldSource: `${l.yieldSource} Adult unit: quantity × ${m.toFixed(3)} (${why}).`,
  });
  return {
    ...student,
    code,
    name: `${student.name} (adult)`,
    category: 'Hot entree, corporate / retail (adult unit)',
    channels: [2, 3],
    productionMethod: `${student.productionMethod} Adult unit: ${kind === 'meat' ? 'meat' : 'plant-based'} protein packed at ${proteinTargetOz} oz (${proteinStatus === 'STATED' ? 'cropPlan development' : `placeholder — the default for a ${kind === 'meat' ? 'meat' : 'plant-based'} unit, ${range.low}–${range.high} oz, until the unit's own serving is set`}), protein lines × ${proteinMultiplier.toFixed(2)}; vegetable lines × ${vegetableMultiplier}${vegetableStatus === 'STATED' ? '' : ` (placeholder, the low end of the sheet's ${ADULT_UPGRADE_RANGE.low}–${ADULT_UPGRADE_RANGE.high})`}; grains, sides and seasonings as the student crop plan.`,
    spec: {
      ...student.spec,
      proteinTargetOz: tagged(proteinTargetOz, proteinStatus, 'oz packed protein', proteinStatus === 'STATED' ? 'Adult protein serving from crop plan development.' : `Default for a ${kind === 'meat' ? 'meat' : 'plant-based'} unit (${range.low}–${range.high} oz) until crop plan development names this unit's serving.`),
      upgradeMultiplier: tagged(proteinMultiplier, 'DERIVED', '× student protein lines', `${proteinTargetOz} oz target ÷ ${servedOz.toFixed(2)} oz the student crop plan plates${proteinMultiplier === 1 && servedOz > proteinTargetOz ? '; the student serving already exceeds the target, so the lines are not reduced' : ''}.`),
      vegetableMultiplier: tagged(vegetableMultiplier, vegetableStatus, '× student vegetable lines', vegetableStatus === 'STATED' ? "Per the unit's upgrade spec." : `Low end of the sheet's ${ADULT_UPGRADE_RANGE.low}–${ADULT_UPGRADE_RANGE.high} range; the unit's upgrade spec replaces it.`),
    },
    inputs: student.inputs.map((l) =>
      isProteinLine(student, l)
        ? scale(l, proteinMultiplier, `${proteinTargetOz} oz protein target`)
        : isVegetableLine(l)
          ? scale(l, vegetableMultiplier, 'vegetable upgrade')
          : { ...l },
    ),
  };
}

export const adultCropPlans: CropPlanDef[] = menuCropPlans.map((r) => adultVariant(r));

/** What the library seeds itself with: the code crop plan first (the reference), the student menu, then the adult menu. */
/** The code crop plan AMK-E-001 is listed last. */
export const seedLibrary: CropPlanDef[] = [...menuCropPlans, ...adultCropPlans, codeCropPlan];
