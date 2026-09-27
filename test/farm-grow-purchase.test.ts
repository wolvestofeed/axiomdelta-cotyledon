/**
 * What a grow plan buys: the purchase lines are the grow lines as bought for one tray, named as
 * receipts, purchase orders and supplier links are keyed, priced at the resolver's catalog price
 * or what-if where one stands over the line's own.
 */
import { describe, expect, it } from 'vitest';
import { growPlanSeed } from '@/data/grow-plans-seed';
import { VARIETY_BY_KEY } from '@/data/varieties';
import { projectCropPlan } from '@/engine/grow-plan-bridge';
import { buildPurchaseOrder, purchaseLines, purchaseOrderForRun } from '@/engine/grow-purchase';
import { resolveScenarioInputs } from '@/engine/scenario';

describe('purchase lines', () => {
  it('carry the same names, units, quantities and prices the projected lines carried', () => {
    for (const plan of growPlanSeed) {
      const projected = projectCropPlan(plan).inputs;
      const lines = purchaseLines(plan);
      expect(lines.map((l) => l.name)).toEqual(projected.map((i) => i.name));
      expect(lines.map((l) => l.unit)).toEqual(projected.map((i) => i.unit));
      lines.forEach((l, i) => {
        expect(l.qtyPerTray).toBeCloseTo(projected[i]!.seedQtyPerSowing, 12);
        expect(l.unitCost).toBeCloseTo(projected[i]!.seedUnitCost, 12);
        expect(l.packSize).toBe(1);
      });
    }
  });

  it('a what-if the resolver attached prices the seed line, with its tag', () => {
    const broc = growPlanSeed.find((p) => p.code === 'BROC-01')!;
    const name = VARIETY_BY_KEY['broccoli']!.name;
    const r = resolveScenarioInputs({ inputs: { [`BROC-01::${name}`]: { seedUnitCost: 30 } } }, [projectCropPlan(broc)]);
    const seed = purchaseLines(r.cropPlans[0]!).find((l) => l.kind === 'seed')!;
    expect(seed.unitCost).toBe(30);
    expect(seed.name).toBe(name);
  });

  it('a purchase order buys every line but light, for the trays and the shrink allowance', () => {
    const broc = growPlanSeed.find((p) => p.code === 'BROC-01')!;
    const po = buildPurchaseOrder(20, broc);
    expect(po.lines.map((l) => l.name)).toEqual(purchaseLines(broc).filter((l) => l.kind !== 'light').map((l) => l.name));
    const seed = po.lines[0]!;
    expect(seed.requiredForProduction).toBeCloseTo(purchaseLines(broc)[0]!.qtyPerTray * 20, 12);
    expect(po.total).toBeCloseTo(po.lines.reduce((t, l) => t + l.extendedCost, 0), 12);
    expect(purchaseOrderForRun(20, broc, 0.03).lines[0]!.requiredForProduction).toBeCloseTo(seed.requiredForProduction * 1.03, 12);
  });
});
