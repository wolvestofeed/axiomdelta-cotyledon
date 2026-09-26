import 'server-only';
import { getResolvedActiveInputs } from '@/server/scenarios';
import { listSubscriptionCycles, listOrders } from '@/server/orders';
import { loadActuals } from '@/server/actuals';
import { listPurchaseOrders } from '@/server/supplier-catalog';
import { loadCalendar } from '@/server/periods';
import { getLedgerKind } from '@/server/ledgers';
import { orderBook, isoAddDays, weekdayOf } from '@/engine/orders';
import { planProductionDay, productionDateFor, requirementsFor } from '@/engine/production-plan';
import { netRequirements, openOrders, rawStockOnHand, type NetLine } from '@/engine/net-requirements';
import { resolveSubscriberPickupPoints } from '@/engine/demand';

const SERVICE_WEEKDAYS = [1, 2, 3, 4, 5];

/**
 * The next production run's net requirement on the selected world (Roadmap N9): the
 * order book on the next service day, exploded through each crop plan's sowing and netted
 * against raw stock and open purchase orders. Plan has no stock or orders on record;
 * Actual nets against the records. The saved open forecast, as every server page reads.
 */
export async function nextRunNet(today: string): Promise<{ kind: 'plan' | 'actual'; distributionDate: string; productionDate: string; lines: NetLine[]; inputs: string[] }> {
  const [kind, { inputs }, cycles, orders, actuals, pos, calendar] = await Promise.all([getLedgerKind(), getResolvedActiveInputs(), listSubscriptionCycles(), listOrders(), loadActuals(), listPurchaseOrders(), loadCalendar()]);
  const isPlan = kind === 'plan';
  const closures = calendar.closures;
  let distributionDate = isoAddDays(today, 1);
  for (let i = 0; i < 7 && !SERVICE_WEEKDAYS.includes(weekdayOf(distributionDate)); i++) distributionDate = isoAddDays(distributionDate, 1);
  const productionDate = productionDateFor(distributionDate, SERVICE_WEEKDAYS, closures);
  const pf = Object.fromEntries(inputs.phaseProfiles.map((p) => [p.phase, p.unitFactor.value])) as Record<number, number>;
  const book = orderBook({
    pickupPoints: isPlan ? inputs.demand.pickupPoints : resolveSubscriberPickupPoints(inputs.subscribers, {}, { closures }),
    subscribers: inputs.subscribers,
    cycles,
    orders: isPlan ? [] : orders,
    from: distributionDate,
    to: distributionDate,
    channelPriceCents: Object.fromEntries(inputs.phases.map((p) => [p.phase, Math.round(p.pricePerUnit * 100)])) as Record<number, number>,
    closures,
  });
  const day = planProductionDay({ productionDate, requirements: requirementsFor(book, inputs.cropPlans, pf), onHand: {}, cropPlans: inputs.cropPlans, capacityInputs: inputs.capacityInputs, assumptions: inputs.assumptions, cropPlanAssumptions: inputs.cropPlanAssumptions });
  const stock = rawStockOnHand({ receipts: isPlan ? [] : actuals.receipts, sowings: isPlan ? [] : actuals.sowings, asOf: productionDate });
  const onOrder = openOrders({ purchaseOrders: isPlan ? [] : pos.map((po) => ({ id: po.id, poNumber: po.poNumber, status: po.status, orderedFor: po.orderedFor, supplierId: po.supplierId, supplierName: po.supplierName, lines: po.lines.map((l) => ({ input: l.input, qty: l.qty, unit: l.unit, unitPriceCents: l.unitPriceCents })) })), receipts: isPlan ? [] : actuals.receipts });
  const net = netRequirements({ days: [{ productionDate, lines: day.purchase.lines }], stock, onOrder });
  const inputNames = [...new Set(inputs.cropPlans.filter((r) => r.status === 'in_service').flatMap((r) => r.inputs.map((i) => i.name)))].sort();
  return { kind, distributionDate, productionDate, lines: net.lines, inputs: inputNames };
}
