import { costPlan } from '@/engine/grow-costing';
import { describe, it, expect } from 'vitest';
import { journalIsBalanced } from '@/ledger';
import { phases } from '@/data/plan-data';
import { resolveScenarioInputs } from '@/engine/scenario';
import {
  FARM_COA,
  duplicateAccountCodes,
  ACC_WIP_SOW,
  ACC_WIP_GROW,
  ACC_WIP_PACK,
  ACC_FINISHED_GOODS,
  ACC_ABNORMAL_SPOILAGE,
  ACC_OH_CONTROL,
  ACC_OH_APPLIED,
  ACC_VAR_OH_APPLIED,
  ACC_RAW_MATERIALS,
} from '@/data/coa-farm';
import { normalCapacity, absorbOverhead, deriveCapacity, buildPurchaseOrder, costPlanPerUnit } from '@/engine';
import { massBalance, classifyScrap, isAbnormalScrap, MASS_BALANCE_TOLERANCE_G, type SowingExecution } from '@/engine/sowing';
import { standardSowingRecordPrefill, toSowingExecution, type ReceiptDoc, type SowingRecordDoc } from '@/engine/actuals';
import { lotRegister } from '@/engine/net-requirements';
import { assumptions } from '@/data/plan-data';
import { productionSowingLedger } from '@/engine/production-ledger';
import { manufacturingOverheadBudget } from '@/engine/fixed-costs';
import { traceabilityLotCode, traceabilityGaps } from '@/engine/traceability';
import { GRAMS_PER_LB } from '@/data/tray-formats';
import { lineLabel } from '@/data/grow-plan';

const DATE = '2026-09-14';
// A sowing of the seed grow plans' reference plan: one grow unit's trays.
const R0 = resolveScenarioInputs();
const growPlan = R0.growPlan;
const card = costPlan(growPlan);
const trays = deriveCapacity(growPlan, R0.capacityInputs).sowingSize;
const shrink = assumptions.yield.shrinkAllowance.value;
const nc = normalCapacity(phases);
// The absorption base is MANUFACTURING overhead only — lease, utilities and
// depreciation of the fit-out — never admin or debt service.
const annualFixed = manufacturingOverheadBudget().annual;

function sowingAtStandard(): SowingExecution {
  return toSowingExecution({ ...standardSowingRecordPrefill(DATE, 1, trays, growPlan), id: '', closedAt: null });
}

function recordAtStandard(): SowingRecordDoc {
  return { ...standardSowingRecordPrefill(DATE, 1, trays, growPlan), id: 'S1', closedAt: null };
}

/** A receipt of the plan's first seed on `on`, at `factor` times the plan's price. */
function seedReceipt(id: string, on: string, lotCode: string, lb: number, factor: number): ReceiptDoc {
  const seed = card.lines.find((l) => l.line.kind === 'seed')!;
  return {
    id, poId: null, supplierId: null, supplierName: 'Test seed', receivedOn: on, invoiceNumber: null, invoiceTotalCents: null, receivedBy: null, notes: null,
    lines: [{ input: lineLabel(seed.line), qty: lb, unit: 'lb', lotCode, unitPriceCents: seed.unitCost * factor * 100, condition: 'accepted' }],
  };
}

function ledgerFor(sowing: SowingExecution, actualUnits = nc.unitsPerYear) {
  return productionSowingLedger(sowing, {
    overhead: absorbOverhead(annualFixed, nc, actualUnits),
    purchaseOrderCost: buildPurchaseOrder(trays, growPlan).total,
    pricePerUnit: phases[0].pricePerUnit,
  }, growPlan);
}

const net = (entries: { lines: { accountCode: string; debitCents: number; creditCents: number }[] }[], code: string) =>
  entries.flatMap((e) => e.lines).filter((l) => l.accountCode === code).reduce((s, l) => s + l.debitCents - l.creditCents, 0);

describe('Farm chart of accounts', () => {
  it('adds manufacturing accounts without colliding with the shared chart', () => {
    expect(duplicateAccountCodes(FARM_COA)).toEqual([]);
  });

  it('carries three work-in-process stages: sow, grow, pack', () => {
    expect([ACC_WIP_SOW, ACC_WIP_GROW, ACC_WIP_PACK].map((code) => FARM_COA.find((a) => a.code === code)?.name)).toEqual([
      'Work in Process — Sow',
      'Work in Process — Grow',
      'Work in Process — Pack',
    ]);
  });
});

