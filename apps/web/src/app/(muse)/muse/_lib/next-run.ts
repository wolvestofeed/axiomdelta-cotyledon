import 'server-only';
import { getResolvedActiveInputs } from './scenarios';
import { listMenuCycles, listOrders } from './orders';
import { loadActuals } from './actuals';
import { listPurchaseOrders } from './supplier-catalog';
import { loadCalendar } from './periods';
import { getLedgerKind } from './ledgers';
import { orderBook, isoAddDays, weekdayOf } from '../_engine/orders';
import { planProductionDay, productionDateFor, requirementsFor } from '../_engine/production-plan';
import { netRequirements, openOrders, rawStockOnHand, type NetLine } from '../_engine/net-requirements';
import { resolveCustomerSites } from '../_engine/demand';

const SERVICE_WEEKDAYS = [1, 2, 3, 4, 5];

/**
 * The next production run's net requirement on the selected world (Roadmap N9): the
 * order book on the next service day, exploded through each recipe's batch and netted
 * against raw stock and open purchase orders. Plan has no stock or orders on record;
 * Actual nets against the records. The saved open forecast, as every server page reads.
 */
export async function nextRunNet(today: string): Promise<{ kind: 'plan' | 'actual'; deliveryDate: string; productionDate: string; lines: NetLine[]; ingredients: string[] }> {
  const [kind, { inputs }, cycles, orders, actuals, pos, calendar] = await Promise.all([getLedgerKind(), getResolvedActiveInputs(), listMenuCycles(), listOrders(), loadActuals(), listPurchaseOrders(), loadCalendar()]);
  const isPlan = kind === 'plan';
  const closures = calendar.closures;
  let deliveryDate = isoAddDays(today, 1);
  for (let i = 0; i < 7 && !SERVICE_WEEKDAYS.includes(weekdayOf(deliveryDate)); i++) deliveryDate = isoAddDays(deliveryDate, 1);
  const productionDate = productionDateFor(deliveryDate, SERVICE_WEEKDAYS, closures);
  const pf = Object.fromEntries(inputs.phaseProfiles.map((p) => [p.phase, p.portionFactor.value])) as Record<number, number>;
  const book = orderBook({
    sites: isPlan ? inputs.demand.sites : resolveCustomerSites(inputs.customers, {}, { closures }),
    customers: inputs.customers,
    cycles,
    orders: isPlan ? [] : orders,
    from: deliveryDate,
    to: deliveryDate,
    channelPriceCents: Object.fromEntries(inputs.phases.map((p) => [p.phase, Math.round(p.pricePerMeal * 100)])) as Record<number, number>,
    closures,
  });
  const day = planProductionDay({ productionDate, requirements: requirementsFor(book, inputs.recipes, pf), onHand: {}, recipes: inputs.recipes, capacityInputs: inputs.capacityInputs, assumptions: inputs.assumptions, recipeAssumptions: inputs.recipeAssumptions });
  const stock = rawStockOnHand({ receipts: isPlan ? [] : actuals.receipts, batches: isPlan ? [] : actuals.batches, asOf: productionDate });
  const onOrder = openOrders({ purchaseOrders: isPlan ? [] : pos.map((po) => ({ id: po.id, poNumber: po.poNumber, status: po.status, orderedFor: po.orderedFor, supplierId: po.supplierId, supplierName: po.supplierName, lines: po.lines.map((l) => ({ ingredient: l.ingredient, qty: l.qty, unit: l.unit, unitPriceCents: l.unitPriceCents })) })), receipts: isPlan ? [] : actuals.receipts });
  const net = netRequirements({ days: [{ productionDate, lines: day.purchase.lines }], stock, onOrder });
  const ingredients = [...new Set(inputs.recipes.filter((r) => r.status === 'in_service').flatMap((r) => r.ingredients.map((i) => i.name)))].sort();
  return { kind, deliveryDate, productionDate, lines: net.lines, ingredients };
}
