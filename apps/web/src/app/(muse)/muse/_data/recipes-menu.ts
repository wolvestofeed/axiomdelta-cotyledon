/**
 * Impact OS — the ten-meal menu, as library seed rows.
 *
 * Source: Robert's baseline batch sheet (2026-09-13), 100 student portions per
 * recipe. Every as-purchased quantity and every yield the sheet states is
 * carried as STATED; where the sheet gives no yield the line carries 1.0 and
 * says so; every price and every cooked cup weight is a PLACEHOLDER until a
 * quote or a USDA FoodData Central lookup replaces it. Batch size is never
 * typed here: the engine derives it from the chilled mass of the hot components
 * (`deriveCapacity`), so the "final batch numbers" are what the Recipes and
 * Capacity pages compute from these lines.
 *
 * The student recipes serve School lunches only. The corporate / retail (adult)
 * portions are their own library rows, AMK-A-002 … AMK-A-011, derived from the
 * student recipe. The PROTEIN SERVING LEADS (Robert, 2026-09-13): recipe
 * development says how many ounces of chicken, beef or beans an adult meal
 * serves, and where a meal has no spec yet the target defaults by meal type —
 * meat 6 oz (the sheet's range is 6 or 8), plant-based 4 oz (4 to 6) — as a
 * PLACEHOLDER. The protein lines are scaled so the plated protein reaches the
 * target (the multiplier is DERIVED, never below 1); the vegetable lines take
 * the sheet's 1.6 (PLACEHOLDER, the low end of 1.6–2.0); grains, sides and
 * seasonings are the student recipe's. An order that names an adult recipe is
 * counted at that recipe's portion; the channel portion factor no longer
 * applies to it.
 *
 * The code recipe AMK-E-001 (the operating model's costed bowl) stays the
 * reference recipe; the student menu is AMK-E-002 … AMK-E-011 in sheet order.
 */

import { recipe as codeRecipe, type IngredientLine, type RecipeDef, type RecipeSpec } from './plan-data';
import { tagged, type StatusTag } from './tagged';
import { lunchPattern, type CreditingSpec, type GradeGroup } from './meal-pattern';

const SHEET = "Baseline batch sheet (Robert, 2026-09-13), 100 student portions";

export const MENU_CODES = ['AMK-E-002', 'AMK-E-003', 'AMK-E-004', 'AMK-E-005', 'AMK-E-006', 'AMK-E-007', 'AMK-E-008', 'AMK-E-009', 'AMK-E-010', 'AMK-E-011'] as const;
export const ADULT_CODES = ['AMK-A-002', 'AMK-A-003', 'AMK-A-004', 'AMK-A-005', 'AMK-A-006', 'AMK-A-007', 'AMK-A-008', 'AMK-A-009', 'AMK-A-010', 'AMK-A-011'] as const;

/** The sheet's range for the adult upgrade of vegetable lines. */
export const ADULT_UPGRADE_RANGE = { low: 1.6, high: 2.0 } as const;
/** Placeholder vegetable multiplier until each meal's upgrade spec names its own. */
export const ADULT_UPGRADE_PLACEHOLDER = ADULT_UPGRADE_RANGE.low;

/** Adult protein serving targets, plated oz, when recipe development has not named the meal's own. */
export const ADULT_PROTEIN_TARGET_OZ = {
  meat: { low: 6, high: 8, default: 6 },
  plant: { low: 4, high: 6, default: 4 },
} as const;

export type ProteinKind = 'meat' | 'plant';

/**
 * The protein of each meal: the lines whose plated ounces are the serving
 * recipe development sets, and whether the meal is meat or plant-based.
 * Explicit, not inferred from crediting (black beans on the fajita plate are a
 * side; the chicken is the protein; on the beef bowl the sheet's beef-and-bean
 * mix is the protein, so both lines scale).
 */
export const MEAL_PROTEIN: Record<string, { kind: ProteinKind; lines: string[] }> = {
  'AMK-E-002': { kind: 'meat', lines: ['Ground beef, regenerative', 'Black beans, cooked'] },
  'AMK-E-003': { kind: 'meat', lines: ['Chicken thighs, boneless skinless'] },
  'AMK-E-004': { kind: 'meat', lines: ['Gulf drum / redfish, raw'] },
  'AMK-E-005': { kind: 'meat', lines: ['Chicken, cooked and diced'] },
  'AMK-E-006': { kind: 'plant', lines: ['Heirloom bean blend, dry'] },
  'AMK-E-007': { kind: 'meat', lines: ['Chicken breast strips, raw'] },
  'AMK-E-008': { kind: 'meat', lines: ['Beef and pork blend, regenerative'] },
  'AMK-E-009': { kind: 'meat', lines: ['Pork shoulder, heritage'] },
  'AMK-E-010': { kind: 'plant', lines: ['Pinto beans, dry', 'Cheese, shredded'] },
  'AMK-E-011': { kind: 'meat', lines: ['Chicken, diced raw'] },
};

