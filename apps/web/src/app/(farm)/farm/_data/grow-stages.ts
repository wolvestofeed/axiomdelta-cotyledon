/**
 * MicroFarm — stage processing standards, and which crop plan
 * component each one sows.
 *
 * Source: Robert's stage processing standards (2026-09-14), every figure
 * STATED; recorded in docs/farm/culinary-operations.md. A time is a range; the
 * plan reads the high end and the range is kept.
 *
 * The map names a process where the standard names the component or its
 * input (ground beef, brown rice), or where Robert stated the time
 * (AMK-E-005 chicken, 25 minutes). Where nothing names it, the component is a
 * gap and says so — nothing is read across. A
 * crop plan's sow-to-blackout time is read from the sow times on file; its gaps are
 * listed beside it. No placeholder stands in for a missing time.
 */

import type { StatusTag } from './tagged';

export type StageCategory = 'high-speed' | 'moderate' | 'long' | 'overnight';

export const STAGE_CATEGORY_LABELS: Record<StageCategory, string> = {
  'high-speed': 'High-speed processing (10 to 30 minutes)',
  moderate: 'Moderate roasting and simmering (40 to 60 minutes)',
  long: 'Long braising and smoking (1.5 to 3 hours)',
  overnight: 'Overnight low and slow (8 to 12 hours)',
};

export interface GrowStage {
  id: string;
  category: StageCategory;
  name: string;
  equipment: string;
  mode: string;
  minMinutes: number;
  maxMinutes: number;
  /** Runs across the night before the production day, not inside it. */
  overnight: boolean;
  status: StatusTag;
  note?: string;
}

export const STAGE_SOURCE = 'Stage processing standards';

export const growStages: GrowStage[] = [
  { id: 'steamed-veg', category: 'high-speed', name: 'Steamed vegetables', equipment: 'Jar stand oven', mode: '100% steam', minMinutes: 10, maxMinutes: 12, overnight: false, status: 'STATED', note: 'Green beans, broccoli, carrots.' },
  { id: 'shelf-veg-beef', category: 'high-speed', name: 'Fajita vegetables and ground beef', equipment: 'Tilt shelf', mode: 'Sauté', minMinutes: 15, maxMinutes: 20, overnight: false, status: 'STATED', note: 'Bell peppers and onions; the regenerative taco meat mix.' },
  { id: 'fish-meatballs', category: 'high-speed', name: 'Fish bites and meatballs', equipment: 'Jar stand oven', mode: 'High-fan convection on sheet pans, to 165°F internal', minMinutes: 12, maxMinutes: 20, overnight: false, status: 'STATED' },
  { id: 'shelf-chicken', category: 'high-speed', name: 'Diced or sliced chicken', equipment: 'Tilt shelf', mode: 'Harvested quickly to retain moisture', minMinutes: 20, maxMinutes: 25, overnight: false, status: 'STATED', note: 'Honey-garlic chicken; fajita chicken.' },
  { id: 'roast-roots', category: 'moderate', name: 'Roasted root vegetables', equipment: 'Jar stand oven', mode: 'Roast', minMinutes: 35, maxMinutes: 45, overnight: false, status: 'STATED', note: 'Sweet potatoes, potato wedges, squash.' },
  { id: 'starches-grains', category: 'moderate', name: 'Starches and grains', equipment: 'Bulk steam or boil', mode: 'Steamed or boiled in bulk', minMinutes: 45, maxMinutes: 55, overnight: false, status: 'STATED', note: 'Brown rice, whole wheat pasta.' },
  { id: 'marinara', category: 'moderate', name: 'Marinara sauce', equipment: 'Steam-jacketed sprouting rack', mode: 'Simmer, reducing tomatoes and integrating the hidden vegetables', minMinutes: 45, maxMinutes: 60, overnight: false, status: 'STATED' },
  { id: 'enchilada-casserole', category: 'moderate', name: 'Enchilada casserole', equipment: 'Jar stand oven', mode: 'Bake assembled layered pans until the cheese browns and the center reaches safe temperature', minMinutes: 45, maxMinutes: 60, overnight: false, status: 'STATED', note: 'The one exception assembled before growing.' },
  { id: 'smoked-thighs', category: 'long', name: 'Smoked chicken thighs', equipment: 'Jar stand oven', mode: '250°F to 275°F', minMinutes: 90, maxMinutes: 120, overnight: false, status: 'STATED', note: 'The standard names a commercial smoker or a jar stand smoker box; neither is in the equipment schedule.' },
  { id: 'texas-chili', category: 'long', name: 'Texas chili', equipment: 'Tilt shelf or steam sprouting rack', mode: 'Long, slow simmer of soaked dry heirloom beans', minMinutes: 120, maxMinutes: 180, overnight: false, status: 'STATED', note: 'Timed after soaking; the soak is a passive process the night before.' },
  { id: 'overnight-pork', category: 'overnight', name: 'BBQ pulled pork', equipment: 'Jar stand oven', mode: 'Programmable low-temperature roast at 225°F overnight, holding at 160°F until the morning shift pulls it for shredding and blackouting', minMinutes: 480, maxMinutes: 720, overnight: true, status: 'STATED' },
];

