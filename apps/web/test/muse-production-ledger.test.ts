import { describe, it, expect } from 'vitest';
import { journalIsBalanced } from '@ct/ledger';
import { recipe, phases } from '../src/app/(muse)/muse/_data/plan-data';
import {
  MUSE_COA,
  duplicateAccountCodes,
  ACC_WIP_COOK,
  ACC_WIP_CHILL,
  ACC_WIP_PACK,
  ACC_FINISHED_GOODS,
  ACC_ABNORMAL_SPOILAGE,
  ACC_OH_CONTROL,
  ACC_OH_APPLIED,
  ACC_MATERIAL_USAGE_VAR,
} from '../src/app/(muse)/muse/_data/coa-muse';
import {
  componentCosting,
  normalCapacity,
  absorbOverhead,
  deriveCapacity,
  buildPurchaseOrder,
} from '../src/app/(muse)/muse/_engine';
import {
  standardBatch,
  massBalance,
  classifyScrap,
  isAbnormalScrap,
  MASS_BALANCE_TOLERANCE_LB,
  type BatchExecution,
} from '../src/app/(muse)/muse/_engine/batch';
import { assumptions } from '../src/app/(muse)/muse/_data/plan-data';
import { productionBatchLedger } from '../src/app/(muse)/muse/_engine/production-ledger';
import { manufacturingOverheadBudget } from '../src/app/(muse)/muse/_engine/fixed-costs';
import { traceabilityLotCode, traceabilityGaps } from '../src/app/(muse)/muse/_engine/traceability';

const DATE = '2026-09-14';
const cap = deriveCapacity(recipe);
const portions = cap.batchSize;
const components = componentCosting(recipe);
const nc = normalCapacity(phases);
// The absorption base is MANUFACTURING overhead only — lease, utilities and
// depreciation of the fit-out — never admin or debt service.
const annualFixed = manufacturingOverheadBudget().annual;

function batchAtStandard(): BatchExecution {
  return standardBatch('B-260914-01', DATE, portions, components, 'AMK-E-001@2026-09-13', (c) =>
    traceabilityLotCode('AMK', 'AMKE001', DATE, c, 1),
  );
}

function ledgerFor(batch: BatchExecution, actualMeals = nc.mealsPerYear) {
  return productionBatchLedger(batch, {
    overhead: absorbOverhead(annualFixed, nc, actualMeals),
    purchaseOrderCost: buildPurchaseOrder(portions, recipe).total,
    pricePerMeal: phases[0].pricePerMeal,
  });
}

describe('Muse chart of accounts', () => {
  it('adds manufacturing accounts without colliding with the shared chart', () => {
    expect(duplicateAccountCodes(MUSE_COA)).toEqual([]);
  });

  it('carries three work-in-process stages', () => {
    for (const code of [ACC_WIP_COOK, ACC_WIP_CHILL, ACC_WIP_PACK]) {
      expect(MUSE_COA.find((a) => a.code === code)?.type).toBe('asset');
    }
  });
});

