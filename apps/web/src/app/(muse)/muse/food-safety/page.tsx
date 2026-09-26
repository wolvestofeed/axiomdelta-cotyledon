import Link from 'next/link';
import { PageHeader, Card, Kpi, Notice } from '../_components/ui';
import { ccps } from '../_data/plan-data';
import { clock } from '../_data/crews';
import { getResolvedActiveInputs } from '../_lib/scenarios';
import { CCP2_LIMITS, evaluateCcp2 } from '../_engine/food-safety';
import { coolingLoadsOf } from '../_engine/batch';
import { loadActuals } from '../_lib/actuals';
import { listOrders } from '../_lib/orders';
import { deliveredConsumption, finishedGoodsOnHand } from '../_engine/production-plan';
import { allLinks } from '../_lib/entity-links';
import { hydrateEntityRefs } from '../_lib/entity-directory';
import { entityRef, lotTrace, type LotEdge, type EntityKind } from '../_engine/entity-links';

export const dynamic = 'force-dynamic';

/**
 * Food Safety (Roadmap N9): the CCP-2 cooling log is read from the closed batch records —
 * one row per chilled component, the measured temperatures on the record and pass or fail
 * computed from them. The page always reads the records; a forecast cools nothing.
 */
export default async function FoodSafetyPage() {
  // The trace is the recall question: a lot back to the operations that supplied
  // it, and forward to the sites it reached. Edges are the recorded links.
  const [rows, { inputs }, actuals, orders] = await Promise.all([allLinks(), getResolvedActiveInputs(), loadActuals(), listOrders()]);
  const C = inputs.capacityInputs;
  const today = new Date().toISOString().slice(0, 10);
  const recipeName = (code: string) => inputs.recipes.find((r) => r.code === code)?.name ?? code;
  const hotComponents = (code: string) => new Set((inputs.recipes.find((r) => r.code === code)?.ingredients ?? []).filter((i) => i.isHotComponent).map((i) => i.component ?? i.name));

  // The cook is the lot: one record per cook, one cooling record per cabinet load
  // it filled (`batchesRun`). Every load of every chilled component passes CCP-2;
  // a load with no readings is a gap on the lot, and the lot fails if any load fails.
  const coolingLog = actuals.batches.flatMap((b) =>
    b.components.flatMap((c) =>
      coolingLoadsOf(c).map((t, li) => {
        const ev = evaluateCcp2(t.t2F, t.t6F);
        return { batchId: b.batchId, lot: c.outputLotCode, load: li + 1, loads: b.batchesRun, date: b.productionDate, product: `${c.component} — ${recipeName(b.recipeCode)}`, t0: t.t0F, t2: t.t2F, t6: t.t6F, pass: ev.pass, reason: ev.reason, initials: b.closedBy ?? '—', corrective: b.notes };
      }),
    ),
  ).sort((a, b) => b.date.localeCompare(a.date) || a.lot.localeCompare(b.lot) || a.load - b.load);
  // Chilled lots, and the loads each still owes the log.
  const chilledLots = actuals.batches.flatMap((b) => {
    const hot = hotComponents(b.recipeCode);
    return b.components
      .filter((c) => (c.chilledLb ?? 0) > 0 && (hot.size === 0 || hot.has(c.component)))
      .map((c) => ({ code: c.outputLotCode, product: `${c.component} — ${recipeName(b.recipeCode)}`, recorded: coolingLoadsOf(c).length, expected: b.batchesRun }));
  });
  const missingRecord = chilledLots.filter((l) => l.recorded < l.expected);
  const completeLots = chilledLots.filter((l) => l.recorded >= l.expected).length;
  const failed = coolingLog.filter((r) => !r.pass);
  const pf = Object.fromEntries(inputs.phaseProfiles.map((p) => [p.phase, p.portionFactor.value])) as Record<number, number>;
  const onHand = finishedGoodsOnHand({ batches: actuals.batches, consumed: deliveredConsumption(orders, actuals.deliveries, inputs.recipes, pf), holdLifeDays: inputs.assumptions.inventory.chilledHoldLife.value, asOf: today });
  const lotByBatch = new Map(onHand.lots.map((l) => [l.batchId, l]));
  const edges: LotEdge[] = rows
    .filter((r) => r.fromKind === 'lot')
    .map((r) => ({ fromId: r.fromId, toKind: r.toKind as EntityKind, toId: r.toId, note: r.note }));
  const byRef = await hydrateEntityRefs(edges.map((e) => entityRef(e.toKind, e.toId)));
  const name = (kind: EntityKind, id: string) => byRef[entityRef(kind, id)]?.name ?? id;

  // Recorded links key on the batch id — the operator-visible lot on Inventory.
  const traces = coolingLog.map((r) => ({ record: r, trace: lotTrace(r.batchId, edges) }));
  const tracedBack = traces.filter((t) => t.trace.supplierIds.length > 0).length;
  const failedTraces = traces.filter((t) => !t.record.pass);

  return (
    <>
      <PageHeader
        title="Food Safety"
        purpose="Log critical control points and cooling, and trace any lot both ways."
        functions={['Critical control points', 'CCP-2 cooling log', 'Trace', 'Coverage']}
        connects={[
          { href: '/muse/production-planning', dir: 'from' },
          { href: '/muse/inventory', dir: 'both' },
        ]}
        howItWorks={
          <ul>
            <li>Cook-chill is a multi-pass thermal process, so critical limits follow the FDA Food Code model. Verify with Austin Public Health before adoption.</li>
            <li>CCP-2 two-stage cooling is pass/fail on the record, not at review.</li>
            <li>Every record names a lot, traced back to the operations that supplied it and forward to the sites it reached.</li>
          </ul>
        }
        status="live"
      />

      <div className="grid gap-3 muse-autofit-11">
        <Kpi value={ccps.length} label="Critical control points" sub="CCP-1 through CCP-5" />
        <Kpi value={`${completeLots} / ${chilledLots.length}`} label="Chilled lots with every load recorded" sub={missingRecord.length === 0 ? 'Every cabinet load of every chilled component' : `${missingRecord.length} lot(s) with a load unrecorded`} />
        <Kpi value={failed.length} label="Failed cooling records" sub="Computed from the readings, one per cabinet load" />
        <Kpi value={`${tracedBack} / ${coolingLog.length}`} label="Records traceable to a supplier" sub="Recorded at receiving" />
      </div>

      <Card title="Critical control points" className="mt-4">
        <div className="muse-scroll-x">
          <table className="muse-table">
            <thead>
              <tr><th>CCP</th><th>Step</th><th>Critical limit</th><th>Monitoring</th><th>Corrective action</th></tr>
            </thead>
            <tbody>
              {ccps.map((c) => (
                <tr key={c.id}>
                  <td className={`font-semibold! ${(c.id === 'CCP-2' ? 'muse-c-accent' : 'muse-c-ink')}`}>{c.id}</td>
                  <td className="font-medium!">{c.step}</td>
                  <td className="muse-c-soft">{c.criticalLimit}</td>
                  <td className="muse-c-soft max-w-64!">{c.monitoring}</td>
                  <td className="muse-c-soft max-w-64!">{c.correctiveAction}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="CCP-2 cooling log — 135°F → 70°F within 2h, then 70°F → 41°F within 4h more" className="mt-4">
        <div className="muse-scroll-x">
          <table className="muse-table">
            <thead>
              <tr>
                <th>Date</th><th>Lot</th><th>Product</th><th className="num">0 hr</th><th className="num">2 hr</th>
                <th className="num">6 hr</th><th>Result</th><th>By</th><th>Received from</th><th>Shipped to</th>
              </tr>
            </thead>
            <tbody>
              {traces.length === 0 && (
                <tr><td colSpan={10} className="muse-c-soft">No closed batch record carries cooling readings yet. Readings are taken on the <Link className="muse-link" href="/muse/floor">Floor</Link> when a batch is closed.</td></tr>
              )}
              {traces.map(({ record: r, trace }) => (
                <tr key={`${r.batchId}-${r.lot}-${r.load}`}>
                  <td>{r.date}</td>
                  <td className="muse-mono muse-fs-xs">{r.lot}<div className="muse-c-faint muse-fs-2xs">{r.batchId}{r.loads > 1 ? ` · load ${r.load} of ${r.loads}` : ''}</div></td>
                  <td>{r.product}</td>
                  <td className="num">{r.t0}°F</td>
                  <td className={`num ${(r.t2 > CCP2_LIMITS.twoHourMaxF ? 'muse-c-accent' : '')}`}>{r.t2}°F</td>
                  <td className={`num ${(r.t6 > CCP2_LIMITS.sixHourMaxF ? 'muse-c-accent' : '')}`}>{r.t6}°F</td>
                  <td>
                    <span className={`muse-pill ${r.pass ? 'ok' : 'over'}`} title={r.reason}>{r.pass ? 'PASS' : 'FAIL'}</span>
                  </td>
                  <td>{r.initials}</td>
                  <td className="muse-fs-xs muse-c-soft">
                    {trace.supplierIds.length === 0 ? (
                      <span className="muse-c-faint">not recorded</span>
                    ) : (
                      trace.supplierIds.map((id, i) => (
                        <span key={id}>
                          {i > 0 ? ' · ' : ''}
                          <Link className="muse-link" href={`/muse/suppliers/${id}`}>{name('supplier', id)}</Link>
                        </span>
                      ))
                    )}
                  </td>
                  <td className="muse-fs-xs muse-c-soft">
                    {trace.siteIds.length === 0
                      ? <span className="muse-c-faint">not shipped</span>
                      : trace.siteIds.map((id) => name('site', id)).join(' · ')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {failed.map((r) => (
          <div className="mt-3" key={`${r.batchId}-${r.lot}-${r.load}`}>
            <Notice title={`Failed cooling — lot ${r.lot}${r.loads > 1 ? `, load ${r.load} of ${r.loads}` : ''} (${r.product})`}>{r.reason}.{r.loads > 1 ? ' The lot fails on this load whatever the other loads read.' : ''} {r.corrective ? `Notes on the batch record: ${r.corrective}` : 'No corrective action is written on the batch record.'}</Notice>
          </div>
        ))}
        {missingRecord.length > 0 ? (
          <div className="mt-3">
            <Notice title="Chilled lots with no cooling readings on the record">
              {missingRecord.map((l) => `${l.code} (${l.product})${l.expected > 1 ? ` — ${l.expected - l.recorded} of ${l.expected} loads` : ''}`).join(', ')}. Every cook-chill lot
              passes through CCP-2, so a missing record is a gap in the log, not a lot that skipped the
              control.
            </Notice>
          </div>
        ) : null}
        <p className="muse-kpi-sub mt-2">
          PASS and FAIL are computed from the measured temperatures against the CCP-2 limits
          ({CCP2_LIMITS.twoHourMaxF}°F at 2 h, then {CCP2_LIMITS.sixHourMaxF}°F at 6 h), not stored
          beside them — a record cannot claim a pass its own numbers contradict. Receiving and shipment
          links are recorded on <Link className="muse-link" href="/muse/inventory">Inventory</Link>;
          they are facts of record, held outside any scenario.
        </p>
      </Card>

      <Card title="Trace — what a recall on a failed record would reach" className="mt-4">
        {failedTraces.length === 0 ? (
          <p className="muse-kpi-sub">No failed cooling record in this log.</p>
        ) : (
          failedTraces.map(({ record: r, trace }) => {
            const lot = lotByBatch.get(r.batchId);
            const reached = trace.siteIds.length;
            return (
              <div key={`${r.batchId}-${r.lot}`} className="border-t border-t-[color:var(--muse-line)] pt-[0.7rem] mt-[0.7rem]!">
                <div className="font-semibold">
                  Lot {r.lot} — {r.product}
                  <span className="font-normal muse-c-soft">
                    {' '}· cooled {r.date} · {lot ? `${Math.round(lot.qtyProduced)} portions produced, ${Math.round(Math.max(0, lot.remaining))} on hand` : 'quantity not on file'}
                  </span>
                </div>
                <div className="flex flex-wrap gap-6 mt-2! muse-fs-sm">
                  <div className="flex-[1_1_18rem]">
                    <div className="muse-kpi-label">Back — operations that supplied it</div>
                    {trace.supplierIds.length === 0 ? (
                      <div className="muse-c-faint">No supplier recorded at receiving, so this lot cannot be traced back.</div>
                    ) : (
                      <ul className="mt-[0.3rem]! mr-0! mb-0! ml-0! pl-[1.1rem]">
                        {trace.supplierIds.map((id) => (
                          <li key={id}><Link className="muse-link" href={`/muse/suppliers/${id}`}>{name('supplier', id)}</Link></li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div className="flex-[1_1_18rem]">
                    <div className="muse-kpi-label">Forward — sites it reached</div>
                    {reached === 0 ? (
                      <div className="muse-c-faint">No shipment recorded; nothing left the building on this lot.</div>
                    ) : (
                      <ul className="mt-[0.3rem]! mr-0! mb-0! ml-0! pl-[1.1rem]">
                        {trace.siteIds.map((id) => <li key={id}>{name('site', id)}</li>)}
                      </ul>
                    )}
                  </div>
                  {trace.sourceIds.length > 0 ? (
                    <div className="flex-[1_1_18rem]">
                      <div className="muse-kpi-label">Documents on the lot</div>
                      <ul className="mt-[0.3rem]! mr-0! mb-0! ml-0! pl-[1.1rem]">
                        {trace.sourceIds.map((id) => <li key={id}>{name('source', id)}</li>)}
                      </ul>
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })
        )}
        <p className="muse-kpi-sub mt-2">
          The trace states what is recorded and what is not. A lot with no receiving link cannot be
          traced back, and the page says so rather than implying coverage the records do not carry.
        </p>
      </Card>

      <Card title="Coverage and the unstaffed window" className="mt-4">
        <p className="text-sm muse-c-soft leading-[1.55]!">
          The operating day is {clock(C.operatingOpenMin.value)}–{clock(C.operatingCloseMin.value)}, a
          presumption rather than a decision. Outside it no production crew is scheduled. Passive
          processes run — bean soak, refrigerated thaw, marination, blast-chiller hold — and so does
          the overnight pulled-pork roast in the combi at 225°F, held at 160°F until the morning shift
          pulls it; hot holding carries the Food Code limit of 135°F or above (3-501.16). The
          production lead verifies the CCP-2 cooling log live at each check. Any chill completing while
          no crew is scheduled runs on a continuous datalogger with an alarm to a named on-call
          responder; the staffing findings on <Link className="muse-link" href="/muse/schedule">Schedule</Link> name
          each one against the proposed crews.
        </p>
      </Card>
    </>
  );
}
