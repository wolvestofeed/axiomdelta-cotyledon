import { describe, it, expect } from 'vitest';
import { menuCropPlans, adultCropPlans, seedLibrary, MENU_CODES, ADULT_CODES, adultVariant, studentProteinOz, ADULT_UPGRADE_PLACEHOLDER, ADULT_PROTEIN_TARGET_OZ, UNIT_PROTEIN } from '@/data/crop-plans-seed';
import { seedSubscribers, planSeedSubscribers, CURRENT_PROSPECT_UNITS_PER_DAY } from '@/data/subscribers';
import { dbSeedSubscribers } from '@/server/seed-writes';
import { seedSubscriptionCycles, seedFlatPlans } from '@/data/subscription-cycles';
import { pickupPoints } from '@/data/seed-invented';
import { capacityInputs, phaseProfiles } from '@/data/plan-data';
import { deriveCapacity, costCropPlan, canopyMassPerUnit, packedUnitOz } from '@/engine';
import { creditCropPlan, creditableLines } from '@/engine/nutrition';
import { resolveSubscriberPickupPoints, channelDemand } from '@/engine/demand';
import { orderBook, cycleCropPlanOn, datesBetween } from '@/engine/orders';
import { requirementsFor, planProductionDay, planHorizon, unitFactorFor } from '@/engine/production-plan';
import { resolveScenarioInputs } from '@/engine/scenario';

const MON = '2026-09-14';
const R = resolveScenarioInputs({}, seedLibrary);
const PF = Object.fromEntries(phaseProfiles.map((p) => [p.phase, p.unitFactor.value])) as Record<number, number>;