describe('the production batch journal', () => {
  const led = ledgerFor(batchAtStandard());

  it('balances', () => {
    expect(led.balanced).toBe(true);
    expect(journalIsBalanced(led.entries)).toBe(true);
  });

  it('moves cost through cook, chill and pack in that order', () => {
    const ids = led.entries.map((e) => e.id);
    expect(ids.indexOf('B-260914-01-ISSUE-HOT')).toBeLessThan(ids.indexOf('B-260914-01-XFER-CHILL'));
    expect(ids.indexOf('B-260914-01-XFER-CHILL')).toBeLessThan(ids.indexOf('B-260914-01-XFER-PACK'));
    expect(ids.indexOf('B-260914-01-XFER-PACK')).toBeLessThan(ids.indexOf('B-260914-01-FG'));
  });

  it('leaves every work-in-process account flat once the batch is packed', () => {
    for (const code of [ACC_WIP_COOK, ACC_WIP_CHILL, ACC_WIP_PACK]) {
      const net = led.entries
        .flatMap((e) => e.lines)
        .filter((l) => l.accountCode === code)
        .reduce((s, l) => s + l.debitCents - l.creditCents, 0);
      expect(net, `WIP ${code} did not clear`).toBe(0);
    }
  });

  it('cold components never pass through cook or chill', () => {
    const coldIssue = led.entries.find((e) => e.id.endsWith('ISSUE-COLD'))!;
    expect(coldIssue.lines.some((l) => l.accountCode === ACC_WIP_PACK && l.debitCents > 0)).toBe(true);
    expect(coldIssue.lines.some((l) => l.accountCode === ACC_WIP_COOK)).toBe(false);
    expect(coldIssue.lines.some((l) => l.accountCode === ACC_WIP_CHILL)).toBe(false);
  });

  it('capitalises labor and overhead into inventory, not into the period', () => {
    expect(led.amounts.overheadAbsorbed).toBeGreaterThan(0);
    expect(led.amounts.finishedGoodsCost).toBeGreaterThan(led.amounts.materialIssuedToWip);
  });

  it('expenses delivery instead of capitalising it', () => {
    const deliv = led.entries.find((e) => e.id.endsWith('DELIV'))!;
    expect(deliv.lines.some((l) => l.accountCode === '7900' && l.debitCents > 0)).toBe(true);
    expect(deliv.lines.some((l) => l.accountCode === ACC_FINISHED_GOODS)).toBe(false);
  });

  it('runs every variance at zero when the batch runs to standard', () => {
    const v = led.variances;
    expect(v.purchasePrice).toBeCloseTo(0, 6);
    expect(v.materialUsage).toBeCloseTo(0, 6);
    expect(v.laborRate).toBeCloseTo(0, 6);
    expect(v.laborEfficiency).toBeCloseTo(0, 6);
  });

  it('keeps case-rounded over-purchase in inventory rather than in a variance', () => {
    const po = buildPurchaseOrder(portions, recipe).total;
    expect(po).toBeGreaterThan(led.amounts.standardMaterialCost);
    expect(led.variances.purchasePrice).toBeCloseTo(0, 6);
  });
});