/**
 * Per-meal adult protein servings from recipe development, plated oz. Empty
 * until a meal's spec is received; a meal not listed here takes the default
 * for its kind as a placeholder.
 */
export const ADULT_PROTEIN_SPEC_OZ: Record<string, number> = {};

// ── Crediting shorthands ────────────────────────────────────────────────────
const NONE: CreditingSpec = { component: 'NONE', status: 'STATED', source: 'Seasoning, binder, sauce or fat; does not credit toward a meal component.' };
const MMA: CreditingSpec = { component: 'MMA', status: 'SOURCED', source: 'USDA Food Buying Guide §1: cooked lean meat, poultry or fish without bone credits 1 oz = 1 oz eq.' };
const CHEESE: CreditingSpec = { component: 'MMA', status: 'SOURCED', source: 'FBG §1: natural or processed cheese credits 1 oz = 1 oz eq M/MA.' };
const beansMma = (cupWeightG: number, status: StatusTag, source: string): CreditingSpec => ({ component: 'MMA', legumeElection: 'MMA', vegSubgroup: 'BEANS_PEAS_LENTILS', cupWeightG, status, source: `Cooked beans credit 1/4 cup = 1 oz eq M/MA (FBG §1); this line elects M/MA (7 CFR 210.10(c)(2)(ii)(C)). ${source}` });
const veg = (vegSubgroup: NonNullable<CreditingSpec['vegSubgroup']>, cupWeightG: number, status: StatusTag = 'PLACEHOLDER'): CreditingSpec => ({ component: 'VEG', vegSubgroup, cupWeightG, status, source: status === 'PLACEHOLDER' ? `Cooked cup weight ${cupWeightG} g is a working figure pending a USDA FoodData Central lookup; the subgroup is as read from the sheet.` : `Cup weight ${cupWeightG} g.` });
const fruit = (cupWeightG: number): CreditingSpec => ({ component: 'FRUIT', cupWeightG, status: 'PLACEHOLDER', source: `Cup weight ${cupWeightG} g is a working figure pending a USDA FoodData Central lookup.` });
const grainH = (cupWeightG: number, status: StatusTag, source: string): CreditingSpec => ({ component: 'GRAINS', grainGroup: 'H', cupWeightG, status, source: `Exhibit A Group H: 1/2 cup cooked grain or pasta = 1 oz eq. ${source}` });
const grainEach = (group: 'A' | 'B' | 'C', unitWeightG: number, what: string): CreditingSpec => ({ component: 'GRAINS', grainGroup: group, unitWeightG, status: 'STATED', source: `Exhibit A Group ${group}. Unit weight ${unitWeightG} g per the sheet (${what}).` });
const grainLb = (group: 'A' | 'B' | 'C', what: string): CreditingSpec => ({ component: 'GRAINS', grainGroup: group, status: 'STATED', source: `Exhibit A Group ${group}; ${what}.` });

// ── Line shorthand ──────────────────────────────────────────────────────────
interface L {
  n: string;
  comp: string;
  ap: number;
  cost: number;
  unit?: 'lb' | 'each';
  /** Yield to cooked as the sheet states it; omit when the sheet gives none. */
  y?: number;
  ySheet?: string;
  hot?: boolean;
  pack?: number;
  massOz?: number;
  credit?: CreditingSpec;
  spec?: string;
  priceStatus?: StatusTag;
  priceSource?: string;
  /**
   * FDA Food Traceability List category (21 CFR 1.1990) the line falls under AS RECEIVED.
   * By default the kitchen buys raw and cuts in house (Robert, 2026-09-19), so a line is on
   * the list as its whole food is — finfish, melons, fresh herbs, fresh peppers. A line bought
   * pre-cut carries the fresh-cut category instead. Set per line, never read from the name;
   * absent means out of scope.
   */
  ftl?: string;
}