describe('the production sowing journal', () => {
  const b = sowingAtStandard();
  const led = ledgerFor(b);

  it('balances', () => {
    expect(led.balanced).toBe(true);
    expect(journalIsBalanced(led.entries)).toBe(true);
  });

  it('moves cost through sow, grow and pack in that order', () => {
    const ids = led.entries.map((e) => e.id);
    expect(ids.indexOf('B-260914-01-ISSUE')).toBeLessThan(ids.indexOf('B-260914-01-XFER-GROW'));
    expect(ids.indexOf('B-260914-01-XFER-GROW')).toBeLessThan(ids.indexOf('B-260914-01-XFER-PACK'));
    expect(ids.indexOf('B-260914-01-XFER-PACK')).toBeLessThan(ids.indexOf('B-260914-01-FG'));
  });

  it('leaves every work-in-process account flat once the sowing is packed', () => {
    for (const code of [ACC_WIP_SOW, ACC_WIP_GROW, ACC_WIP_PACK]) expect(net(led.entries, code), `WIP ${code} did not clear`).toBe(0);
  });

  it('issues seed, medium and nutrient from raw materials to the sow stage, on the trays sown', () => {
    const issue = led.entries.find((e) => e.id.endsWith('-ISSUE'))!;
    expect(issue.lines.filter((l) => l.debitCents > 0).map((l) => l.accountCode)).toEqual([ACC_WIP_SOW]);
    expect(issue.lines.some((l) => l.accountCode === ACC_RAW_MATERIALS && l.creditCents > 0)).toBe(true);
    const materials = card.perTray.seed + card.perTray.medium + card.perTray.nutrient;
    // No lot on hand: every issue at the plan's price, and the note says so.
    expect(led.amounts.materialIssuedToWip).toBeCloseTo(materials * trays * (1 + shrink), 6);
    expect(led.notes.join(' ')).toMatch(/No lot on hand for .*costed at the plan's price/);
  });

  it('applies light to the grow stage and tray wear and sanitizer to the sow stage as overhead, never from raw materials', () => {
    const apply = led.entries.find((e) => e.id.endsWith('-APPLY'))!;
    expect(apply.lines.find((l) => l.accountCode === ACC_WIP_GROW)!.debitCents).toBe(Math.round(card.perTray.light * trays * (1 + shrink) * 100));
    expect(apply.lines.find((l) => l.accountCode === ACC_WIP_SOW)!.debitCents).toBe(Math.round(card.perTray.consumables * trays * (1 + shrink) * 100));
    expect(apply.lines.some((l) => l.accountCode === ACC_VAR_OH_APPLIED && l.creditCents > 0)).toBe(true);
    expect(apply.lines.some((l) => l.accountCode === ACC_OH_APPLIED)).toBe(false);
    expect(apply.lines.some((l) => l.accountCode === ACC_RAW_MATERIALS)).toBe(false);
  });

  it('a tray costs what the cost card says: materials, light and consumables over the trays sown', () => {
    const perTray = (led.amounts.materialIssuedToWip + led.amounts.lightApplied + led.amounts.consumablesApplied) / led.amounts.traysSown;
    expect(perTray).toBeCloseTo(costPlanPerUnit(growPlan, shrink).totalInputCostPerUnit, 9);
  });

  it('splits labor over the stages by stream: sowing to sow, daily to grow, harvest to pack', () => {
    const labor = led.entries.find((e) => e.id.endsWith('-LABOR'))!;
    const debit = (code: string) => labor.lines.find((l) => l.accountCode === code)?.debitCents ?? 0;
    expect(debit(ACC_WIP_SOW)).toBeGreaterThan(0);
    expect(debit(ACC_WIP_GROW)).toBeGreaterThan(0);
    expect(debit(ACC_WIP_PACK)).toBeGreaterThan(0);
    expect(debit(ACC_WIP_SOW) + debit(ACC_WIP_GROW) + debit(ACC_WIP_PACK)).toBe(Math.round(led.amounts.directLaborStandard * 100));
  });

  it('capitalises labor and overhead into inventory, not into the period', () => {
    expect(led.amounts.overheadAbsorbed).toBeGreaterThan(0);
    expect(led.amounts.finishedGoodsCost).toBeGreaterThan(led.amounts.materialIssuedToWip);
  });

  it('expenses distribution instead of capitalising it', () => {
    const deliv = led.entries.find((e) => e.id.endsWith('DELIV'))!;
    expect(deliv.lines.some((l) => l.accountCode === '7900' && l.debitCents > 0)).toBe(true);
    expect(deliv.lines.some((l) => l.accountCode === ACC_FINISHED_GOODS)).toBe(false);
  });

  it('runs both labor variances at zero when the sowing runs to standard', () => {
    const v = led.variances;
    expect(v.laborRate).toBeCloseTo(0, 6);
    expect(v.laborEfficiency).toBeCloseTo(0, 6);
  });

  it('keeps pack-rounded over-purchase in raw materials at the price paid', () => {
    const po = buildPurchaseOrder(trays, growPlan).total;
    expect(po).toBeGreaterThan(led.amounts.materialIssuedToWip);
    expect(net(led.entries, ACC_RAW_MATERIALS)).toBe(Math.round(po * 100) - Math.round(led.amounts.materialIssuedToWip * 100));
    expect(FARM_COA.some((a) => a.code === '5110' || a.code === '5120')).toBe(false);
  });
});

describe('variances and spoilage when the sowing does not run to standard', () => {
  it('splits a labor miss into rate and efficiency', () => {
    const b = sowingAtStandard();
    b.actualLaborHours = 30;
    b.actualLaborRate = 31;
    const led = ledgerFor(b);
    expect(led.balanced).toBe(true);
    expect(led.variances.laborRate).not.toBeCloseTo(0, 3);
    expect(led.variances.laborEfficiency).not.toBeCloseTo(0, 3);
  });

});

describe('issues at the cost of the lots drawn', () => {
  const doc = recordAtStandard();
  const seedLot = doc.lots[0]!;
  const seedLb = seedLot.seedIssuedG / GRAMS_PER_LB;
  const seedPrice = card.lines.find((l) => l.line.kind === 'seed')!.unitCost;
  const atPlanPrice = ledgerFor(toSowingExecution(doc));
  const ledgerOn = (receipts: ReceiptDoc[], d: SowingRecordDoc = doc) => {
    const { issueCosts } = lotRegister({ receipts, sowings: [d], asOf: '9999-12-31' });
    return productionSowingLedger(toSowingExecution(d), {
      overhead: absorbOverhead(annualFixed, nc, nc.unitsPerYear),
      purchaseOrderCost: 0,
      receiptRecorded: true,
      issueCosts: issueCosts.get(d.id),
      pricePerUnit: phases[0].pricePerUnit,
    }, growPlan);
  };

  it('seed issued from a lot received at twice the plan price costs twice as much; the rest stays at the plan price', () => {
    const led = ledgerOn([seedReceipt('R1', '2026-09-01', 'LOT-A', seedLb * 2, 2)]);
    expect(led.balanced).toBe(true);
    expect(led.amounts.materialIssuedToWip).toBeCloseTo(atPlanPrice.amounts.materialIssuedToWip + seedLb * seedPrice, 6);
    expect(led.notes.join(' ')).not.toContain(seedLot.variety + ' (');
    for (const code of [ACC_WIP_SOW, ACC_WIP_GROW, ACC_WIP_PACK]) expect(net(led.entries, code)).toBe(0);
  });

  it('draws the oldest lot first when the record names none', () => {
    const led = ledgerOn([seedReceipt('R2', '2026-09-10', 'LOT-NEW', seedLb, 3), seedReceipt('R1', '2026-09-01', 'LOT-OLD', seedLb, 2)]);
    expect(led.amounts.materialIssuedToWip).toBeCloseTo(atPlanPrice.amounts.materialIssuedToWip + seedLb * seedPrice, 6);
  });

  it('draws the lot the record names, ahead of an older one', () => {
    const named = recordAtStandard();
    named.lots[0]!.seedLotCode = 'LOT-NEW';
    const led = ledgerOn([seedReceipt('R2', '2026-09-10', 'LOT-NEW', seedLb, 3), seedReceipt('R1', '2026-09-01', 'LOT-OLD', seedLb, 2)], named);
    expect(led.amounts.materialIssuedToWip).toBeCloseTo(atPlanPrice.amounts.materialIssuedToWip + 2 * seedLb * seedPrice, 6);
  });

  it('crosses into the next lot when the first runs out, and prices what no lot covers at the plan price', () => {
    const led = ledgerOn([seedReceipt('R1', '2026-09-01', 'LOT-A', seedLb / 2, 2)]);
    // Half the seed at twice the price, half with no lot at the plan's price.
    expect(led.amounts.materialIssuedToWip).toBeCloseTo(atPlanPrice.amounts.materialIssuedToWip + (seedLb / 2) * seedPrice, 6);
    expect(led.notes.join(' ')).toContain(`${seedLot.variety} (${(seedLb / 2).toFixed(3)} lb)`);
  });

  it('ignores a lot received after the sow date', () => {
    const led = ledgerOn([seedReceipt('R1', '2026-09-20', 'LOT-LATE', seedLb, 2)]);
    expect(led.amounts.materialIssuedToWip).toBeCloseTo(atPlanPrice.amounts.materialIssuedToWip, 6);
  });

  it('trays removed at the harvest check leave as abnormal spoilage from the pack stage; a packed tray still costs the standard', () => {
    const atStd = ledgerFor(sowingAtStandard());
    const b = sowingAtStandard();
    const removed = 2;
    b.goodUnits = trays - removed;
    for (const l of b.lots) {
      const g = (l.harvestedG * removed) / trays;
      l.scrap.push({ reason: 'CONTAMINATION', g, stage: 'PACK', note: 'mold at the check' });
      l.packedG -= g;
    }
    const led = ledgerFor(b);
    expect(led.balanced).toBe(true);
    for (const code of [ACC_WIP_SOW, ACC_WIP_GROW, ACC_WIP_PACK]) expect(net(led.entries, code)).toBe(0);
    const spoil = led.entries.find((e) => e.id.endsWith('SPOIL'))!;
    expect(spoil.lines.some((l) => l.accountCode === ACC_ABNORMAL_SPOILAGE && l.debitCents > 0)).toBe(true);
    expect(spoil.lines.some((l) => l.accountCode === ACC_WIP_PACK && l.creditCents > 0)).toBe(true);
    expect(led.amounts.materialIssuedToWip).toBeCloseTo(atStd.amounts.materialIssuedToWip, 6);
    expect(led.amounts.standardCostPerUnit).toBeCloseTo(atStd.amounts.standardCostPerUnit, 1);
  });

  it('seed dropped at sowing is issued and relieved from the sow stage at its price', () => {
    const atStd = ledgerFor(sowingAtStandard());
    const b = sowingAtStandard();
    const lot = b.lots[0]!;
    lot.seedIssuedG += 50;
    lot.scrap.push({ reason: 'DROPPED_OR_DAMAGED', g: 50, stage: 'SOW', note: 'bag dropped at issue' });
    const led = ledgerFor(b);
    expect(led.balanced).toBe(true);
    const price = card.lines.find((l) => l.line.kind === 'seed' && l.line.varietyKey === lot.varietyKey)!.unitCost / GRAMS_PER_LB;
    expect(led.amounts.abnormalSpoilage).toBeCloseTo(50 * price, 2);
    expect(led.amounts.materialIssuedToWip).toBeCloseTo(atStd.amounts.materialIssuedToWip + 50 * price, 6);
    const spoil = led.entries.find((e) => e.id.endsWith('SPOIL'))!;
    expect(spoil.lines.some((l) => l.accountCode === ACC_WIP_SOW && l.creditCents > 0)).toBe(true);
  });

  it('medium issued beyond the plan is issued at its price, with no variance', () => {
    const atStd = ledgerFor(sowingAtStandard());
    const b = sowingAtStandard();
    const medium = b.issues.find((i) => i.kind === 'medium')!;
    const line = card.lines.find((l) => lineLabel(l.line) === medium.input)!;
    medium.qty += 1;
    const led = ledgerFor(b);
    expect(led.balanced).toBe(true);
    expect(led.amounts.materialIssuedToWip).toBeCloseTo(atStd.amounts.materialIssuedToWip + line.unitCost, 6);
  });

  it('posts the period’s incurred overhead against applied, and leaves the gap in the period', () => {
    const b = sowingAtStandard();
    const incurred = annualFixed / 250; // one production day's share of the budget
    const led = productionSowingLedger(b, {
      overhead: absorbOverhead(annualFixed, nc, nc.unitsPerYear),
      overheadIncurred: incurred,
      purchaseOrderCost: buildPurchaseOrder(trays, growPlan).total,
      pricePerUnit: phases[0].pricePerUnit,
    }, growPlan);
    expect(led.balanced).toBe(true);
    const inc = led.entries.find((e) => e.id.endsWith('OH-INCURRED'))!;
    expect(inc.lines.some((l) => l.accountCode === ACC_OH_CONTROL && l.debitCents > 0)).toBe(true);
    // Under-absorption for the day = incurred − fixed applied, and it never reaches inventory.
    expect(led.variances.overheadVolume).toBeCloseTo(incurred - led.amounts.overheadAbsorbed, 6);
    expect(-net(led.entries, ACC_OH_APPLIED)).toBe(Math.round(led.amounts.overheadAbsorbed * 100));
    expect(led.notes.join(' ')).toMatch(/absorbed/);
  });

  it('never posts the ANNUAL volume variance on a single sowing', () => {
    const phase1 = phases[0].unitsPerDay * phases[0].operatingDays;
    const led = ledgerFor(sowingAtStandard(), phase1);
    expect(led.balanced).toBe(true);
    expect(led.entries.some((e) => e.id.endsWith('OHVOL'))).toBe(false);
    expect(led.variances.overheadVolume).toBe(0);
    expect(led.variances.disposition).toBe('TO_COGS');
  });

  it('charges fixed labor once per sowing the record covers', () => {
    const one = ledgerFor(sowingAtStandard());
    const two = productionSowingLedger(sowingAtStandard(), {
      sowings: 2,
      overhead: absorbOverhead(annualFixed, nc, nc.unitsPerYear),
      purchaseOrderCost: buildPurchaseOrder(trays, growPlan).total,
      pricePerUnit: phases[0].pricePerUnit,
    }, growPlan);
    expect(two.amounts.directLaborStandard).toBeGreaterThanOrEqual(one.amounts.directLaborStandard);
    expect(two.balanced).toBe(true);
  });

  it('flags a material net variance for proration rather than dumping it in COGS', () => {
    const b = sowingAtStandard();
    b.actualLaborHours = 200;
    b.actualLaborRate = 60;
    const led = ledgerFor(b);
    expect(led.variances.disposition).toBe('PRORATE');
  });
});

describe('the mass balance invariant', () => {
  it('balances a sowing that ran to standard', () => {
    const mb = massBalance(sowingAtStandard());
    expect(mb.balanced).toBe(true);
    expect(mb.failures).toEqual([]);
  });

  it('refuses a sowing with unaccounted grams', () => {
    const b = sowingAtStandard();
    b.lots[0]!.packedG -= 20; // 20 g vanish with no scrap record
    const mb = massBalance(b);
    expect(mb.balanced).toBe(false);
    expect(mb.failures[0]).toContain('unaccounted for');
  });

  it('accepts grams that leave as recorded scrap', () => {
    const b = sowingAtStandard();
    b.lots[0]!.packedG -= 20;
    b.lots[0]!.scrap.push({ reason: 'DROPPED_OR_DAMAGED', g: 20, stage: 'PACK', note: 'tray dropped at the harvest station' });
    expect(massBalance(b).balanced).toBe(true);
  });

  it('refuses more seed scrapped before sowing than was issued', () => {
    const b = sowingAtStandard();
    b.lots[0]!.scrap.push({ reason: 'DROPPED_OR_DAMAGED', g: b.lots[0]!.seedIssuedG * 2, stage: 'SOW', note: '' });
    expect(massBalance(b).balanced).toBe(false);
  });

  it('separates normal from abnormal scrap', () => {
    const b = sowingAtStandard();
    const lot = b.lots[0]!;
    const allowance = lot.shrinkAllowanceG;
    lot.scrap.push({ reason: 'TRIM', g: 10, stage: 'PACK', note: '' }, { reason: 'CONTAMINATION', g: 7, stage: 'PACK', note: '' });
    lot.packedG -= 17;
    const first = massBalance(b).lots[0]!;
    // TRIM is normal only up to the lot's allowance, which the standard issue already used.
    expect(first.normalScrapG).toBeCloseTo(allowance, 6);
    expect(first.abnormalScrapG).toBeCloseTo(17, 6);
  });

  it('classifies every scrap reason', () => {
    expect(isAbnormalScrap('CONTAMINATION')).toBe(true);
    expect(isAbnormalScrap('TRIM')).toBe(false);
    expect(MASS_BALANCE_TOLERANCE_G).toBeGreaterThan(0);
    const k = classifyScrap({ shrinkAllowanceG: 4, scrap: [{ reason: 'TRIM', g: 3, stage: 'SOW', note: '' }, { reason: 'TRIM', g: 3, stage: 'PACK', note: '' }] });
    expect(k[0]).toMatchObject({ normalG: 3, abnormalG: 0 });
    expect(k[1]).toMatchObject({ normalG: 1, abnormalG: 2 });
  });
});

describe('the shrink allowance is on the record', () => {
  it('the standard issue carries the allowance and shows it as normal scrap before sowing', () => {
    const b = sowingAtStandard();
    for (const l of b.lots) {
      const line = card.lines.find((x) => x.line.kind === 'seed' && x.line.varietyKey === l.varietyKey)!;
      expect(l.seedIssuedG).toBeCloseTo(line.quantity * trays * (1 + shrink), 6);
      expect(l.shrinkAllowanceG).toBeCloseTo(line.quantity * trays * shrink, 6);
      expect(l.scrap).toEqual([expect.objectContaining({ reason: 'TRIM', stage: 'SOW' })]);
      expect(l.scrap[0]!.g).toBeCloseTo(l.shrinkAllowanceG, 6);
    }
    const mb = massBalance(b);
    expect(mb.abnormalScrapG).toBe(0);
    expect(ledgerFor(b).amounts.abnormalSpoilage).toBe(0);
  });
});

describe('traceability rides on the issue journal', () => {
  const led = ledgerFor(sowingAtStandard());

  it('emits one transformation event per variety lot, in grams', () => {
    expect(led.traceability).toHaveLength(sowingAtStandard().lots.length);
    for (const e of led.traceability) expect(e.cte).toBe('TRANSFORMATION');
    expect(led.traceability[0]!.output.quantity).toBeGreaterThan(0);
  });

  it('names the seed and the medium among a lot\'s inputs', () => {
    const b = sowingAtStandard();
    const names = led.traceability[0]!.inputs.map((i) => i.productDescription);
    expect(names).toContain(b.lots[0]!.variety);
    for (const i of b.issues) expect(names).toContain(i.input);
  });

  it('reports missing input lot codes rather than inventing them, and clears once they are recorded', () => {
    expect(led.traceabilityGaps.length).toBeGreaterThan(0);
    expect(led.traceabilityGaps[0]!.reason).toContain('cannot be traced back one step');
    const b = sowingAtStandard();
    for (const l of b.lots) l.seedLotCode = 'SUP-260901-001';
    for (const i of b.issues) i.lotCode = 'SUP-260901-002';
    expect(traceabilityGaps(ledgerFor(b).traceability)).toEqual([]);
  });

  it('generates a stable, sortable lot code', () => {
    expect(traceabilityLotCode('MF', 'BROC01', '2026-09-14', 'Di Cicco broccoli', 1)).toBe('MF-BROC01-260914-DICICC-01');
  });
});

describe('weights reach the ledger in grams', () => {
  it('reports seed issued, harvested and packed grams for the sowing', () => {
    const w = ledgerFor(sowingAtStandard()).weights;
    expect(w.seedIssuedG).toBeGreaterThan(0);
    expect(w.harvestedG).toBeGreaterThan(w.seedIssuedG); // seed to greens
    expect(w.packedG).toBeCloseTo(w.harvestedG, 6); // a live tray packs what it harvests
  });
});
