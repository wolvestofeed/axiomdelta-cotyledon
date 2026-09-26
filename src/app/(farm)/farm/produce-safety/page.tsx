import Link from 'next/link';
import { PageHeader, Card, Kpi, Notice } from '@/components/ui';
import { controlPoints } from '@/data/plan-data';
import { clock } from '@/data/crews';
import { getResolvedActiveInputs } from '@/server/scenarios';
import { CCP2_LIMITS, evaluateCcp2, controlPointsForPlan, STAGE_CONTROL_POINTS } from '@/engine/produce-safety';
import { isGrowPlanCarrier } from '@/engine/grow-plan-bridge';
import { isGrowSowing, sowingRecordChecks } from '@/engine/sowing-record';
import { CheckPill, num } from '@/components/ui';
import { StatusBadge } from '@/components/ui';
import { stageLoadsOf } from '@/engine/sowing';
import { loadActuals } from '@/server/actuals';
import { listOrders } from '@/server/orders';
import { distributedConsumption, finishedGoodsOnHand } from '@/engine/production-plan';
import { allLinks } from '@/server/entity-links';
import { hydrateEntityRefs } from '@/server/entity-directory';
import { entityRef, lotTrace, type LotEdge, type EntityKind } from '@/engine/entity-links';
import { withWorkspace } from '@/server/workspace';

export const dynamic = 'force-dynamic';

/**
 * Produce Safety (Roadmap N9): the control-point-2 cooling log is read from the closed sowing records —
 * one row per blackout component, the measured temperatures on the record and pass or fail
 * computed from them. The page always reads the records; a forecast cools nothing.
 */
export default async function ProduceSafetyPage() {
  return withWorkspace(() => ProduceSafetyPageInner());
}

