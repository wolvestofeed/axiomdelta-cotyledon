/**
 * What a grow plan buys: the purchase lines are the grow lines as bought for one tray, named as
 * receipts, purchase orders and supplier links are keyed, priced at the resolver's catalog price
 * or what-if where one stands over the line's own.
 */
import { describe, expect, it } from 'vitest';
import { growPlanSeed } from '@/data/grow-plans-seed';
import { VARIETY_BY_KEY } from '@/data/varieties';
import { costPlan } from '@/engine/grow-costing';
import { lineLabel } from '@/data/grow-plan';
import { GRAMS_PER_LB } from '@/data/tray-formats';
import { buildPurchaseOrder, purchaseLines, purchaseOrderForRun } from '@/engine/grow-purchase';
import { resolveScenarioInputs } from '@/engine/scenario';

describe('purchase lines', () => {
  it('are the grow lines by label: seed in pounds at the variety price, the rest in the cost card unit', () => {
    for (const plan of growPlanSeed) {
      const costing = costPlan(plan);
      const lines = purchaseLines(plan, costing);
      expect(lines.map((l) => l.name)).toEqual(plan.lines.map((l) => lineLabel(l)));
      lines.forEach((l, i) => {
        const c = costing.lines[i]!;
        expect(l.packSize).toBe(1);
        if (c.line.kind === 'seed') {
          expect(l.unit).toBe('lb');
          expect(l.qtyPerTray).toBeCloseTo(c.quantity / GRAMS_PER_LB, 12);
          expect(l.unitCost).toBe(VARIETY_BY_KEY[c.line.varietyKey]!.seedPricePerLb.value);
        } else {
          expect(l.unit).toBe('each');
          expect(l.qtyPerTray).toBe(c.quantity);
          expect(l.unitCost).toBe(c.unitCost);
        }
      });
    }
  });

  it('a what-if the resolver attached prices the seed line, with its tag', () => {
    const broc = growPlanSeed.find((p) => p.code === 'BROC-01')!;
    const name = VARIETY_BY_KEY['broccoli']!.name;
    const r = resolveScenarioInputs({ inputs: { [`BROC-01::${name}`]: { seedUnitCost: 30 } } }, [broc]);
    const seed = purchaseLines(r.growPlans[0]!).find((l) => l.kind === 'seed')!;
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