describe('variances when the batch does not run to standard', () => {
  it('splits a labor miss into rate and efficiency', () => {
    const b = batchAtStandard();
    b.actualLaborHours = 30;
    b.actualLaborRate = 31;
    const led = ledgerFor(b);
    expect(led.balanced).toBe(true);
    expect(led.variances.laborRate).not.toBeCloseTo(0, 3);
    expect(led.variances.laborEfficiency).not.toBeCloseTo(0, 3);
  });

  it('prices a purchase price variance off the invoice, not the order', () => {
    const b = batchAtStandard();
    const po = buildPurchaseOrder(portions, recipe).total;
    const led = productionBatchLedger(b, {
      overhead: absorbOverhead(annualFixed, nc, nc.mealsPerYear),
      purchaseOrderCost: po,
      actualInvoiceCost: po * 1.04,
      pricePerMeal: phases[0].pricePerMeal,
    });
    expect(led.balanced).toBe(true);
    expect(led.variances.purchasePrice).toBeCloseTo(po * 0.04, 2);
  });

  it('charges abnormal spoilage to the period and normal scrap to inventory', () => {
    const b = batchAtStandard();
    b.components[0].scrap = [
      { reason: 'CHILL_FAILURE', lb: 40, stage: 'CHILL', note: 'CCP-2 cooling limit not met' },
      { reason: 'COOK_LOSS', lb: 5, stage: 'COOK', note: 'pan loss inside standard yield' },
    ];
    b.components[0].packedLb -= 45;
    const led = ledgerFor(b);
    expect(led.balanced).toBe(true);
    expect(led.amounts.abnormalSpoilage).toBeGreaterThan(0);
    const spoil = led.entries.find((e) => e.id.endsWith('SPOIL'))!;
    expect(spoil.lines.some((l) => l.accountCode === ACC_ABNORMAL_SPOILAGE && l.debitCents > 0)).toBe(true);
  });

  it('posts the period’s incurred overhead against applied, and leaves the gap in the period', () => {
    const b = batchAtStandard();
    const incurred = annualFixed / 250; // one production day's share of the budget
    const led = productionBatchLedger(b, {
      overhead: absorbOverhead(annualFixed, nc, nc.mealsPerYear),
      overheadIncurred: incurred,
      purchaseOrderCost: buildPurchaseOrder(portions, recipe).total,
      pricePerMeal: phases[0].pricePerMeal,
    });
    expect(led.balanced).toBe(true);
    const inc = led.entries.find((e) => e.id.endsWith('OH-INCURRED'))!;
    expect(inc.lines.some((l) => l.accountCode === ACC_OH_CONTROL && l.debitCents > 0)).toBe(true);
    // Under-absorption for the day = incurred − applied, and it never reaches inventory.
    expect(led.variances.overheadVolume).toBeCloseTo(incurred - led.amounts.overheadAbsorbed, 6);
    const applied = led.entries
      .flatMap((e) => e.lines)
      .filter((l) => l.accountCode === ACC_OH_APPLIED)
      .reduce((s, l) => s + l.creditCents - l.debitCents, 0);
    expect(applied).toBe(Math.round(led.amounts.overheadAbsorbed * 100));
    expect(led.notes.join(' ')).toMatch(/absorbed/);
  });

  it('never posts the ANNUAL volume variance on a single batch', () => {
    // The annual volume variance is a period-end fact, not a batch entry. With
    // no period overhead supplied the batch carries none. At Phase 1 operations
    // the plan is schools only, so Phase 1 volume runs over normal capacity by
    // the downtime allowance: a small favourable variance at year end.
    const phase1 = phases[0].mealsPerDay * phases[0].operatingDays;
    const led = ledgerFor(batchAtStandard(), phase1);
    expect(led.balanced).toBe(true);
    expect(led.entries.some((e) => e.id.endsWith('OHVOL'))).toBe(false);
    expect(led.variances.overheadVolume).toBe(0);
    expect(led.variances.disposition).toBe('TO_COGS');
    expect(absorbOverhead(annualFixed, nc, phase1).volumeVariance).toBeLessThan(0);
  });

  it('charges fixed labor once per chiller batch the record covers', () => {
    const one = ledgerFor(batchAtStandard());
    const b = batchAtStandard();
    const two = productionBatchLedger(b, {
      batches: 2,
      overhead: absorbOverhead(annualFixed, nc, nc.mealsPerYear),
      purchaseOrderCost: buildPurchaseOrder(portions, recipe).total,
      pricePerMeal: phases[0].pricePerMeal,
    });
    expect(two.amounts.directLaborStandard).toBeGreaterThan(one.amounts.directLaborStandard);
    expect(two.balanced).toBe(true);
  });

  it('relieves a cold-component usage variance from the pack stage, not the cook stage', () => {
    const b = batchAtStandard();
    const cheese = b.components.find((c) => c.component === 'Cheddar')!;
    cheese.apIssuedLb += 2;
    cheese.packedLb += 2;
    const led = ledgerFor(b);
    expect(led.balanced).toBe(true);
    const cold = led.entries.find((e) => e.id.endsWith('ISSUE-COLD'))!;
    expect(cold.lines.some((l) => l.accountCode === ACC_MATERIAL_USAGE_VAR && l.debitCents > 0)).toBe(true);
    const hot = led.entries.find((e) => e.id.endsWith('ISSUE-HOT'))!;
    expect(hot.lines.some((l) => l.accountCode === ACC_MATERIAL_USAGE_VAR)).toBe(false);
  });

  it('flags a material net variance for proration rather than dumping it in COGS', () => {
    const b = batchAtStandard();
    const po = buildPurchaseOrder(portions, recipe).total;
    const led = productionBatchLedger(b, {
      overhead: absorbOverhead(annualFixed, nc, nc.mealsPerYear),
      purchaseOrderCost: po,
      actualInvoiceCost: po * 1.5,
      pricePerMeal: phases[0].pricePerMeal,
    });
    expect(led.variances.disposition).toBe('PRORATE');
  });
});