describe('the ten-unit menu as library rows', () => {
  it('is ten student crop plans on Subscriptions and ten adult variants on the other two channels, the code crop plan last', () => {
    expect(menuCropPlans.map((r) => r.code)).toEqual([...MENU_CODES]);
    expect(adultCropPlans.map((r) => r.code)).toEqual([...ADULT_CODES]);
    expect(seedLibrary[0].code).toBe('AMK-E-002');
    expect(seedLibrary[seedLibrary.length - 1].code).toBe('AMK-E-001');
    expect(seedLibrary).toHaveLength(21);
    expect(menuCropPlans.every((r) => r.status === 'in_service' && r.channels.join() === '1')).toBe(true);
    expect(adultCropPlans.every((r) => r.status === 'in_service' && r.channels.join() === '2,3')).toBe(true);
  });

  it('an adult variant plates the protein target: protein lines scaled to it, vegetables × 1.6, everything else the student line', () => {
    const student = menuCropPlans[1]; // smoked chicken & sweet potato hash, a meat unit
    const adult = adultVariant(student);
    expect(adult.code).toBe('AMK-A-003');
    expect(adult.spec.proteinTargetOz?.value).toBe(ADULT_PROTEIN_TARGET_OZ.meat.default);
    expect(adult.spec.proteinTargetOz?.status).toBe('PLACEHOLDER');
    expect(adult.spec.upgradeMultiplier?.status).toBe('DERIVED');
    expect(adult.spec.vegetableMultiplier?.value).toBe(ADULT_UPGRADE_PLACEHOLDER);
    const m = 6 / studentProteinOz(student);
    expect(adult.spec.upgradeMultiplier?.value).toBeCloseTo(m, 9);
    const chicken = adult.inputs.find((l) => l.name.startsWith('Chicken thighs'))!;
    const beans = adult.inputs.find((l) => l.name === 'Green beans, fresh')!;
    const paprika = adult.inputs.find((l) => l.name === 'Smoked paprika')!;
    expect(chicken.harvestedYieldPerSowing).toBeCloseTo(18.7 * m, 6);
    expect((chicken.harvestedYieldPerSowing / adult.sowingUnits) * 16).toBeCloseTo(6, 6);
    expect(beans.seedQtyPerSowing).toBeCloseTo(26 * 1.6, 9);
    expect(paprika.seedQtyPerSowing).toBe(0.25);
    expect(deriveCapacity(adult, capacityInputs).sowingSize).toBe(150);
    // A stated serving from crop plan development.
    const eight = adultVariant(student, { proteinTargetOz: 8 });
    expect(eight.spec.proteinTargetOz?.status).toBe('STATED');
    expect(deriveCapacity(eight, capacityInputs).sowingSize).toBeLessThanOrEqual(150);
    expect(deriveCapacity(eight, capacityInputs).unitsPerCycleRaw).toBeLessThan(deriveCapacity(adult, capacityInputs).unitsPerCycleRaw);
    // Grains are never upgraded; the beef bowl's protein is the beef-and-bean mix.
    const bowl = adultVariant(menuCropPlans[0]);
    expect(bowl.inputs.find((l) => l.name === 'Brown rice, dry')!.seedQtyPerSowing).toBe(10);
    expect(bowl.inputs.find((l) => l.name === 'Black beans, harvested')!.seedQtyPerSowing).toBeGreaterThan(6.5);
    // A plant-based unit defaults to the plant target; a serving already over the target is not reduced.
    const chili = adultVariant(menuCropPlans[4]);
    expect(chili.spec.proteinTargetOz?.value).toBe(ADULT_PROTEIN_TARGET_OZ.plant.default);
    const casserole = adultVariant(menuCropPlans[8]);
    expect(studentProteinOz(menuCropPlans[8])).toBeGreaterThan(4);
    expect(casserole.spec.upgradeMultiplier?.value).toBe(1);
    // Every unit names its protein and every adult pack is at least the student pack.
    for (const r of menuCropPlans) {
      expect(UNIT_PROTEIN[r.code]).toBeDefined();
      expect(packedUnitOz(adultVariant(r), 1).totalOz).toBeGreaterThanOrEqual(packedUnitOz(r, 1).totalOz);
    }
  });

  it('an order naming a crop plan on its own channel counts at the crop plan unit; a foreign crop plan takes the channel factor', () => {
    const pf = { 1: 1, 2: 1.5, 3: 1.5 };
    expect(unitFactorFor(adultCropPlans[0], 2, pf)).toBe(1);
    expect(unitFactorFor(menuCropPlans[0], 2, pf)).toBe(1.5);
    expect(unitFactorFor(undefined, 3, pf)).toBe(1.5);
  });

  it('every line carries its yield as the sheet states it and its harvested yield is SEED × yield', () => {
    for (const r of menuCropPlans) {
      for (const l of r.inputs) {
        expect(l.harvestedYieldPerSowing).toBeCloseTo(l.seedQtyPerSowing * l.yieldToHarvest, 9);
        expect(['STATED', 'PLACEHOLDER']).toContain(l.yieldStatus);
      }
      const names = r.inputs.map((l) => l.name);
      expect(new Set(names).size).toBe(names.length);
    }
  });

  it('derives a sowing size from one full Phase 1 line — the tightest grow unit on the crop plan’s mass; the sheet never types one', () => {
    // One 200 lb blackout rack on the blackout unit; the chicken salad is bound by the 40 gal shelf on its chicken.
    const expected: Record<string, number> = {
      'AMK-E-002': 475, 'AMK-E-003': 275, 'AMK-E-004': 275, 'AMK-E-005': 825, 'AMK-E-006': 275,
      'AMK-E-007': 325, 'AMK-E-008': 275, 'AMK-E-009': 950, 'AMK-E-010': 300, 'AMK-E-011': 275,
    };
    // Cycles run from each crop plan's first load (its sow times, growing from 07:00) to the 19:00 close,
    // one 125-minute occupancy (load, blackout, unload) apart.
    const cycles: Record<string, number> = {
      'AMK-E-002': 5, 'AMK-E-003': 4, 'AMK-E-004': 5, 'AMK-E-005': 5, 'AMK-E-006': 4,
      'AMK-E-007': 5, 'AMK-E-008': 5, 'AMK-E-009': 5, 'AMK-E-010': 5, 'AMK-E-011': 5,
    };
    for (const r of menuCropPlans) {
      const cap = deriveCapacity(r, capacityInputs, 1);
      expect(cap.sowingSize).toBe(expected[r.code]);
      const blackoutRackBound = Math.floor(200 / canopyMassPerUnit(r) / 25) * 25;
      expect(cap.sowingSize).toBeLessThanOrEqual(blackoutRackBound);
      expect(cap.sowingSize).toBe(Math.floor(Math.min(cap.unitsPerCycleRaw, cap.binding!.units) / 25) * 25);
      if (r.code === 'AMK-E-005') expect(cap.binding!.growUnit.item).toContain('shelf');
      else expect(cap.binding!.growUnit.item).toContain('Blackout rack');
      expect(cap.cyclesPerDay, r.code).toBe(cycles[r.code]);
    }
  });

  it('the sheet yields reproduce: beef bowl hot mass 41.5 lb per 100, fajitas 59.7, honey-garlic 70.95 with the sesame', () => {
    const hot = (code: string) => canopyMassPerUnit(menuCropPlans.find((r) => r.code === code)!) * 100;
    expect(hot('AMK-E-002')).toBeCloseTo(41.5, 6);
    expect(hot('AMK-E-007')).toBeCloseTo(59.7, 6);
    expect(hot('AMK-E-011')).toBeCloseTo(70.95, 6);
  });

  it('costs and credits like the code crop plan', () => {
    for (const r of menuCropPlans) {
      expect(costCropPlan(r).totalInputCostPerUnit).toBeGreaterThan(0);
      const credit = creditCropPlan(creditableLines(r), '9-12');
      expect(Number.isFinite(credit.grainsOzEq)).toBe(true);
    }
    // Every price on the menu is a placeholder except the two cited lines.
    const cited = menuCropPlans.flatMap((r) => r.inputs).filter((l) => l.status === 'SOURCED').map((l) => l.name);
    expect(new Set(cited)).toEqual(new Set(['Ground beef, regenerative', 'Pinto beans, dry']));
  });
});

