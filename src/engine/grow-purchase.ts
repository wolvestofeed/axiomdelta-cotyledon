/**
 * MicroFarm — what a grow plan buys. Pure.
 *
 * A plan's purchase lines are its grow lines as bought for one tray: a seed line in pounds of its
 * variety at the price per pound, a medium or nutrient line in the unit its cost card counts, and
 * a light line, which the fixture's electricity pays for and no purchase order carries. Each line
 * is named by its label (`lineLabel`), the name receipts, purchase orders, supplier links and the
 * scenario's price what-ifs are keyed by. Read at the plan's price (`GrowPlanDef.prices`: a
 * what-if, the last price paid, the catalog) or at the order's (`GrowPlanDef.orderPrices`: a
 * what-if, the catalog, the last price paid), each over the line's own with its tag and source.
 *
 * The purchase order for a run buys `units × (1 + shrink allowance)` trays' worth: the allowance
 * is seed and medium bought and never packed, so raw materials are relieved by no more than was
 * received (`accounting-policy.md`).
 */

import { assumptions } from '@/data/plan-data';
import { lineLabel, type GrowPlanDef, type GrowPlanLine } from '@/data/grow-plan';
import type { StatusTag } from '@/data/tagged';
import { GRAMS_PER_LB } from '@/data/tray-formats';
import { costPlan, type GrowPlanCosting } from '@/engine/grow-costing';

export interface PurchaseLine {
  name: string;
  kind: GrowPlanLine['kind'];
  /** Pounds for a seed line; the cost card's own unit, one "each", for the rest. */
  unit: 'lb' | 'each';
  /** What one tray takes, in `unit`. */
  qtyPerTray: number;
  unitCost: number;
  /** Units a case or pack holds; one until a supplier's pack size is on file. */
  packSize: number;
  status: StatusTag;
  source: string;
  /** The variety a seed line sows. */
  varietyKey: string | null;
}

/** Which price a line is read at: the plan's (the cost card, the forecast) or the order's (a purchase order). */
export type PriceFor = 'plan' | 'order';

/** The plan's lines as bought for one tray, light included (a purchase order leaves it out). */
export function purchaseLines(plan: GrowPlanDef, costing: GrowPlanCosting = costPlan(plan), priceFor: PriceFor = 'plan'): PurchaseLine[] {
  return costing.lines.map((c) => {
    const name = lineLabel(c.line);
    const seed = c.line.kind === 'seed';
    const price = priceFor === 'order' ? (plan.orderPrices ?? plan.prices)?.[name] : plan.prices?.[name];
    return {
      name,
      kind: c.line.kind,
      unit: seed ? 'lb' : 'each',
      qtyPerTray: seed ? c.quantity / GRAMS_PER_LB : c.quantity,
      unitCost: price?.unitCost ?? c.unitCost,
      packSize: 1,
      status: price?.status ?? c.status,
      source: price?.source ?? c.source,
      varietyKey: c.line.kind === 'seed' ? c.line.varietyKey : null,
    };
  });
}

export interface PurchaseOrderLine {
  name: string;
  unit: string;
  /** What one tray takes. */
  qtyPerTray: number;
  requiredForProduction: number; // per tray × trays
  packSize: number;
  casesToOrder: number; // ceil(required / packSize)
  unitCost: number;
  extendedCost: number; // cases × packSize × unitCost (what you actually spend)
}

export interface PurchaseOrder {
  lines: PurchaseOrderLine[];
  total: number;
}

/** What `trays` trays of a plan buy, at the order's price. Light is overhead (the fixture's electricity), never bought into raw stock. */
export function buildPurchaseOrder(trays: number, plan: GrowPlanDef): PurchaseOrder {
  const lines: PurchaseOrderLine[] = purchaseLines(plan, costPlan(plan), 'order')
    .filter((l) => l.kind !== 'light')
    .map((l) => {
      const requiredForProduction = l.qtyPerTray * trays;
      const casesToOrder = Math.ceil(requiredForProduction / l.packSize);
      return {
        name: l.name,
        unit: l.unit,
        qtyPerTray: l.qtyPerTray,
        requiredForProduction,
        packSize: l.packSize,
        casesToOrder,
        unitCost: l.unitCost,
        extendedCost: casesToOrder * l.packSize * l.unitCost,
      };
    });
  return { lines, total: lines.reduce((s, l) => s + l.extendedCost, 0) };
}

/** The purchase order for a run including the normal-spoilage allowance. */
export function purchaseOrderForRun(trays: number, plan: GrowPlanDef, shrinkAllowance: number = assumptions.yield.shrinkAllowance.value): PurchaseOrder {
  return buildPurchaseOrder(trays * (1 + shrinkAllowance), plan);
}
