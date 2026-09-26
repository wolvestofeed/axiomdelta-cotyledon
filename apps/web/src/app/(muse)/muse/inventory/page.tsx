import Link from 'next/link';
import { PageHeader, Card, Kpi, money, num } from '../_components/ui';
import { RecordedLinkList } from '../_components/RecordedLinks';
import { getResolvedActiveInputs } from '../_lib/scenarios';
import { getMuseAccess } from '../_lib/access';
import { loadActuals } from '../_lib/actuals';
import { listOrders } from '../_lib/orders';
import { getLedgerKind, postLedger } from '../_lib/ledgers';
import { LedgerMonthBar, pickMonth } from '../_components/ledger/LedgerMonthBar';
import { PageControls } from '../_components/PageControls';
import { WorldNote } from '../_components/ledger/WorldNote';
import { linksFrom, manyPerFrom } from '../_lib/entity-links';
import { hydrateEntityRefs } from '../_lib/entity-directory';
import { entityRef, type LeanEntity } from '../_engine/entity-links';
import { finishedGoodsOnHand, portionFactorFor, type Consumption } from '../_engine/production-plan';
import { rawStockOnHand, rawLotsByUseBy } from '../_engine/net-requirements';

export const dynamic = 'force-dynamic';

const DAY_MS = 86_400_000;
const daysBetween = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS);

/**
 * Inventory (Roadmap I2/I5, N6 slice 3). On Actual, from the records. Finished goods are the closed
 * batch records' good portions, drawn oldest-first by delivered orders and
 * aged against the scenario's hold life. Raw materials are received lots less
 * what closed batches issued, by the use-by date on the case. The trace on a
 * finished lot — which suppliers' lots went in, which sites it shipped to — is
 * read from the receipts and deliveries on file; recorded links can add what
 * the records do not carry. No record, no stock. On Plan, the saved open
 * forecast's own timeline: its batches, receipts and deliveries, as of the end of
 * the month picked. Nothing on Plan is recorded, so it carries no trace or link.
 */