describe('the Plan seed: one contracted subscriber, prospects carrying no volume', () => {
  it('the engine default reproduces the operating model constants and neutral test names', () => {
    const c = seedSubscribers();
    expect(c.map((x) => x.name)).toEqual(['Test Subscriber #1', 'Test Subscriber #2', 'Test Subscriber #3']);
    expect(c.every((x) => x.status === 'prospect')).toBe(true);
    expect(c[0].pickupPoints.map((s) => s.expectedUnitsPerDay)).toEqual([492, 277, 231]);
    expect(pickupPoints.map((s) => s.name)).toEqual(['Test Pickup point 1', 'Test Pickup point 2', 'Test Pickup point 3', 'Test Pickup point 4']);
    expect(c[2].pickupPoints[0].name).toBe('Test Pickup point 5');
  });

  it('the database seeds the contracted subscriber at its stated 125 units a day and every prospect at zero', () => {
    const plan = planSeedSubscribers();
    expect(CURRENT_PROSPECT_UNITS_PER_DAY).toBe(125);
    const contracted = plan.filter((c) => c.status === 'contracted');
    expect(contracted).toHaveLength(1);
    expect(contracted[0].channel).toBe(1);
    expect(contracted[0].pickupPoints.flatMap((x) => x.services).map((sv) => sv.picks.at(-1)?.units)).toEqual([125]);
    // The prospect's term dates are not on file: the pickup point carries no calendar rather than an invented one.
    expect(contracted[0].pickupPoints.every((x) => x.calendar.length === 0)).toBe(true);
    expect(contracted[0].notes).toContain('125');
    // The name was never given, and the row says so rather than carrying one.
    expect(contracted[0].name).toContain('not on file');
    expect(contracted[0].pricePerUnitCents).toBeNull();
    expect(contracted[0].paymentTerms).toBeNull();
    for (const c of plan.filter((x) => x.status === 'prospect')) {
      expect(c.pickupPoints.flatMap((x) => x.services).every((sv) => sv.picks.every((pk) => pk.units === 0))).toBe(true);
    }
    expect(plan.every((c) => c.source === 'seed')).toBe(true);
    expect(dbSeedSubscribers()).toEqual(plan);
  });

  it('demand splits contracted from planned, and the Plan seed is contracted only', () => {
    const d = channelDemand(planSeedSubscribers());
    expect(d.byChannel[1].unitsPerDay).toBe(125);
    expect(d.byChannel[1].contractedUnitsPerDay).toBe(125);
    expect(d.byChannel[1].contractedSubscribers).toBe(1);
    // No term on file: every Monday-to-Friday of the forecast year from 2027-01-01, the pick carried forward.
    const weekdays2027 = datesBetween('2027-01-01', '2027-12-31').filter((x) => { const w = new Date(`${x}T00:00:00Z`).getUTCDay(); return w >= 1 && w <= 5; }).length;
    expect(d.totalAnnualUnits).toBe(125 * weekdays2027);
    expect(d.contractedAnnualUnits).toBe(d.totalAnnualUnits);
    // The engine default is all prospects: every unit in it is planned volume.
    const e = channelDemand(seedSubscribers());
    expect(e.contractedAnnualUnits).toBe(0);
    expect(e.byChannel[1].contractedUnitsPerDay).toBe(0);
  });

  it('every production day of a two-week horizon fits the blackout rack', () => {
    const subscribers = planSeedSubscribers();
    const saved = seedSubscriptionCycles(seedLibrary, MON);
    const cycles = [...saved, ...seedFlatPlans(subscribers, saved)];
    // The stated volume takes effect 2026-09-15, so the fortnight runs to the Monday that returns to day 1.
    const to = '2026-09-28';
    const book = orderBook({ pickupPoints: resolveSubscriberPickupPoints(subscribers), subscribers, cycles, orders: [], from: MON, to, channelPriceCents: { 1: 1000, 2: 1500, 3: 1600 } });
    expect(new Set(book.map((o) => o.cropPlanCode)).size).toBe(10); // the student menu only: the adult channels have no planned volume
    for (const d of datesBetween(MON, to)) {
      const reqs = requirementsFor(book.filter((o) => o.orderDate === d), R.cropPlans, PF);
      const plan = planProductionDay({ productionDate: d, requirements: reqs, onHand: {}, cropPlans: R.cropPlans, capacityInputs: R.capacityInputs, assumptions: R.assumptions });
      expect(plan.fits).toBe(true);
      if (reqs.length) {
        expect(reqs).toHaveLength(1); // the student menu only
        expect(plan.runs.every((r) => r.sowingsNeeded <= 1)).toBe(true);
        expect(plan.totalRequired).toBeLessThanOrEqual(CURRENT_PROSPECT_UNITS_PER_DAY);
      }
    }
    const h = planHorizon({ from: MON, to, book, cropPlans: R.cropPlans, capacityInputs: R.capacityInputs, assumptions: R.assumptions, unitFactorByChannel: PF, openingLots: [], shelfLifeDays: 30 });
    expect(h.totals.daysThatDoNotFit).toBe(0);
    expect(h.totals.filledUnits).toBeCloseTo(h.totals.orderedUnits, 6);
  });
});