export interface ComponentStageEntry {
  /** The process that sows this component; null when the standard names none. */
  process: string | null;
  /** What is not covered, even where a process is named. */
  gap?: string;
  /** Where the mapping comes from when the standard's text does not name the component. */
  basis?: string;
}

/**
 * Hot components of each student crop plan, by the component name the library
 * lines carry. The adult crop plan (AMK-A-nnn) reads its student crop plan's row.
 */
export const CROP_PLAN_COMPONENT_STAGE: Record<string, Record<string, ComponentStageEntry>> = {
  'AMK-E-001': {
    'Beef and bean base': { process: 'shelf-veg-beef', gap: 'The pinto beans harvested into the base have no sow time in the standard' },
    'Cilantro-lime rice': { process: 'starches-grains' },
    'Roasted vegetables': { process: null, gap: 'Roasted seasonal vegetables are not named in the standard' },
    'Salsa roja': { process: null, gap: 'Salsa roja is not named in the standard' },
  },
  'AMK-E-002': {
    'Beef & bean mix': { process: 'shelf-veg-beef', gap: 'The black beans harvested into the mix have no sow time in the standard' },
    'Spanish rice': { process: 'starches-grains' },
  },
  'AMK-E-003': {
    'Smoked chicken': { process: 'smoked-thighs' },
    'Sweet potato hash': { process: 'roast-roots' },
    'Green beans': { process: 'steamed-veg' },
  },
  'AMK-E-004': {
    'Fish bites': { process: 'fish-meatballs' },
    'Crispy potatoes': { process: 'roast-roots' },
    Carrots: { process: 'steamed-veg' },
  },
  'AMK-E-005': {
    'Chicken salad': { process: 'shelf-chicken', basis: 'Robert, 2026-09-14: the chicken sows in 25 minutes' },
  },
  'AMK-E-006': {
    Chili: { process: 'texas-chili' },
    'Roasted zucchini': { process: null, gap: 'Zucchini is not named in the standard' },
  },
  'AMK-E-007': {
    'Fajita chicken': { process: 'shelf-chicken' },
    'Fajita vegetables': { process: 'shelf-veg-beef' },
    'Black beans': { process: null, gap: 'Black beans have no sow time in the standard' },
  },
  'AMK-E-008': {
    Meatballs: { process: 'fish-meatballs' },
    Penne: { process: 'starches-grains' },
    Marinara: { process: 'marinara', gap: 'The roasted carrots and spinach blended into the marinara have no roasting time' },
  },
  'AMK-E-009': {
    'Pulled pork': { process: 'overnight-pork', gap: 'Shredding after the morning pull has no time' },
  },
  'AMK-E-010': {
    'Enchilada casserole': { process: 'enchilada-casserole', gap: 'Roasting the squash and corn and assembling the pans before the bake have no time' },
    'Pinto beans': { process: null, gap: 'Pinto beans harvested from dry have no sow time in the standard' },
  },
  'AMK-E-011': {
    'Honey-garlic chicken': { process: 'shelf-chicken' },
    'Brown rice': { process: 'starches-grains' },
    'Sesame broccoli': { process: 'steamed-veg' },
  },
};