function line(l: L): IngredientLine {
  const unit = l.unit ?? 'lb';
  const y = l.y ?? 1;
  const stated = l.y !== undefined;
  return {
    name: l.n,
    component: l.comp,
    spec: l.spec ?? '',
    apQtyPerBatch: l.ap,
    unit,
    yieldToCooked: y,
    cookedYieldPerBatch: l.ap * y,
    apUnitCost: l.cost,
    packSize: l.pack ?? (unit === 'each' ? 100 : 25),
    isHotComponent: l.hot ?? true,
    unitMassOz: l.massOz,
    status: l.priceStatus ?? 'PLACEHOLDER',
    source: l.priceSource ?? 'Placeholder, quote required',
    yieldStatus: stated ? 'STATED' : 'PLACEHOLDER',
    yieldSource: stated
      ? `${SHEET}: ${l.ySheet ?? `${l.ap} lb raw yields ~${Math.round(l.ap * y * 10) / 10} lb cooked`}.`
      : `No yield on the baseline sheet; 1.0 carried until a pan is weighed.`,
    crediting: l.credit ?? NONE,
    ...(l.ftl !== undefined ? { foodTraceabilityList: l.ftl } : {}),
  };
}

/** The same absorbed-liquid pattern as the code recipe: mass lands in the grain line, cost on its own line. */
const absorbed = (n: string, comp: string, ap: number, cost: number, spec = ''): IngredientLine =>
  line({ n, comp, ap, cost, y: 0, ySheet: `${n} is absorbed into the cooked component; its mass is carried on the grain line`, spec });

function spec(): RecipeSpec {
  const g: GradeGroup = '9-12';
  const p = lunchPattern(g);
  return {
    gradeGroup: tagged<GradeGroup>(g, 'PLACEHOLDER', 'grade group', 'The baseline sheet says "student portions" and no grade group; 9-12 is carried as a placeholder until the district contract names one.'),
    creditTarget: {
      mmaOzEq: tagged(p.mma.dailyMin, 'SOURCED', 'oz eq', `7 CFR 210.10(c) grades ${g} lunch daily minimum, meats/meat alternates`),
      grainsOzEq: tagged(p.grains.dailyMin, 'SOURCED', 'oz eq', `7 CFR 210.10(c) grades ${g} lunch daily minimum, grains`),
    },
    carriesVegetableRequirement: tagged<boolean>(false, 'STATED', 'boolean', 'Sides complete the reimbursable meal unless this is set.'),
    servingVesselCapacityOz: tagged(16, 'PLACEHOLDER', 'oz', 'Vessel capacity — the hard physical bound on plated weight. A packaging quote replaces it.'),
    portioningUtensil: tagged<string>('not specified', 'PLACEHOLDER', 'utensil', 'A standardized recipe states the serving utensil by size. Required for the production record.'),
  };
}

function mk(code: string, name: string, components: string, method: string, allergens: string, ingredients: IngredientLine[]): RecipeDef {
  return {
    code,
    name,
    category: 'Hot entree, school lunch (student portion)',
    status: 'in_service',
    channels: [1],
    components,
    productionMethod: `Cook-chill. ${method} ${SHEET}.`,
    allergensPresent: allergens,
    allergenFreeClaims: '',
    batchPortions: 100,
    spec: spec(),
    ingredients,
  };
}

const BEEF_SOURCE = { priceStatus: 'SOURCED' as StatusTag, priceSource: 'USDA Q2 2026 grass-fed 80–89% lean avg $10.67/lb retail. $7.50 is a direct-from-ranch volume target.' };
const PINTO_SOURCE = { priceStatus: 'SOURCED' as StatusTag, priceSource: 'WebstaurantStore organic dried pinto, 25 lb at $44.99 = $1.80/lb' };
const RICE_H = grainH(202, 'SOURCED', 'Cup weight 202 g per USDA FoodData Central, rice, brown, long-grain, cooked.');
const BROTH_LB_PER_GAL = 8.34;