describe('the mass balance invariant', () => {
  it('balances a batch that ran to standard', () => {
    const mb = massBalance(batchAtStandard());
    expect(mb.balanced).toBe(true);
    expect(mb.failures).toEqual([]);
  });

  it('refuses a batch with unaccounted weight', () => {
    const b = batchAtStandard();
    b.components[1].packedLb -= 25; // 25 lb vanishes with no scrap record
    const mb = massBalance(b);
    expect(mb.balanced).toBe(false);
    expect(mb.failures[0]).toContain('unaccounted for');
  });

  it('accepts weight that leaves as recorded scrap', () => {
    const b = batchAtStandard();
    b.components[1].packedLb -= 25;
    b.components[1].scrap = [
      { reason: 'DROPPED_OR_DAMAGED', lb: 25, stage: 'PACK', note: 'pan dropped at assembly' },
    ];
    expect(massBalance(b).balanced).toBe(true);
  });

  it('separates normal from abnormal scrap', () => {
    const b = batchAtStandard();
    b.components[0].scrap = [
      { reason: 'TRIM', lb: 3, stage: 'COOK', note: '' },
      { reason: 'CONTAMINATION', lb: 7, stage: 'PACK', note: '' },
    ];
    b.components[0].packedLb -= 10;
    const mb = massBalance(b);
    const first = mb.components[0];
    // TRIM is normal only up to the component's allowance; the rest is abnormal.
    const allowance = b.components[0].shrinkAllowanceLb!;
    expect(allowance).toBeLessThan(3);
    expect(first.normalScrapLb).toBeCloseTo(allowance, 6);
    expect(first.abnormalScrapLb).toBeCloseTo(7 + (3 - allowance), 6);
    // The other components still carry the standard allowance as normal scrap.
    const othersAllowance = b.components.slice(1).reduce((s, c) => s + (c.shrinkAllowanceLb ?? 0), 0);
    expect(mb.normalScrapLb).toBeCloseTo(allowance + othersAllowance, 6);
    expect(mb.abnormalScrapLb).toBeCloseTo(7 + (3 - allowance), 6);
  });

  it('classifies every scrap reason', () => {
    expect(isAbnormalScrap('CHILL_FAILURE')).toBe(true);
    expect(isAbnormalScrap('TRIM')).toBe(false);
    expect(MASS_BALANCE_TOLERANCE_LB).toBeGreaterThan(0);
  });

  it('records the cook stage as a mass GAIN, not a loss', () => {
    const mb = massBalance(batchAtStandard());
    const rice = mb.components.find((c) => c.component === 'Cilantro-lime rice')!;
    expect(rice.cookDeltaLb).toBeGreaterThan(0);
  });
});