export default async function InventoryPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const [kind, access, params] = await Promise.all([getLedgerKind(), getMuseAccess(), searchParams]);
  const isPlan = kind === 'plan';
  const now = new Date().toISOString().slice(0, 10);

  let inputs: Awaited<ReturnType<typeof getResolvedActiveInputs>>['inputs'];
  let actuals: Pick<Awaited<ReturnType<typeof loadActuals>>, 'batches' | 'receipts' | 'deliveries'>;
  let consumedFrom: (pf: Record<number, number>) => Consumption[];
  let monthBar: React.ReactNode;
  let today = now;
  if (isPlan) {
    const selected = await postLedger('plan');
    const period = pickMonth(selected, params.period, now);
    today = selected.ledger.months.find((m) => m.label === period)!.to;
    inputs = selected.inputs;
    actuals = selected.bundle;
    monthBar = <PageControls><LedgerMonthBar selected={selected} period={period} basePath="/muse/inventory" /></PageControls>;
    // Every Plan delivery names its recipe.
    consumedFrom = (pf) =>
      selected.bundle.deliveries
        .filter((d) => d.recipeCode)
        .map((d) => ({ recipeCode: d.recipeCode!, date: d.deliveredOn, basePortions: d.meals * portionFactorFor(inputs.recipes.find((r) => r.code === d.recipeCode), d.phase, pf) }));
  } else {
    const [resolved, recorded, orders] = await Promise.all([getResolvedActiveInputs(), loadActuals(), listOrders()]);
    inputs = resolved.inputs;
    actuals = recorded;
    monthBar = <div className="mt-4"><WorldNote isPlan={false} /></div>;
    // ── Batch records less delivered orders.
    consumedFrom = (pf) => {
      const deliveryById = new Map(recorded.deliveries.map((d) => [d.id, d]));
      return orders
        .filter((o) => o.status === 'delivered')
        .map((o) => {
          const d = o.deliveryId ? deliveryById.get(o.deliveryId) : undefined;
          const f = portionFactorFor(inputs.recipes.find((r) => r.code === o.recipeCode), o.channel, pf);
          return { recipeCode: o.recipeCode, date: d?.deliveredOn ?? o.orderDate, basePortions: (d?.meals ?? o.meals) * f };
        });
    };
  }
  const holdLife = inputs.assumptions.inventory.chilledHoldLife.value;
  const pfByChannel = Object.fromEntries(inputs.phaseProfiles.map((p) => [p.phase, p.portionFactor.value])) as Record<number, number>;

  // ── Finished goods: batches less deliveries, FIFO, inside hold life, as of `today`.
  const consumed = consumedFrom(pfByChannel);
  const fg = finishedGoodsOnHand({ batches: actuals.batches, consumed, holdLifeDays: holdLife, asOf: today });
  const recipeName = (code: string) => inputs.recipes.find((r) => r.code === code)?.name ?? code;
  const batchByCode = new Map(actuals.batches.map((b) => [b.batchId, b]));
  const open = fg.lots
    .filter((l) => l.remaining > 1e-9)
    .map((l) => ({ ...l, daysRemaining: daysBetween(today, l.expires), doc: batchByCode.get(l.batchId) }))
    .sort((a, b) => a.produced.localeCompare(b.produced) || a.batchId.localeCompare(b.batchId));

  // ── The trace, from the records: input lots → receipts → suppliers; output lots → deliveries → sites.
  const supplierByLot = new Map<string, string>();
  for (const r of actuals.receipts) for (const l of r.lines) if (l.lotCode && l.lotCode !== 'not recorded' && r.supplierName) supplierByLot.set(l.lotCode, r.supplierName);
  const traceOf = (batchId: string) => {
    const doc = batchByCode.get(batchId);
    if (!doc) return { suppliers: [] as string[], sites: [] as string[], outputLots: [] as string[], inputsRecorded: 0, inputsTotal: 0 };
    const inputs = doc.components.flatMap((c) => c.consumed);
    const recorded = inputs.filter((l) => l.inputLotCode && l.inputLotCode !== 'not recorded');
    const suppliers = [...new Set(recorded.map((l) => supplierByLot.get(l.inputLotCode)).filter((s): s is string => Boolean(s)))];
    const outputLots = doc.components.map((c) => c.outputLotCode).filter(Boolean);
    const sites = [...new Set(actuals.deliveries.filter((d) => d.lotCodes.some((c) => outputLots.includes(c))).map((d) => d.siteName).filter((s): s is string => Boolean(s)))];
    return { suppliers, sites, outputLots, inputsRecorded: recorded.length, inputsTotal: inputs.length };
  };

  // ── Recorded links survive: keyed by the batch id, the operator-visible lot.
  const edges = isPlan ? [] : await linksFrom('lot', open.map((l) => l.batchId));
  const received = manyPerFrom(edges, 'received_from');
  const shipped = manyPerFrom(edges, 'shipped_to');
  const byRef = await hydrateEntityRefs(edges.map((e) => entityRef(e.toKind as never, e.toId)));
  const resolve = (list: typeof edges | undefined): LeanEntity[] =>
    (list ?? []).flatMap((e) => {
      const found = byRef[entityRef(e.toKind as never, e.toId)];
      return found ? [found] : [];
    });

  // ── Raw materials by use-by.
  const rawStock = rawStockOnHand({ receipts: actuals.receipts, batches: actuals.batches, asOf: today });
  const rawLots = rawLotsByUseBy(rawStock);
  const rawValue = Object.values(rawStock.byIngredient).reduce((s, l) => s + l.valueCents, 0) / 100;

  const totalRemaining = open.reduce((s, l) => s + l.remaining, 0);
  const nearExpiry = open.filter((l) => l.daysRemaining <= 7);
  const traced = open.filter((l) => traceOf(l.batchId).suppliers.length > 0 || (received[l.batchId] ?? []).length > 0).length;
  const expiredUnconsumed = Object.entries(fg.expiredByRecipe).filter(([, v]) => v > 1e-9);

  return (
    <>
      <PageHeader
        title="Inventory"
        purpose="See what stock is on hand, how old it is, and where each lot went."
        functions={isPlan ? ['Finished-goods lots', 'Raw materials on hand'] : ['Finished-goods lots', 'Raw materials on hand', 'Lot trace']}
        connects={[
          { href: '/muse/production-planning', dir: 'from' },
          { href: '/muse/procurement', dir: 'from' },
          { href: '/muse/orders', dir: 'from' },
        ]}
        howItWorks={
          isPlan ? (
            <ul>
              <li>On Plan, stock is the open forecast&rsquo;s own timeline. Nothing is recorded, so no lot carries a trace.</li>
              <li>Finished goods are its batches&rsquo; good portions, drawn oldest first by its deliveries and aged against hold life.</li>
              <li>Raw materials are the cases its purchasing receives less what its batches issue.</li>
            </ul>
          ) : (
            <ul>
              <li>On Actual, stock is the records. No record, no stock.</li>
              <li>Finished goods are good portions from closed batch records, drawn oldest first by delivered orders and aged against hold life.</li>
              <li>Raw materials are received lots less what closed batches issued, by the use-by date on the case.</li>
              <li>Days of cover is an average. One ageing lot can sit inside a healthy figure.</li>
              <li>A lot&rsquo;s trace runs from the supplier lots that went in to the sites it shipped to, read from the receipts and deliveries on file.</li>
            </ul>
          )
        }
        status="live"
      />

      {monthBar}

      <div className="grid gap-3 muse-autofit-11">
        <Kpi value={num(Math.round(totalRemaining))} label="Portions on hand" sub={`${open.length} open lot${open.length === 1 ? '' : 's'} inside hold life as of ${today}`} />
        <Kpi value={holdLife + ' days'} label="Chilled hold life" sub="Slush-state cold hold" />
        <Kpi value={nearExpiry.length} label="Lots within 7 days of expiry" sub="Against hold life" />
        {!isPlan && <Kpi value={`${traced} / ${open.length}`} label="Lots traceable to a supplier" sub="Input lots on the record, or a recorded link" />}
        <Kpi value={money(rawValue)} label="Raw materials on hand, at invoice" sub={`${rawLots.length} lot${rawLots.length === 1 ? '' : 's'} · ${rawLots.filter((l) => l.daysToUseBy !== null && l.daysToUseBy <= 7).length} dated within 7 days`} />
      </div>

      <Card title="Finished-goods lots — FIFO, oldest first" className="mt-4">
        {open.length === 0 ? (
          <p className="muse-kpi-sub">
            {isPlan ? (
              <>No batch in this forecast&apos;s timeline has portions inside hold life as of {today}.</>
            ) : (
              <>
                No closed batch record has portions inside hold life as of {today}. A batch record is closed on{' '}
                <Link className="muse-link" href="/muse/production-planning?level=day">Production Planning</Link> or the{' '}
                <Link className="muse-link" href="/muse/floor">Floor</Link>.
              </>
            )}
          </p>
        ) : (
          <div className="muse-scroll-x">
            <table className="muse-table">
              <thead>
                <tr>
                  <th>Batch</th><th>Recipe</th><th>Produced</th><th className="num">Remaining</th>
                  <th>Hold-life expiry</th><th className="num">Days left</th><th>Status</th>
                  {!isPlan && <><th>Received from</th><th>Shipped to</th></>}
                </tr>
              </thead>
              <tbody>
                {open.map((l) => {
                  const t = traceOf(l.batchId);
                  return (
                    <tr key={l.batchId}>
                      <td className="muse-mono muse-fs-xs">
                        {l.batchId}
                        {t.outputLots.length > 0 && <div className="muse-c-faint muse-fs-2xs">{t.outputLots.join(' · ')}</div>}
                      </td>
                      <td className="muse-c-soft">{recipeName(l.recipeCode)}<div className="muse-c-faint muse-fs-2xs">{l.doc?.closedBy ?? 'unsigned'}</div></td>
                      <td>{l.produced}</td>
                      <td className="num">{num(Math.round(l.remaining))} <span className="muse-c-faint">of {num(Math.round(l.qtyProduced))}</span></td>
                      <td>{l.expires}</td>
                      <td className={`num ${(l.daysRemaining <= 7 ? 'muse-c-accent' : '')} ${(l.daysRemaining <= 7 ? 'font-semibold!' : 'font-normal!')}`}>{l.daysRemaining}</td>
                      <td>
                        <span className={`muse-pill ${l.daysRemaining <= 7 ? 'over' : 'ok'}`}>
                          {l.daysRemaining < 0 ? 'PAST HOLD LIFE' : l.daysRemaining <= 7 ? 'EXPIRING' : 'IN HOLD'}
                        </span>
                      </td>
                      {!isPlan && <>
                      <td>
                        {t.suppliers.length > 0 && <div className="muse-fs-xs">{t.suppliers.join(', ')}</div>}
                        <div className="muse-c-faint muse-fs-2xs mb-[0.2rem]!">{t.inputsRecorded} of {t.inputsTotal} input lots on the record</div>
                        <RecordedLinkList
                          edge={{ fromKind: 'lot', fromId: l.batchId, toKind: 'supplier', relation: 'received_from' }}
                          linked={resolve(received[l.batchId])}
                          canEdit={access.isSuperAdmin}
                          addLabel="Record a supplier"
                          ariaLabel={`Record the operation that supplied batch ${l.batchId}`}
                          placeholder="Search name or product…"
                          emptyText="No supplier recorded"
                        />
                      </td>
                      <td>
                        {t.sites.length > 0 && <div className="muse-fs-xs mb-[0.2rem]!">{t.sites.join(', ')}</div>}
                        <RecordedLinkList
                          edge={{ fromKind: 'lot', fromId: l.batchId, toKind: 'site', relation: 'shipped_to' }}
                          linked={resolve(shipped[l.batchId])}
                          canEdit={access.isSuperAdmin}
                          addLabel="Record a site"
                          ariaLabel={`Record a site batch ${l.batchId} shipped to`}
                          placeholder="Search site name, type, county…"
                          emptyText="Not shipped"
                        />
                      </td>
                      </>}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {expiredUnconsumed.length > 0 && (
          <p className="muse-kpi-sub mt-2 muse-c-placeholder">
            Past hold life on {today}, unconsumed: {expiredUnconsumed.map(([k, v]) => `${num(Math.round(v))} ${k}`).join(', ')}. Not counted as on hand.
          </p>
        )}
        {!isPlan && <p className="muse-kpi-sub mt-2">
          A lot near expiry can sit inside a healthy aggregate days-of-cover. Suppliers are read from the receipts whose lot codes the batch consumed; sites from the deliveries that named the batch&apos;s output lots. A recorded link adds what the records do not carry and is a fact in every forecast. The CCP-2 cooling record for each batch is on <Link className="muse-link" href="/muse/food-safety">Food Safety</Link>.
        </p>}
      </Card>

      <Card title="Raw materials on hand — by use-by, earliest first" className="mt-4">
        {rawLots.length === 0 ? (
          <p className="muse-kpi-sub">No received lot has stock on hand as of {today}.{isPlan ? " The forecast's timeline receives each production day's cases on the production date." : <> Goods are received on <Link className="muse-link" href="/muse/procurement">Procurement</Link> against the purchase order.</>}</p>
        ) : (
          <div className="muse-scroll-x">
            <table className="muse-table">
              <thead><tr><th>Ingredient</th><th>Supplier lot</th><th>Received</th><th>Use by</th><th className="num">Days</th><th className="num">Remaining</th><th className="num">Value</th></tr></thead>
              <tbody>
                {rawLots.map((l) => (
                  <tr key={`${l.receiptId}-${l.lotCode}-${l.ingredient}`}>
                    <td>{l.ingredient}{l.onFoodTraceabilityList ? <div className="muse-fs-2xs muse-c-faint">Food Traceability List</div> : null}</td>
                    <td className="muse-mono muse-fs-xs">{l.lotCode}</td>
                    <td>{l.receivedOn}</td>
                    <td>{l.useBy ?? '—'}</td>
                    <td className={`num ${(l.daysToUseBy !== null && l.daysToUseBy <= 7 ? 'muse-c-accent' : '')}`}>{l.daysToUseBy === null ? '—' : l.daysToUseBy}</td>
                    <td className="num">{num(l.remaining, 2)} {l.unit}</td>
                    <td className="num">{money((l.remaining * l.unitPriceCents) / 100)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {Object.keys(rawStock.unmatchedIssues).length > 0 && (
          <p className="muse-kpi-sub mt-2 muse-c-placeholder">
            Issues on closed batches with no receipt to draw from: {Object.entries(rawStock.unmatchedIssues).map(([k, v]) => `${num(v, 1)} ${k}`).join(', ')}. Stock is not assumed for them.
          </p>
        )}
        <p className="muse-kpi-sub mt-2">Ordered by the date printed on the case; a negative day count is past that date. Lots with no date follow, by receipt date. Value is remaining quantity at the invoice price.</p>
      </Card>
    </>
  );
}