export const menuRecipes: RecipeDef[] = [
  mk('AMK-E-002', 'Regenerative Beef & Black Bean Bowl',
    'Seasoned regenerative ground beef and black beans, Spanish brown rice, fresh pico de gallo with roasted local corn',
    'Beef and beans cooked and seasoned; rice cooked in broth with tomato paste; both blast chilled. Pico and corn packed cold.',
    'None declared (verify the taco seasoning)',
    [
      line({ n: 'Ground beef, regenerative', comp: 'Beef & bean mix', ap: 12, cost: 7.5, y: 0.75, ySheet: '12 lb raw regenerative ground beef yields ~9 lb cooked', credit: MMA, spec: 'Regenerative, Central TX ranch', ...BEEF_SOURCE }),
      line({ n: 'Black beans, cooked', comp: 'Beef & bean mix', ap: 6.5, cost: 2.2, y: 1, ySheet: '6.5 lb cooked organic black beans, no further loss', credit: beansMma(172, 'UNCONFIRMED', 'Cup weight 172 g believed from USDA FoodData Central, black beans, cooked; not yet verified.'), spec: 'Certified organic' }),
      line({ n: 'Taco seasoning', comp: 'Beef & bean mix', ap: 1, cost: 8, y: 1, ySheet: '1 lb seasoning carried into the mix', pack: 5 }),
      line({ n: 'Brown rice, dry', comp: 'Spanish rice', ap: 10, cost: 1.55, y: 2.5, ySheet: '10 lb dry brown rice yields ~25 lb cooked with the broth and tomato paste', credit: RICE_H, spec: 'Certified organic' }),
      absorbed('Vegetable broth, low sodium', 'Spanish rice', BROTH_LB_PER_GAL, 1.2, '1 gal'),
      absorbed('Tomato paste', 'Spanish rice', 1, 2.5),
      line({ n: 'Pico de gallo with roasted corn', comp: 'Pico & corn', ap: 12.5, cost: 3.5, hot: false, credit: veg('OTHER', 160), spec: 'Fresh mild pico, roasted local corn' }),
    ]),
  mk('AMK-E-003', 'Hill Country Smoked Chicken & Sweet Potato Hash',
    'Smoked boneless chicken thighs, roasted sweet potato hash with smoked paprika, steamed green beans',
    'Thighs cooked in the combi oven at 250–275°F; sweet potato diced, oiled and roasted; green beans steamed; all blast chilled.',
    'None declared',
    [
      line({ n: 'Chicken thighs, boneless skinless', comp: 'Smoked chicken', ap: 24, cost: 3.25, y: 18.7 / 24, ySheet: '24 lb raw thighs yields ~18.7 lb cooked/smoked', credit: MMA, spec: 'Pasture-raised' }),
      line({ n: 'Sweet potatoes', comp: 'Sweet potato hash', ap: 28, cost: 1.1, y: 25 / 28, ySheet: '28 lb raw diced sweet potato yields ~25 lb roasted', credit: veg('RED_ORANGE', 200), pack: 40 }),
      absorbed('Olive oil', 'Sweet potato hash', 0.125, 9, '2 oz'),
      line({ n: 'Smoked paprika', comp: 'Sweet potato hash', ap: 0.25, cost: 12, y: 1, ySheet: 'seasoning carried into the hash', pack: 5 }),
      line({ n: 'Green beans, fresh', comp: 'Green beans', ap: 26, cost: 2.4, credit: veg('OTHER', 125), spec: 'Steamed' }),
    ]),
  mk('AMK-E-004', 'Gulf Coast Fish & Crispy Potatoes',
    'Cornmeal-crusted Gulf drum or redfish bites, roasted potato wedges, carrot matchsticks',
    'Fish breaded and baked; potato wedges oiled and roasted; carrots steamed or roasted; all blast chilled.',
    'Fish',
    [
      line({ n: 'Gulf drum / redfish, raw', comp: 'Fish bites', ftl: 'Finfish', ap: 23, cost: 9, y: 18.7 / 23, ySheet: '23 lb raw fish with 2 lb breading yields ~18.7 lb cooked', credit: MMA, spec: 'Gulf of Mexico, wild' }),
      absorbed('Whole grain cornmeal breading', 'Fish bites', 2, 1.2),
      line({ n: 'Potato wedges, raw', comp: 'Crispy potatoes', ap: 28, cost: 0.9, y: 25 / 28, ySheet: '28 lb raw potato wedges yields ~25 lb roasted', credit: veg('STARCHY', 150), pack: 50 }),
      absorbed('Olive oil', 'Crispy potatoes', 0.25, 9, '4 oz'),
      line({ n: 'Carrot matchsticks', comp: 'Carrots', ap: 25, cost: 1.0, credit: veg('RED_ORANGE', 155), spec: 'Local; steamed or roasted' }),
    ]),
  mk('AMK-E-005', 'Texas Farmhouse Chicken Salad',
    'Diced chicken salad with celery, egg mayo or Greek yogurt and dill; whole grain crackers; Texas melon cubes',
    'Chicken cooked, diced and blast chilled; salad assembled cold; crackers and melon packed cold.',
    'Egg (mayo) or milk (Greek yogurt), wheat (crackers)',
    [
      line({ n: 'Chicken, cooked and diced', comp: 'Chicken salad', ap: 18, cost: 5.5, y: 1, ySheet: '18 lb cooked/diced chicken', credit: MMA, spec: 'Pasture-raised' }),
      line({ n: 'Celery, diced', comp: 'Chicken salad', ap: 3, cost: 1.5, y: 1, ySheet: 'raw into the salad', hot: false, credit: veg('OTHER', 150), spec: 'Certified organic' }),
      line({ n: 'Egg mayo or Greek yogurt', comp: 'Chicken salad', ap: 3, cost: 4, y: 1, ySheet: 'dressing into the salad', hot: false, pack: 10, spec: 'Pasture-raised egg mayo or Greek yogurt' }),
      line({ n: 'Dill, fresh', comp: 'Chicken salad', ftl: 'Herbs (fresh)', ap: 0.1, cost: 12, y: 1, ySheet: 'herb into the salad', hot: false, pack: 1 }),
      line({ n: 'Whole grain crackers', comp: 'Crackers', ap: 6.5, cost: 4.5, y: 1, ySheet: '6.5 lb = 1 oz per portion', hot: false, credit: grainLb('A', '1 oz per portion as served'), pack: 10 }),
      line({ n: 'Texas melon, cubed', comp: 'Melon', ftl: 'Melons (fresh)', ap: 25, cost: 1.6, y: 1, ySheet: '25 lb fresh melon cubes', hot: false, credit: fruit(170), pack: 40 }),
    ]),
  mk('AMK-E-006', 'Three-Bean & Root Vegetable Texas Chili',
    'Heirloom three-bean chili with carrots, onions and crushed tomato (6 oz portions); heritage cornbread; roasted zucchini',
    'Beans cooked from dry with the vegetables, tomato and broth; zucchini roasted; both blast chilled. Cornbread packed cold.',
    'Wheat, egg, milk (cornbread — verify the recipe)',
    [
      line({ n: 'Heirloom bean blend, dry', comp: 'Chili', ap: 10, cost: 2.6, y: 2.2, ySheet: '10 lb dry heirloom bean blend yields ~22 lb cooked', credit: beansMma(171, 'UNCONFIRMED', 'Cup weight 171 g carried from cooked pinto beans; the blend has not been weighed.'), spec: 'Heirloom blend' }),
      line({ n: 'Carrots and onions, diced', comp: 'Chili', ap: 5, cost: 1.3, y: 1, ySheet: 'into the chili', credit: veg('OTHER', 150), spec: 'Certified organic' }),
      line({ n: 'Crushed tomatoes', comp: 'Chili', ap: 15, cost: 1.4, y: 1, ySheet: 'into the chili', credit: veg('RED_ORANGE', 242, 'UNCONFIRMED'), pack: 30 }),
      line({ n: 'Vegetable broth', comp: 'Chili', ap: 3, cost: 1.2, y: 1, ySheet: 'into the chili' }),
      line({ n: 'Chili spices', comp: 'Chili', ap: 0.5, cost: 8, y: 1, ySheet: 'seasoning carried into the chili', pack: 5 }),
      line({ n: 'Heritage cornbread', comp: 'Cornbread', ap: 12.5, cost: 3, y: 1, ySheet: '12.5 lb = 2 oz per portion', hot: false, credit: grainLb('C', '2 oz per portion as served'), pack: 10 }),
      line({ n: 'Zucchini, raw', comp: 'Roasted zucchini', ap: 28, cost: 1.8, y: 25 / 28, ySheet: '28 lb raw zucchini yields ~25 lb roasted', credit: veg('OTHER', 180), pack: 40 }),
    ]),
  mk('AMK-E-007', 'Pasture-Raised Chicken Fajitas',
    'Chicken breast strips, sautéed bell peppers and onions, whole wheat tortillas, black beans',
    'Chicken and vegetables sautéed and blast chilled; beans heated and chilled; tortillas packed cold.',
    'Wheat (tortillas)',
    [
      line({ n: 'Chicken breast strips, raw', comp: 'Fajita chicken', ap: 24, cost: 4.25, y: 18.7 / 24, ySheet: '24 lb raw chicken breast strips yields ~18.7 lb cooked', credit: MMA, spec: 'Pasture-raised' }),
      line({ n: 'Bell peppers and onions, sliced', comp: 'Fajita vegetables', ftl: 'Peppers (fresh)', ap: 22, cost: 1.9, credit: veg('OTHER', 150), spec: 'Sautéed', pack: 40 }),
      line({ n: 'Whole wheat tortilla, 1 oz', comp: 'Tortillas', ap: 100, unit: 'each', cost: 0.15, y: 1, ySheet: '100 tortillas at 1 oz each, packed cold', hot: false, massOz: 1, credit: grainEach('B', 28, '1 oz each'), pack: 120 }),
      line({ n: 'Black beans, cooked', comp: 'Black beans', ap: 19, cost: 2.2, y: 1, ySheet: '19 lb cooked = 3 oz per portion', credit: beansMma(172, 'UNCONFIRMED', 'Cup weight 172 g believed from USDA FoodData Central, black beans, cooked; not yet verified.') }),
    ]),
  mk('AMK-E-008', 'Regenerative Meatballs with Hidden-Veg Marinara',
    'Beef and pork meatballs (3 oz), whole wheat penne, tomato purée marinara blended with roasted carrots and spinach',
    'Meatballs formed with oat-flour binder and baked; penne cooked; marinara blended and heated; all blast chilled.',
    'Wheat (penne); oats (binder)',
    [
      line({ n: 'Beef and pork blend, regenerative', comp: 'Meatballs', ap: 22, cost: 6.5, y: 0.85, ySheet: '22 lb raw blend with 2 lb binder yields ~18.7 lb cooked', credit: MMA, spec: 'Regenerative beef/pork blend' }),
      absorbed('Oat flour and binders', 'Meatballs', 2, 2),
      line({ n: 'Whole wheat penne, dry', comp: 'Penne', ap: 11, cost: 1.8, y: 25 / 11, ySheet: '11 lb dry whole wheat penne yields ~25 lb cooked', credit: grainH(140, 'PLACEHOLDER', 'Cooked cup weight 140 g is a working figure pending a USDA FoodData Central lookup.') }),
      line({ n: 'Tomato purée marinara with roasted carrots and spinach', comp: 'Marinara', ap: 25, cost: 1.5, y: 1, ySheet: '25 lb blended', credit: veg('RED_ORANGE', 245), spec: 'Certified organic', pack: 30 }),
    ]),
  mk('AMK-E-009', 'BBQ Pulled Pork with Green Apple Cabbage Slaw',
    'Heritage pork shoulder, pulled and tossed in low-sugar BBQ sauce; whole grain bun; green apple cabbage slaw',
    'Shoulder roasted overnight in the combi oven at 225°F and held at 160°F, pulled by the morning shift, sauced and blast chilled; slaw assembled cold; buns packed cold.',
    'Wheat (buns)',
    [
      line({ n: 'Pork shoulder, heritage', comp: 'Pulled pork', ap: 26, cost: 3.75, y: 18.7 / 26, ySheet: '26 lb raw pork shoulder yields ~18.7 lb cooked/pulled', credit: MMA, spec: 'Heritage breed' }),
      line({ n: 'BBQ sauce, low sugar', comp: 'Pulled pork', ap: 2, cost: 3, y: 1, ySheet: 'tossed with the pork', pack: 10 }),
      line({ n: 'Whole grain bun, 2–2.5 oz', comp: 'Buns', ap: 100, unit: 'each', cost: 0.45, y: 1, ySheet: '100 buns at 2–2.5 oz each, packed cold', hot: false, massOz: 2.25, credit: grainEach('B', 64, '2.25 oz each, the midpoint of 2–2.5 oz'), pack: 48 }),
      line({ n: 'Cabbage, shredded', comp: 'Apple cabbage slaw', ap: 20, cost: 0.9, y: 1, ySheet: 'raw into the slaw', hot: false, credit: veg('OTHER', 150), spec: 'Certified organic', pack: 50 }),
      line({ n: 'Green apples, julienned', comp: 'Apple cabbage slaw', ap: 5, cost: 1.6, y: 1, ySheet: 'raw into the slaw', hot: false, credit: fruit(110), pack: 40 }),
      line({ n: 'Apple cider vinaigrette', comp: 'Apple cabbage slaw', ap: 2, cost: 4, y: 1, ySheet: 'dressing into the slaw', hot: false, pack: 10 }),
    ]),
  mk('AMK-E-010', 'Roasted Squash & Corn Enchilada Casserole',
    'Layered casserole (6 oz) of roasted summer squash, roasted corn, mild enchilada sauce, cheese and corn tortillas; pinto beans',
    'Squash and corn roasted; casserole layered, baked and blast chilled; beans cooked from dry and chilled.',
    'Milk (cheese)',
    [
      line({ n: 'Summer squash, roasted', comp: 'Enchilada casserole', ap: 10, cost: 1.8, y: 1, ySheet: '10 lb roasted squash into the casserole', credit: veg('OTHER', 180), spec: 'Certified organic', pack: 40 }),
      line({ n: 'Corn, roasted', comp: 'Enchilada casserole', ap: 8, cost: 1.5, y: 1, ySheet: '8 lb roasted corn into the casserole', credit: veg('STARCHY', 165) }),
      line({ n: 'Enchilada sauce, mild', comp: 'Enchilada casserole', ap: 12, cost: 2.2, y: 1, ySheet: '12 lb sauce into the casserole', pack: 30 }),
      line({ n: 'Cheese, shredded', comp: 'Enchilada casserole', ap: 5, cost: 5.4, y: 1, ySheet: '5 lb shredded cheese into the casserole', credit: CHEESE, pack: 5 }),
      line({ n: 'Corn tortillas, layered', comp: 'Enchilada casserole', ap: 5, cost: 1.8, y: 1, ySheet: '5 lb non-GMO corn tortillas layered', credit: grainLb('B', '0.8 oz per portion as served, 28 g = 1 oz eq'), spec: 'Non-GMO', pack: 10 }),
      line({ n: 'Pinto beans, dry', comp: 'Pinto beans', ap: 25 / 1.9792, cost: 1.8, y: 1.9792, ySheet: '25 lb cooked pinto beans, backed out to dry at the USDA FBG drained yield of 1.979 lb cooked per lb dry', credit: beansMma(171, 'SOURCED', 'Cup weight 171 g per USDA FoodData Central, pinto beans, cooked.'), spec: 'Certified organic', ...PINTO_SOURCE }),
    ]),
  mk('AMK-E-011', 'Honey-Garlic Chicken with Sesame Broccoli',
    'Diced chicken in local honey-garlic glaze, brown rice, steamed broccoli florets finished with sesame seeds',
    'Chicken cooked and glazed; rice cooked; broccoli steamed; all blast chilled.',
    'Sesame',
    [
      line({ n: 'Chicken, diced raw', comp: 'Honey-garlic chicken', ap: 24, cost: 4.25, y: 18.7 / 24, ySheet: '24 lb raw diced chicken yields ~18.7 lb cooked', credit: MMA, spec: 'Pasture-raised' }),
      line({ n: 'Honey-garlic glaze, local honey', comp: 'Honey-garlic chicken', ap: 2, cost: 5, y: 1, ySheet: 'tossed with the chicken', pack: 10 }),
      line({ n: 'Brown rice, dry', comp: 'Brown rice', ap: 10, cost: 1.55, y: 2.5, ySheet: '10 lb dry brown rice yields ~25 lb cooked', credit: RICE_H, spec: 'Certified organic' }),
      line({ n: 'Broccoli florets, raw', comp: 'Sesame broccoli', ap: 28, cost: 2.2, y: 25 / 28, ySheet: '28 lb raw broccoli florets yields ~25 lb steamed', credit: veg('DARK_GREEN', 156), spec: 'Certified organic', pack: 40 }),
      line({ n: 'Sesame seeds', comp: 'Sesame broccoli', ap: 0.25, cost: 6, y: 1, ySheet: 'finish on the broccoli', pack: 5 }),
    ]),
];