describe('the shrink allowance is on the record (Roadmap I3)', () => {
  const shrink = assumptions.yield.shrinkAllowance.value;

  it('the standard issue carries the allowance and shows it as normal scrap before the kettle', () => {
    const b = batchAtStandard();
    for (const c of b.components) {
      const card = components.find((k) => k.name === c.component)!;
      expect(c.apIssuedLb).toBeCloseTo((card.apOz * portions * (1 + shrink)) / 16, 6);
      expect(c.shrinkAllowanceLb).toBeCloseTo((card.apOz * portions * shrink) / 16, 6);
      expect(c.scrap).toHaveLength(1);
      expect(c.scrap[0]).toMatchObject({ reason: 'TRIM', stage: 'PREP' });
      expect(c.scrap[0].lb).toBeCloseTo(c.shrinkAllowanceLb!, 6);
    }
    const mb = massBalance(b);
    expect(mb.balanced).toBe(true);
    expect(mb.normalScrapLb).toBeCloseTo(b.components.reduce((s, c) => s + c.shrinkAllowanceLb!, 0), 6);
    expect(mb.abnormalScrapLb).toBe(0);
  });

  it('a record issued at standard has no usage variance and no abnormal spoilage', () => {
    const led = ledgerFor(batchAtStandard());
    expect(led.balanced).toBe(true);
    expect(Math.abs(led.variances.materialUsage)).toBeLessThan(0.005);
    expect(led.amounts.abnormalSpoilage).toBe(0);
  });

  it('a normal reason beyond the allowance is abnormal and leaves inventory', () => {
    const b = batchAtStandard();
    const hot = b.components[0];
    hot.scrap.push({ reason: 'TRIM', lb: 10, stage: 'COOK', note: 'over the allowance' });
    hot.packedLb -= 10;
    const mb = massBalance(b);
    expect(mb.balanced).toBe(true);
    const c = mb.components[0];
    expect(c.normalScrapLb).toBeCloseTo(hot.shrinkAllowanceLb!, 6);
    expect(c.abnormalScrapLb).toBeCloseTo(10, 6);
    const led = ledgerFor(b);
    expect(led.balanced).toBe(true);
    expect(led.amounts.abnormalSpoilage).toBeGreaterThan(0);
    const spoil = led.entries.find((e) => e.id.endsWith('SPOIL'))!;
    expect(spoil.lines.some((l) => l.accountCode === ACC_ABNORMAL_SPOILAGE && l.debitCents > 0)).toBe(true);
    expect(spoil.lines.some((l) => l.accountCode === ACC_WIP_COOK && l.creditCents > 0)).toBe(true);
  });

  it('scrap before the kettle leaves the cook delta alone and is relieved at purchase cost from the issue stage', () => {
    const b = batchAtStandard();
    const hot = b.components[0];
    const before = massBalance(b).components[0].cookDeltaLb;
    hot.apIssuedLb += 5;
    hot.scrap.push({ reason: 'DROPPED_OR_DAMAGED', lb: 5, stage: 'PREP', note: 'case dropped at issue' });
    const mb = massBalance(b);
    expect(mb.balanced).toBe(true);
    expect(mb.components[0].cookDeltaLb).toBeCloseTo(before, 6);
    expect(mb.components[0].prepScrapLb).toBeCloseTo(hot.shrinkAllowanceLb! + 5, 6);
    const led = ledgerFor(b);
    const card = components.find((k) => k.name === hot.component)!;
    expect(led.amounts.abnormalSpoilage).toBeCloseTo(5 * (card.apCostPerLb ?? 0), 2);
    expect(led.variances.materialUsage).toBeCloseTo(5 * (card.apCostPerLb ?? 0), 2);
  });

  it('J7: abnormal spoilage after the kettle carries the stage\'s labor and overhead, before it carries none', () => {
    const chill = batchAtStandard();
    chill.components[0]!.scrap.push({ reason: 'CHILL_FAILURE', lb: 10, stage: 'CHILL', note: 'CCP-2 limit not met' });
    chill.components[0]!.packedLb -= 10;
    const led = ledgerFor(chill);
    const card = components.find((k) => k.name === chill.components[0]!.component)!;
    const materialOnly = 10 * (card.cookedCostPerLb ?? 0);
    expect(led.amounts.abnormalSpoilage).toBeGreaterThan(materialOnly);
    const hotChilledLb = components.filter((k) => k.isHot).reduce((s, k) => s + (k.chilledOz * portions) / 16, 0);
    const conversionPerLb = (led.amounts.directLaborStandard + led.amounts.overheadAbsorbed) / hotChilledLb;
    expect(led.amounts.abnormalSpoilage).toBeCloseTo(10 * ((card.cookedCostPerLb ?? 0) + conversionPerLb), 2);
    expect(led.balanced).toBe(true);
    expect(led.notes.some((n) => n.includes('fully absorbed cost'))).toBe(true);

    const prep = batchAtStandard();
    prep.components[0]!.apIssuedLb += 10;
    prep.components[0]!.scrap.push({ reason: 'DROPPED_OR_DAMAGED', lb: 10, stage: 'PREP', note: 'case dropped' });
    const raw = ledgerFor(prep);
    expect(raw.amounts.abnormalSpoilage).toBeCloseTo(10 * (card.apCostPerLb ?? 0), 2); // material only, no conversion yet
  });

  it('a record with no allowance on it classifies by reason alone', () => {
    const k = classifyScrap({ scrap: [{ reason: 'TRIM', lb: 100, stage: 'COOK', note: '' }, { reason: 'CONTAMINATION', lb: 1, stage: 'PACK', note: '' }] });
    expect(k[0]).toMatchObject({ normalLb: 100, abnormalLb: 0 });
    expect(k[1]).toMatchObject({ normalLb: 0, abnormalLb: 1 });
    const capped = classifyScrap({ shrinkAllowanceLb: 4, scrap: [{ reason: 'TRIM', lb: 3, stage: 'PREP', note: '' }, { reason: 'COOK_LOSS', lb: 3, stage: 'COOK', note: '' }] });
    expect(capped[0]).toMatchObject({ normalLb: 3, abnormalLb: 0 });
    expect(capped[1]).toMatchObject({ normalLb: 1, abnormalLb: 2 });
  });
});