async function ProduceSafetyPageInner() {
  // The trace is the recall question: a lot back to the operations that supplied
  // it, and forward to the pickup points it reached. Edges are the recorded links.
  const [rows, { inputs }, actuals, orders] = await Promise.all([allLinks(), getResolvedActiveInputs(), loadActuals(), listOrders()]);
  const C = inputs.capacityInputs;
  const today = new Date().toISOString().slice(0, 10);
  const cropPlanName = (code: string) => inputs.cropPlans.find((r) => r.code === code)?.name ?? code;
  const hotComponents = (code: string) => new Set((inputs.cropPlans.find((r) => r.code === code)?.inputs ?? []).filter((i) => i.isHotComponent).map((i) => i.component ?? i.name));

  // The sow is the lot: one record per sow, one stage record per rack load
  // it filled (`sowingsRun`). Every load of every blackout component passes control-point-2;
  // a load with no readings is a gap on the lot, and the lot fails if any load fails.
  const coolingLog = actuals.sowings.flatMap((b) =>
    b.components.flatMap((c) =>
      stageLoadsOf(c).map((t, li) => {
        const ev = evaluateCcp2(t.t2F, t.t6F);
        return { sowingId: b.sowingId, lot: c.outputLotCode, load: li + 1, loads: b.sowingsRun, date: b.productionDate, product: `${c.component} — ${cropPlanName(b.cropPlanCode)}`, t0: t.t0F, t2: t.t2F, t6: t.t6F, pass: ev.pass, reason: ev.reason, initials: b.closedBy ?? '—', corrective: b.notes };
      }),
    ),
  ).sort((a, b) => b.date.localeCompare(a.date) || a.lot.localeCompare(b.lot) || a.load - b.load);
  // Blackout lots, and the loads each still owes the log.
  const blackoutLots = actuals.sowings.flatMap((b) => {
    const hot = hotComponents(b.cropPlanCode);
    return b.components
      .filter((c) => (c.blackoutLb ?? 0) > 0 && (hot.size === 0 || hot.has(c.component)))
      .map((c) => ({ code: c.outputLotCode, product: `${c.component} — ${cropPlanName(b.cropPlanCode)}`, recorded: stageLoadsOf(c).length, expected: b.sowingsRun }));
  });
  const missingRecord = blackoutLots.filter((l) => l.recorded < l.expected);
  // The grow-model sowings: each against the control points on its plan's stages.
  const growSowings = actuals.sowings
    .filter(isGrowSowing)
    .map((b) => {
      const plan = inputs.cropPlans.find((r) => r.code === b.cropPlanCode);
      return plan && isGrowPlanCarrier(plan) ? { b, checks: sowingRecordChecks(b.stageRecords ?? { seedTreatment: null, spentWaterTest: null, readings: [], harvestCheck: null }, plan.plan) } : null;
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => b.b.productionDate.localeCompare(a.b.productionDate));
  const completeLots = blackoutLots.filter((l) => l.recorded >= l.expected).length;
  const failed = coolingLog.filter((r) => !r.pass);
  const pf = Object.fromEntries(inputs.phaseProfiles.map((p) => [p.phase, p.unitFactor.value])) as Record<number, number>;
  const onHand = finishedGoodsOnHand({ sowings: actuals.sowings, consumed: distributedConsumption(orders, actuals.distributions, inputs.cropPlans, pf), shelfLifeDays: inputs.assumptions.inventory.blackoutShelfLife.value, asOf: today });
  const lotBySowing = new Map(onHand.lots.map((l) => [l.sowingId, l]));
  const edges: LotEdge[] = rows
    .filter((r) => r.fromKind === 'lot')
    .map((r) => ({ fromId: r.fromId, toKind: r.toKind as EntityKind, toId: r.toId, note: r.note }));
  const byRef = await hydrateEntityRefs(edges.map((e) => entityRef(e.toKind, e.toId)));
  const name = (kind: EntityKind, id: string) => byRef[entityRef(kind, id)]?.name ?? id;

  // Recorded links key on the sowing id — the operator-visible lot on Inventory.
  const traces = coolingLog.map((r) => ({ record: r, trace: lotTrace(r.sowingId, edges) }));
  const tracedBack = traces.filter((t) => t.trace.supplierIds.length > 0).length;
  const failedTraces = traces.filter((t) => !t.record.pass);

  return (
    <>
      <PageHeader
        title="Produce Safety"
        purpose="Log critical control points and cooling, and trace any lot both ways."
        functions={['Stage control points', 'Cooling log', 'Trace', 'Coverage']}
        connects={[
          { href: '/farm/production-planning', dir: 'from' },
          { href: '/farm/inventory', dir: 'both' },
        ]}
        howItWorks={
          <ul>
            <li>Grow is a multi-pass grow stage, so critical limits follow the FDA Food Code model. Verify with Austin Public Health before adoption.</li>
            <li>control-point-2 two-stage cooling is pass/fail on the record, not at review.</li>
            <li>Every record names a lot, traced back to the operations that supplied it and forward to the pickup points it reached.</li>
          </ul>
        }
        status="live"
      />

      <div className="grid gap-3 farm-autofit-11">
        <Kpi value={STAGE_CONTROL_POINTS.length} label="Stage control points" sub="seed sanitation, spent-water test, temperature and humidity, harvest check" />
        <Kpi value={controlPoints.length} label="Phase 1-era critical control points" sub="on the cooling log until the sowing record is re-based" />
        <Kpi value={`${completeLots} / ${blackoutLots.length}`} label="Blackout lots with every load recorded" sub={missingRecord.length === 0 ? 'Every rack load of every blackout component' : `${missingRecord.length} lot(s) with a load unrecorded`} />
        <Kpi value={failed.length} label="Failed stage records" sub="Computed from the readings, one per rack load" />
        <Kpi value={`${tracedBack} / ${coolingLog.length}`} label="Records traceable to a supplier" sub="Recorded at receiving" />
      </div>

      <Card title="Stage control points" className="mt-4">
        <div className="farm-scroll-x">
          <table className="farm-table">
            <thead>
              <tr><th>Control point</th><th>Stages</th><th>Applies to</th><th>Hazard</th><th>Critical limit</th><th>Monitoring</th><th>Corrective action</th><th>Record</th></tr>
            </thead>
            <tbody>
              {STAGE_CONTROL_POINTS.map((c) => (
                <tr key={c.id}>
                  <td className="font-medium!">{c.name}</td>
                  <td className="farm-c-soft">{c.stages.join(', ')}</td>
                  <td className="farm-c-soft">{c.appliesTo === 'all' ? 'every plan' : c.appliesTo === 'sprout' ? 'jar plans' : 'tray plans'}</td>
                  <td className="farm-c-soft max-w-56!">{c.hazard}</td>
                  <td className="max-w-72!"><StatusBadge status={c.criticalLimit.status} title={c.criticalLimit.note} /> <span className="farm-c-soft">{c.criticalLimit.value}</span></td>
                  <td className="farm-c-soft max-w-56!">{c.monitoring}</td>
                  <td className="farm-c-soft max-w-56!">{c.correctiveAction}</td>
                  <td className="farm-c-soft">{c.record}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="farm-scroll-x mt-3!">
          <table className="farm-table compact">
            <thead><tr><th>Plan</th><th>Format</th><th>Control points on its stages</th></tr></thead>
            <tbody>
              {inputs.cropPlans.filter(isGrowPlanCarrier).map((r) => (
                <tr key={r.code}><td>{r.code} · {r.name}</td><td>{r.plan.format}</td><td>{controlPointsForPlan(r.plan).map((c) => c.name).join(', ')}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="farm-kpi-sub mt-2">The sprout limits rest on 21 CFR Part 112 Subpart M, registered on Sources. The grow-room temperature and humidity band is the operator&rsquo;s to state in the produce safety plan; until then readings are recorded and none is judged.</p>
      </Card>

      <Card title="Stage records on the closed sowings" className="mt-4">
        <div className="farm-scroll-x">
          <table className="farm-table compact">
            <thead><tr><th>Sowing</th><th>Plan</th><th className="num">Sown</th><th className="num">Packed</th><th>Seed treatment</th><th>Spent-water test</th><th className="num">Readings</th><th>Harvest check</th><th>Record</th></tr></thead>
            <tbody>
              {growSowings.length === 0 && <tr><td colSpan={9} className="farm-c-soft">No sowing on the grow model has been closed yet. A sowing is closed on the <Link className="farm-link" href="/farm/grow-room">Grow Room</Link> with its stage records.</td></tr>}
              {growSowings.map(({ b, checks }) => {
                const by = (id: string) => checks.points.find((c) => c.point.id === id);
                const cell = (id: string) => { const c = by(id); return c ? <><CheckPill ok={c.status === 'recorded'} okLabel="RECORDED" overLabel={c.status === 'failed' ? 'FAILED' : 'GAP'} /> <span className="farm-kpi-sub">{c.detail}</span></> : <span className="farm-c-faint">—</span>; };
                return (
                  <tr key={b.id}>
                    <td className="farm-mono farm-fs-xs">{b.sowingId}<div className="farm-c-faint farm-fs-2xs">{b.productionDate}{b.packedOn ? ` → ${b.packedOn}` : ''}</div></td>
                    <td>{b.cropPlanCode}</td>
                    <td className="num">{num(b.traysSown ?? 0)}</td>
                    <td className="num">{num(b.traysPacked ?? 0)}</td>
                    <td>{cell('seed-sanitation')}</td>
                    <td>{cell('spent-water-test')}</td>
                    <td className="num">{num(b.stageRecords?.readings.length ?? 0)}</td>
                    <td>{cell('harvest-check')}</td>
                    <td><CheckPill ok={checks.complete} okLabel="COMPLETE" overLabel={`${checks.gaps.length} GAP${checks.gaps.length === 1 ? '' : 'S'}`} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="farm-kpi-sub mt-2">Each control point on the plan&rsquo;s stages is recorded, a gap or failed on the sowing; a gap is never a pass. The spent-water verdict is computed from the results.</p>
      </Card>

      <Card title="Phase 1-era critical control points" className="mt-4">
        <div className="farm-scroll-x">
          <table className="farm-table">
            <thead>
              <tr><th>CONTROL POINT</th><th>Step</th><th>Critical limit</th><th>Monitoring</th><th>Corrective action</th></tr>
            </thead>
            <tbody>
              {controlPoints.map((c) => (
                <tr key={c.id}>
                  <td className={`font-semibold! ${(c.id === 'control-point-2' ? 'farm-c-accent' : 'farm-c-ink')}`}>{c.id}</td>
                  <td className="font-medium!">{c.step}</td>
                  <td className="farm-c-soft">{c.criticalLimit}</td>
                  <td className="farm-c-soft max-w-64!">{c.monitoring}</td>
                  <td className="farm-c-soft max-w-64!">{c.correctiveAction}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="control-point-2 cooling log — 135°F → 70°F within 2h, then 70°F → 41°F within 4h more" className="mt-4">
        <div className="farm-scroll-x">
          <table className="farm-table">
            <thead>
              <tr>
                <th>Date</th><th>Lot</th><th>Product</th><th className="num">0 hr</th><th className="num">2 hr</th>
                <th className="num">6 hr</th><th>Result</th><th>By</th><th>Received from</th><th>Shipped to</th>
              </tr>
            </thead>
            <tbody>
              {traces.length === 0 && (
                <tr><td colSpan={10} className="farm-c-soft">No closed sowing record carries cooling readings yet. Readings are taken on the <Link className="farm-link" href="/farm/grow-room">Grow Room</Link> when a sowing is closed.</td></tr>
              )}
              {traces.map(({ record: r, trace }) => (
                <tr key={`${r.sowingId}-${r.lot}-${r.load}`}>
                  <td>{r.date}</td>
                  <td className="farm-mono farm-fs-xs">{r.lot}<div className="farm-c-faint farm-fs-2xs">{r.sowingId}{r.loads > 1 ? ` · load ${r.load} of ${r.loads}` : ''}</div></td>
                  <td>{r.product}</td>
                  <td className="num">{r.t0}°F</td>
                  <td className={`num ${(r.t2 > CCP2_LIMITS.twoHourMaxF ? 'farm-c-accent' : '')}`}>{r.t2}°F</td>
                  <td className={`num ${(r.t6 > CCP2_LIMITS.sixHourMaxF ? 'farm-c-accent' : '')}`}>{r.t6}°F</td>
                  <td>
                    <span className={`farm-pill ${r.pass ? 'ok' : 'over'}`} title={r.reason}>{r.pass ? 'PASS' : 'FAIL'}</span>
                  </td>
                  <td>{r.initials}</td>
                  <td className="farm-fs-xs farm-c-soft">
                    {trace.supplierIds.length === 0 ? (
                      <span className="farm-c-faint">not recorded</span>
                    ) : (
                      trace.supplierIds.map((id, i) => (
                        <span key={id}>
                          {i > 0 ? ' · ' : ''}
                          <Link className="farm-link" href={`/farm/suppliers/${id}`}>{name('supplier', id)}</Link>
                        </span>
                      ))
                    )}
                  </td>
                  <td className="farm-fs-xs farm-c-soft">
                    {trace.pickupPointIds.length === 0
                      ? <span className="farm-c-faint">not shipped</span>
                      : trace.pickupPointIds.map((id) => name('pickupPoint', id)).join(' · ')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {failed.map((r) => (
          <div className="mt-3" key={`${r.sowingId}-${r.lot}-${r.load}`}>
            <Notice title={`Failed cooling — lot ${r.lot}${r.loads > 1 ? `, load ${r.load} of ${r.loads}` : ''} (${r.product})`}>{r.reason}.{r.loads > 1 ? ' The lot fails on this load whatever the other loads read.' : ''} {r.corrective ? `Notes on the sowing record: ${r.corrective}` : 'No corrective action is written on the sowing record.'}</Notice>
          </div>
        ))}
        {missingRecord.length > 0 ? (
          <div className="mt-3">
            <Notice title="Blackout lots with no cooling readings on the record">
              {missingRecord.map((l) => `${l.code} (${l.product})${l.expected > 1 ? ` — ${l.expected - l.recorded} of ${l.expected} loads` : ''}`).join(', ')}. Every grow lot
              passes through control-point-2, so a missing record is a gap in the log, not a lot that skipped the
              control.
            </Notice>
          </div>
        ) : null}
        <p className="farm-kpi-sub mt-2">
          PASS and FAIL are computed from the measured temperatures against the control-point-2 limits
          ({CCP2_LIMITS.twoHourMaxF}°F at 2 h, then {CCP2_LIMITS.sixHourMaxF}°F at 6 h), not stored
          beside them — a record cannot claim a pass its own numbers contradict. Receiving and shipment
          links are recorded on <Link className="farm-link" href="/farm/inventory">Inventory</Link>;
          they are facts of record, held outside any scenario.
        </p>
      </Card>

      <Card title="Trace — what a recall on a failed record would reach" className="mt-4">
        {failedTraces.length === 0 ? (
          <p className="farm-kpi-sub">No failed stage record in this log.</p>
        ) : (
          failedTraces.map(({ record: r, trace }) => {
            const lot = lotBySowing.get(r.sowingId);
            const reached = trace.pickupPointIds.length;
            return (
              <div key={`${r.sowingId}-${r.lot}`} className="border-t border-t-[color:var(--farm-line)] pt-[0.7rem] mt-[0.7rem]!">
                <div className="font-semibold">
                  Lot {r.lot} — {r.product}
                  <span className="font-normal farm-c-soft">
                    {' '}· cooled {r.date} · {lot ? `${Math.round(lot.qtyProduced)} units produced, ${Math.round(Math.max(0, lot.remaining))} on hand` : 'quantity not on file'}
                  </span>
                </div>
                <div className="flex flex-wrap gap-6 mt-2! farm-fs-sm">
                  <div className="flex-[1_1_18rem]">
                    <div className="farm-kpi-label">Back — operations that supplied it</div>
                    {trace.supplierIds.length === 0 ? (
                      <div className="farm-c-faint">No supplier recorded at receiving, so this lot cannot be traced back.</div>
                    ) : (
                      <ul className="mt-[0.3rem]! mr-0! mb-0! ml-0! pl-[1.1rem]">
                        {trace.supplierIds.map((id) => (
                          <li key={id}><Link className="farm-link" href={`/farm/suppliers/${id}`}>{name('supplier', id)}</Link></li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div className="flex-[1_1_18rem]">
                    <div className="farm-kpi-label">Forward — pickup points it reached</div>
                    {reached === 0 ? (
                      <div className="farm-c-faint">No shipment recorded; nothing left the building on this lot.</div>
                    ) : (
                      <ul className="mt-[0.3rem]! mr-0! mb-0! ml-0! pl-[1.1rem]">
                        {trace.pickupPointIds.map((id) => <li key={id}>{name('pickupPoint', id)}</li>)}
                      </ul>
                    )}
                  </div>
                  {trace.sourceIds.length > 0 ? (
                    <div className="flex-[1_1_18rem]">
                      <div className="farm-kpi-label">Documents on the lot</div>
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
        <p className="farm-kpi-sub mt-2">
          The trace states what is recorded and what is not. A lot with no receiving link cannot be
          traced back, and the page says so rather than implying coverage the records do not carry.
        </p>
      </Card>

      <Card title="Coverage and the unstaffed window" className="mt-4">
        <p className="text-sm farm-c-soft leading-[1.55]!">
          The operating day is {clock(C.operatingOpenMin.value)}–{clock(C.operatingCloseMin.value)}, a
          presumption rather than a decision. Outside it no production crew is scheduled. Passive
          processes run — bean soak, refrigerated thaw, marination, blackout rack hold — and so does
          the overnight pulled-pork roast in the jarStand at 225°F, held at 160°F until the morning shift
          pulls it; hot holding carries the Food Code limit of 135°F or above (3-501.16). The
          production lead verifies the control-point-2 cooling log live at each check. Any blackout completing while
          no crew is scheduled runs on a continuous datalogger with an alarm to a named on-call
          responder; the staffing findings on <Link className="farm-link" href="/farm/schedule">Schedule</Link> name
          each one against the proposed crews.
        </p>
      </Card>
    </>
  );
}
