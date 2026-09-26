import Link from 'next/link';
import { PageHeader, Card, Kpi } from '@/components/ui';
import { getResolvedActiveInputs } from '@/server/scenarios';
import { controlPointsForPlan, STAGE_CONTROL_POINTS } from '@/engine/produce-safety';
import { isGrowSowing, sowingRecordChecks } from '@/engine/sowing-record';
import { CheckPill, num } from '@/components/ui';
import { StatusBadge } from '@/components/ui';
import { loadActuals } from '@/server/actuals';
import { listOrders } from '@/server/orders';
import { distributedConsumption, finishedGoodsOnHand } from '@/engine/production-plan';
import { allLinks } from '@/server/entity-links';
import { hydrateEntityRefs } from '@/server/entity-directory';
import { entityRef, lotTrace, type LotEdge, type EntityKind } from '@/engine/entity-links';
import { withWorkspace } from '@/server/workspace';

export const dynamic = 'force-dynamic';

/**
 * Produce Safety: the control points on each plan's stages, the stage records on the closed
 * sowings with a gap or a failure computed from them, and the trace of a failed lot both ways.
 * The page always reads the records; a forecast records nothing.
 */
export default async function ProduceSafetyPage() {
  return withWorkspace(() => ProduceSafetyPageInner());
}

async function ProduceSafetyPageInner() {
  // The trace is the recall question: a lot back to the operations that supplied
  // it, and forward to the pickup points it reached. Edges are the recorded links.
  const [rows, { inputs }, actuals, orders] = await Promise.all([allLinks(), getResolvedActiveInputs(), loadActuals(), listOrders()]);
  const today = new Date().toISOString().slice(0, 10);
  const cropPlanName = (code: string) => inputs.cropPlans.find((r) => r.code === code)?.name ?? code;

  // The grow-model sowings: each against the control points on its plan's stages.
  const growSowings = actuals.sowings
    .filter(isGrowSowing)
    .map((b) => {
      const plan = inputs.cropPlans.find((r) => r.code === b.cropPlanCode);
      return plan ? { b, checks: sowingRecordChecks(b.stageRecords ?? { seedTreatment: null, spentWaterTest: null, readings: [], harvestCheck: null }, plan) } : null;
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => b.b.productionDate.localeCompare(a.b.productionDate));
  const completeSowings = growSowings.filter((g) => g.checks.complete).length;
  const failedPoints = growSowings.reduce((n, g) => n + g.checks.points.filter((p) => p.status === 'failed').length, 0);
  const pf = Object.fromEntries(inputs.phaseProfiles.map((p) => [p.phase, p.unitFactor.value])) as Record<number, number>;
  const onHand = finishedGoodsOnHand({ sowings: actuals.sowings, consumed: distributedConsumption(orders, actuals.distributions, inputs.cropPlans, pf), shelfLifeDays: inputs.assumptions.inventory.blackoutShelfLife.value, asOf: today, cropPlans: inputs.cropPlans });
  const lotBySowing = new Map(onHand.lots.map((l) => [l.sowingId, l]));
  const edges: LotEdge[] = rows
    .filter((r) => r.fromKind === 'lot')
    .map((r) => ({ fromId: r.fromId, toKind: r.toKind as EntityKind, toId: r.toId, note: r.note }));
  const byRef = await hydrateEntityRefs(edges.map((e) => entityRef(e.toKind, e.toId)));
  const name = (kind: EntityKind, id: string) => byRef[entityRef(kind, id)]?.name ?? id;

  // Recorded links key on the sowing id — the operator-visible lot on Inventory.
  const traces = growSowings.map(({ b, checks }) => ({ b, failed: checks.points.filter((p) => p.status === 'failed'), trace: lotTrace(b.sowingId, edges) }));
  const tracedBack = traces.filter((t) => t.trace.supplierIds.length > 0).length;
  const failedTraces = traces.filter((t) => t.failed.length > 0);

  return (
    <>
      <PageHeader
        title="Produce Safety"
        purpose="Record each sowing's stage control points and trace any lot both ways."
        functions={['Stage control points', 'Stage records', 'Trace']}
        connects={[
          { href: '/farm/production-planning', dir: 'from' },
          { href: '/farm/inventory', dir: 'both' },
        ]}
        howItWorks={
          <ul>
            <li>The control points are on each plan&rsquo;s stages: seed sanitation, the spent-water test on a jar plan, temperature and humidity, the harvest check. Verify the limits with Austin Public Health before adoption.</li>
            <li>A sowing&rsquo;s record is recorded, a gap or failed at each control point, computed on the record, not at review.</li>
            <li>Every sowing is a lot, traced back to the operations that supplied it and forward to the pickup points it reached.</li>
          </ul>
        }
        status="live"
      />

      <div className="grid gap-3 farm-autofit-11">
        <Kpi value={STAGE_CONTROL_POINTS.length} label="Stage control points" sub="seed sanitation, spent-water test, temperature and humidity, harvest check" />
        <Kpi value={`${completeSowings} / ${growSowings.length}`} label="Sowings with every stage recorded" sub={growSowings.length === completeSowings ? 'No gap and no failure' : `${growSowings.length - completeSowings} with a gap or a failure`} />
        <Kpi value={failedPoints} label="Failed stage records" sub="Computed from the records" />
        <Kpi value={`${tracedBack} / ${growSowings.length}`} label="Sowings traceable to a supplier" sub="Recorded at receiving" />
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
              {inputs.cropPlans.map((r) => (
                <tr key={r.code}><td>{r.code} · {r.name}</td><td>{r.format}</td><td>{controlPointsForPlan(r).map((c) => c.name).join(', ')}</td></tr>
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


      <Card title="Trace — what a recall on a failed record would reach" className="mt-4">
        {failedTraces.length === 0 ? (
          <p className="farm-kpi-sub">No failed stage record in this log.</p>
        ) : (
          failedTraces.map(({ b, failed, trace }) => {
            const lot = lotBySowing.get(b.sowingId);
            const reached = trace.pickupPointIds.length;
            return (
              <div key={b.sowingId} className="border-t border-t-[color:var(--farm-line)] pt-[0.7rem] mt-[0.7rem]!">
                <div className="font-semibold">
                  Lot {b.sowingId} — {cropPlanName(b.cropPlanCode)}
                  <span className="font-normal farm-c-soft">
                    {' '}· sown {b.productionDate} · failed at {failed.map((f) => f.point.name).join(', ')} · {lot ? `${Math.round(lot.qtyProduced)} trays packed, ${Math.round(Math.max(0, lot.remaining))} on hand` : 'quantity not on file'}
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

    </>
  );
}