describe('traceability rides on the consumption journal', () => {
  const led = ledgerFor(batchAtStandard());

  it('emits one transformation event per component', () => {
    expect(led.traceability).toHaveLength(components.length);
    for (const e of led.traceability) expect(e.cte).toBe('TRANSFORMATION');
  });

  it('names the output lot and its inputs', () => {
    const e = led.traceability[0];
    expect(e.output.traceabilityLotCode).toMatch(/^AMK-/);
    expect(e.inputs.length).toBeGreaterThan(0);
    expect(e.output.quantity).toBeGreaterThan(0);
  });

  it('reports missing input lot codes rather than inventing them', () => {
    // The standard-cost batch has no recorded input lots; every one is a gap.
    expect(led.traceabilityGaps.length).toBeGreaterThan(0);
    expect(led.traceabilityGaps[0].reason).toContain('cannot be traced back one step');
  });

  it('clears the gap once input lots are recorded', () => {
    const b = batchAtStandard();
    for (const c of b.components) {
      for (const l of c.consumed) l.inputLotCode = 'SUP-260901-001';
    }
    expect(traceabilityGaps(ledgerFor(b).traceability)).toEqual([]);
  });

  it('generates a stable, sortable lot code', () => {
    expect(traceabilityLotCode('AMK', 'AMKE001', '2026-09-14', 'Beef and bean base', 1)).toBe(
      'AMK-AMKE001-260914-BEEFAN-01',
    );
  });
});

describe('weights reach the ledger, which is what Production Planning was missing', () => {
  it('reports purchased, cooked, chilled and packed pounds for the batch', () => {
    const w = ledgerFor(batchAtStandard()).weights;
    expect(w.purchasedLb).toBeGreaterThan(100); // a 275-portion batch on the Phase 1 line
    expect(w.cookedLb).toBeGreaterThan(w.purchasedLb); // water uptake
    expect(w.chilledLb).toBeLessThan(w.cookedLb); // cold components are not chilled
    expect(w.packedLb).toBeCloseTo(w.cookedLb, 1);
  });
});
