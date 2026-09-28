import 'server-only';
import { purchaseName } from '@/data/grow-plan';
import { getResolvedActiveInputs } from '@/server/scenarios';
import { listOrders } from '@/server/orders';
import { loadActuals } from '@/server/actuals';
import { listPurchaseOrders } from '@/server/supplier-catalog';
import { loadCalendar } from '@/server/periods';
import { getLedgerKind } from '@/server/ledgers';
import { orderBook, isoAddDays } from '@/engine/orders';
import { planHorizon } from '@/engine/production-plan';
import { netRequirements, openOrders, rawStockOnHand, type NetLine } from '@/engine/net-requirements';
import { recordPickupPoints } from '@/engine/demand';

/** How far ahead the next distribution is looked for. */
const LOOKAHEAD_DAYS = 60;

/**
 * The next production run's net requirement on the selected world: the order book on the next
 * distribution date with any order, each plan's trays sown on its own sow date (outline §5 rule 1),
 * exploded through the grow plans' lines and netted against raw stock and open purchase orders.
 * Plan has no stock or orders on record; Actual nets against the records. The saved open forecast,
 * as every server page reads. `productionDate` is the earliest sow date the distribution needs.
 */
export async function nextRunNet(today: string): Promise<{ kind: 'plan' | 'actual'; distributionDate: string; productionDate: string; lines: NetLine[]; inputs: string[] }> {
  const [kind, { inputs }, orders, actuals, pos, calendar] = await Promise.all([getLedgerKind(), getResolvedActiveInputs(), listOrders(), loadActuals(), listPurchaseOrders(), loadCalendar()]);
  const isPlan = kind === 'plan';
  const closures = calendar.closures;
  const pf = Object.fromEntries(inputs.phaseProfiles.map((p) => [p.phase, p.unitFactor.value])) as Record<number, number>;
  const channelPriceCents = Object.fromEntries(inputs.phases.map((p) => [p.phase, Math.round(p.pricePerUnit * 100)])) as Record<number, number>;
  const from = isoAddDays(today, 1);
  const ahead = orderBook({
    pickupPoints: isPlan ? inputs.demand.pickupPoints : recordPickupPoints(inputs.subscribers, { closures }),
    subscribers: inputs.subscribers,
    orders: isPlan ? [] : orders,
    from,
    to: isoAddDays(today, LOOKAHEAD_DAYS),
    channelPriceCents,
    closures,
  });
  const distributionDate = ahead.map((o) => o.orderDate).sort()[0] ?? from;
  const book = ahead.filter((o) => o.orderDate === distributionDate);
  const horizon = planHorizon({
    from: today,
    to: distributionDate,
    book,
    growPlans: inputs.growPlans,
    capacityInputs: inputs.capacityInputs,
    assumptions: inputs.assumptions,
    growPlanAssumptions: inputs.growPlanAssumptions,
    unitFactorByChannel: pf,
    openingLots: [],
    channels: inputs.phases.map((p) => p.phase),
    closures,
  });
  const sowDays = horizon.productionDays.filter((d) => d.runs.some((r) => r.produced > 0));
  const productionDate = sowDays.map((d) => d.productionDate).sort()[0] ?? distributionDate;
  const stock = rawStockOnHand({ receipts: isPlan ? [] : actuals.receipts, sowings: isPlan ? [] : actuals.sowings, asOf: productionDate });
  const onOrder = openOrders({ purchaseOrders: isPlan ? [] : pos.map((po) => ({ id: po.id, poNumber: po.poNumber, status: po.status, orderedFor: po.orderedFor, supplierId: po.supplierId, supplierName: po.supplierName, lines: po.lines.map((l) => ({ input: l.input, qty: l.qty, unit: l.unit, unitPriceCents: l.unitPriceCents })) })), receipts: isPlan ? [] : actuals.receipts });
  const net = netRequirements({ days: sowDays.map((d) => ({ productionDate: d.productionDate, lines: d.purchase.lines })), stock, onOrder });
  const inputNames = [...new Set(inputs.growPlans.filter((r) => r.status === 'in_service').flatMap((r) => r.lines.map((l) => purchaseName(l))))].sort();
  return { kind, distributionDate, productionDate, lines: net.lines, inputs: inputNames };
}