/** Plated ounces per portion of a line: cooked yield over the authored batch, or each-units × unit mass. */
function platedOz(l: IngredientLine, batchPortions: number): number {
  return l.unit === 'each' ? (l.cookedYieldPerBatch / batchPortions) * (l.unitMassOz ?? 0) : (l.cookedYieldPerBatch / batchPortions) * 16;
}

/** True for the vegetable lines the sheet scales for an adult portion. */
export function isVegetableLine(l: IngredientLine): boolean {
  return l.crediting?.component === 'VEG';
}

export function isProteinLine(student: RecipeDef, l: IngredientLine): boolean {
  return (MEAL_PROTEIN[student.code]?.lines ?? []).includes(l.name);
}

/** True for the lines the sheet scales for an adult portion: protein and vegetables. */
export function isUpgradedLine(l: IngredientLine, student?: RecipeDef): boolean {
  return isVegetableLine(l) || (student ? isProteinLine(student, l) : l.crediting?.component === 'MMA');
}

/** The protein a student recipe plates per portion, oz, over its named protein lines. */
export function studentProteinOz(student: RecipeDef): number {
  return student.ingredients.filter((l) => isProteinLine(student, l)).reduce((s, l) => s + platedOz(l, student.batchPortions), 0);
}

export interface AdultOptions {
  /** Plated protein the adult meal serves, oz. Omit = the meal's spec, else the default for its kind. */
  proteinTargetOz?: number;
  /** Provenance of the protein target: STATED when recipe development named it. */
  proteinStatus?: StatusTag;
  /** Multiplier on the vegetable lines. Omit = the sheet's 1.6 placeholder. */
  vegetableMultiplier?: number;
  vegetableStatus?: StatusTag;
}

/**
 * The adult (corporate / retail) variant of a student recipe. The protein
 * lines are scaled so the plated protein reaches the target (the multiplier is
 * derived and never below 1 — an adult meal is not smaller than the student
 * one); the vegetable lines take their multiplier; every other line is the
 * student's. Cooked yields, chilled mass and the batch size follow through the
 * same chain. Codes AMK-E-nnn → AMK-A-nnn, on Corporate catering and Ghost
 * kitchen.
 */
export function adultVariant(student: RecipeDef, opts: AdultOptions = {}): RecipeDef {
  const code = student.code.replace(/^AMK-E-/, 'AMK-A-');
  const meal = MEAL_PROTEIN[student.code];
  const kind: ProteinKind = meal?.kind ?? 'meat';
  const spec = ADULT_PROTEIN_SPEC_OZ[student.code];
  const proteinTargetOz = opts.proteinTargetOz ?? spec ?? ADULT_PROTEIN_TARGET_OZ[kind].default;
  const proteinStatus: StatusTag = opts.proteinStatus ?? (opts.proteinTargetOz !== undefined || spec !== undefined ? 'STATED' : 'PLACEHOLDER');
  const servedOz = studentProteinOz(student);
  const proteinMultiplier = servedOz > 0 ? Math.max(1, proteinTargetOz / servedOz) : 1;
  const vegetableMultiplier = opts.vegetableMultiplier ?? ADULT_UPGRADE_PLACEHOLDER;
  const vegetableStatus: StatusTag = opts.vegetableStatus ?? (opts.vegetableMultiplier !== undefined ? 'STATED' : 'PLACEHOLDER');
  const range = ADULT_PROTEIN_TARGET_OZ[kind];
  const scale = (l: IngredientLine, m: number, why: string): IngredientLine => ({
    ...l,
    apQtyPerBatch: l.apQtyPerBatch * m,
    cookedYieldPerBatch: l.apQtyPerBatch * m * l.yieldToCooked,
    yieldSource: `${l.yieldSource} Adult portion: quantity × ${m.toFixed(3)} (${why}).`,
  });
  return {
    ...student,
    code,
    name: `${student.name} (adult)`,
    category: 'Hot entree, corporate / retail (adult portion)',
    channels: [2, 3],
    productionMethod: `${student.productionMethod} Adult portion: ${kind === 'meat' ? 'meat' : 'plant-based'} protein plated at ${proteinTargetOz} oz (${proteinStatus === 'STATED' ? 'recipe development' : `placeholder — the default for a ${kind === 'meat' ? 'meat' : 'plant-based'} meal, ${range.low}–${range.high} oz, until the meal's own serving is set`}), protein lines × ${proteinMultiplier.toFixed(2)}; vegetable lines × ${vegetableMultiplier}${vegetableStatus === 'STATED' ? '' : ` (placeholder, the low end of the sheet's ${ADULT_UPGRADE_RANGE.low}–${ADULT_UPGRADE_RANGE.high})`}; grains, sides and seasonings as the student recipe.`,
    spec: {
      ...student.spec,
      proteinTargetOz: tagged(proteinTargetOz, proteinStatus, 'oz plated protein', proteinStatus === 'STATED' ? 'Adult protein serving from recipe development.' : `Default for a ${kind === 'meat' ? 'meat' : 'plant-based'} meal (${range.low}–${range.high} oz) until recipe development names this meal's serving.`),
      upgradeMultiplier: tagged(proteinMultiplier, 'DERIVED', '× student protein lines', `${proteinTargetOz} oz target ÷ ${servedOz.toFixed(2)} oz the student recipe plates${proteinMultiplier === 1 && servedOz > proteinTargetOz ? '; the student serving already exceeds the target, so the lines are not reduced' : ''}.`),
      vegetableMultiplier: tagged(vegetableMultiplier, vegetableStatus, '× student vegetable lines', vegetableStatus === 'STATED' ? "Per the meal's upgrade spec." : `Low end of the sheet's ${ADULT_UPGRADE_RANGE.low}–${ADULT_UPGRADE_RANGE.high} range; the meal's upgrade spec replaces it.`),
    },
    ingredients: student.ingredients.map((l) =>
      isProteinLine(student, l)
        ? scale(l, proteinMultiplier, `${proteinTargetOz} oz protein target`)
        : isVegetableLine(l)
          ? scale(l, vegetableMultiplier, 'vegetable upgrade')
          : { ...l },
    ),
  };
}

export const adultRecipes: RecipeDef[] = menuRecipes.map((r) => adultVariant(r));

/** What the library seeds itself with: the code recipe first (the reference), the student menu, then the adult menu. */
/** The code recipe AMK-E-001 is listed last (Robert, 2026-09-14). */
export const seedLibrary: RecipeDef[] = [...menuRecipes, ...adultRecipes, codeRecipe];
