import { PageHeader, Card, StatusBadge, num } from '@/components/ui';
import { withWorkspace } from '@/server/workspace';
import { getFarmAccess } from '@/server/access';
import { listGrowPlans } from '@/server/grow-plans';
import { listExperiments } from '@/server/experiments';
import { loadActuals } from '@/server/actuals';
import { listTimeStudies } from '@/server/time-studies';
import { getResolvedActiveInputs } from '@/server/scenarios';
import { defaultGrowUnits } from '@/engine';
import { unitTakesPlan } from '@/engine/grow-capacity';
import { standardSowingRecordPrefill } from '@/engine/actuals';
import { standardInForce, standardLabel } from '@/engine/standards';
import { EXPERIMENT_STATUS_LABELS, experimentStatus, experimentWindow, recordOf, yieldAcross } from '@/engine/experiments';
import { GROW_PLAN_STATUS_LABELS } from '@/data/plan-data';
import { ExperimentsClient, type ExperimentRow } from './ExperimentsClient';
import { MoveToInService } from './MoveToInService';

export const dynamic = 'force-dynamic';

/** R&D · Experiments: titled runs of plans under development on the grow units, and each variety's yield across them. */
export default async function ExperimentsPage() {
  return withWorkspace(() => ExperimentsPageInner());
}

async function ExperimentsPageInner() {
  const [access, library, experiments, actuals, studies, { inputs }] = await Promise.all([getFarmAccess(), listGrowPlans(), listExperiments(), loadActuals(), listTimeStudies(), getResolvedActiveInputs()]);
  const today = new Date().toISOString().slice(0, 10);
  const growUnits = inputs.capacityInputs.growUnits ?? defaultGrowUnits;
  const shrink = inputs.assumptions.yield.shrinkAllowance.value;
  const standards = actuals.standards ?? [];
  const sowingCountByDate = actuals.sowings.reduce<Record<string, number>>((m, b) => ({ ...m, [b.productionDate]: (m[b.productionDate] ?? 0) + 1 }), {});
  const planOf = (code: string) => library.find((p) => p.code === code);
  const takenBy = (code: string) => {
    const plan = planOf(code);
    return plan ? growUnits.filter((u) => unitTakesPlan(u, plan)).map((u) => u.item) : [];
  };

  const candidates = library.filter((p) => p.status !== 'in_service').map((p) => ({ code: p.code, name: p.name, status: GROW_PLAN_STATUS_LABELS[p.status], units: takenBy(p.code) }));

  const rows: ExperimentRow[] = experiments.map((e) => {
    const plan = planOf(e.growPlanCode);
    const status = experimentStatus(e, plan, actuals.sowings, today);
    const record = recordOf(e, actuals.sowings);
    const std = standardInForce(standards, e.growPlanCode, e.sowDate);
    return {
      experiment: e,
      planName: plan?.name ?? 'not in the library',
      window: plan ? experimentWindow(plan, e.sowDate) : null,
      status,
      statusLabel: EXPERIMENT_STATUS_LABELS[status],
      units: takenBy(e.growPlanCode),
      record: record ? { sowingId: record.sowingId, traysSown: record.traysSown ?? record.plannedUnits, traysPacked: record.traysPacked ?? record.goodUnits } : null,
      plan: plan && !record ? plan : null,
      prefill: plan && !record ? standardSowingRecordPrefill(e.sowDate, (sowingCountByDate[e.sowDate] ?? 0) + 1, e.trays, plan, shrink, std ? standardLabel(std) : undefined) : null,
    };
  });

  const channelNames = (phases: readonly number[]) => phases.map((ph) => inputs.phases.find((p) => p.phase === ph)?.market ?? `Channel ${ph}`).join(', ');
  const plansRun = [...new Set(experiments.map((e) => e.growPlanCode))].map(planOf).filter((p) => p !== undefined);
  const yields = plansRun.map((p) => ({ plan: p, y: yieldAcross(p, experiments, actuals.sowings), studies: studies.studies.filter((s) => s.growPlanCode === p.code && s.studiedOn !== null) }));

  return (
    <>
      <PageHeader
        title="Experiments"
        purpose="Run grow plans under development as titled experiments on the grow units, and read each variety's yield across them."
        functions={['Start an experiment', 'Experiments', 'Yield per variety', 'Move to in service']}
        connects={[
          { href: '/farm/rd/blends', dir: 'from' },
          { href: '/farm/production-planning/grow-calendar', dir: 'to' },
          { href: '/farm/time-studies', dir: 'to' },
        ]}
        howItWorks={
          <ul>
            <li>An experiment is a titled run of a plan not in service: the plan, a sow date and whole trays.</li>
            <li>From its sow date it holds its trays on the grow units for the plan&rsquo;s cycle, placed as any sowing is, on a unit whose fixture delivers the plan&rsquo;s light line; production planning, the Grow Calendar and the Grow Room see the room it takes.</li>
            <li>It closes through the grow form here, one lot per variety with each variety&rsquo;s harvest weighed sorted from the trays; the sowing record names the experiment.</li>
            <li>A variety&rsquo;s yield in one experiment is its packed grams over the trays packed. Across the plan&rsquo;s closed experiments it is read as the mean, the lowest and highest and the standard deviation, beside the figure the plan is costed at.</li>
            <li>An experiment&rsquo;s time study is recorded on Time Studies against its plan.</li>
            <li>An experiment&rsquo;s cost, packed or lost, is charged to Research and Development (7920), never finished goods.</li>
            <li>Moving a plan to in service writes each measured variety&rsquo;s mean grams per tray onto its seed line, DERIVED; the cost card, the sowing record&rsquo;s standard and unit economics read it from then on. The channels picked at the move, Subscriptions, Restaurants and Retail and wholesale ticked to start, are the ones it is offered on.</li>
          </ul>
        }
        status="partial"
      />

      <ExperimentsClient
        today={today}
        candidates={candidates}
        rows={rows}
        growUnits={growUnits}
        sowingCountByDate={sowingCountByDate}
        isAdmin={access.isSuperAdmin}
      />

      <Card title="Yield per variety" className="mt-4">
        {yields.length === 0 ? (
          <p className="farm-kpi-sub">No experiment is on file.</p>
        ) : (
          yields.map(({ plan, y, studies: ts }) => (
            <div key={plan.code} className="mb-4">
              <div className="farm-card-title">{plan.code} · {plan.name}</div>
              <div className="farm-scroll-x">
                <table className="farm-table compact">
                  <thead>
                    <tr><th>Variety</th><th className="num">Experiments</th><th>Grams per tray packed, each</th><th className="num">Mean</th><th className="num">Lowest to highest</th><th className="num">Standard deviation</th><th className="num">Plan&rsquo;s figure</th></tr>
                  </thead>
                  <tbody>
                    {y.varieties.map((v) => (
                      <tr key={v.varietyKey}>
                        <td>{v.name}</td>
                        <td className="num">{v.n}</td>
                        <td>{v.perTray.length ? v.perTray.map((g) => num(g, 0)).join(', ') : '—'}</td>
                        <td className="num">{v.mean !== null ? `${num(v.mean, 0)} g` : '—'}</td>
                        <td className="num">{v.min !== null && v.max !== null ? `${num(v.min, 0)} to ${num(v.max, 0)} g` : '—'}</td>
                        <td className="num">{v.sd !== null ? `${num(v.sd, 1)} g` : '—'}</td>
                        <td className="num">{v.expected ? <><StatusBadge status={v.expected.status} /> {num(v.expected.grams, 0)} g</> : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="farm-kpi-sub mt-2">
                {y.closed} closed of {experiments.filter((e) => e.growPlanCode === plan.code).length} experiments{y.nonePacked ? `, ${y.nonePacked} with no tray packed` : ''}; {num(y.traysSown)} trays sown, {num(y.traysRemoved)} removed at the harvest check.
                {' '}Time studies recorded on the plan: {ts.length}, {ts.filter((s) => s.approvedAt).length} approved.
              </p>
              {plan.status === 'in_service' ? (
                <p className="farm-kpi-sub mt-1">In service on {plan.channels.length ? channelNames(plan.channels) : 'no channel'}. The plan&rsquo;s figure is what it is costed at: DERIVED where its experiments measured the variety.</p>
              ) : (
                <>
                  <p className="farm-kpi-sub mt-1">
                    {GROW_PLAN_STATUS_LABELS[plan.status]}. Moving it to in service writes each measured variety&rsquo;s mean onto its seed line as its harvest per tray, DERIVED with the count
                    {y.varieties.some((v) => v.mean === null) ? `; ${y.varieties.filter((v) => v.mean === null).map((v) => v.name).join(', ')} keep${y.varieties.filter((v) => v.mean === null).length === 1 ? 's' : ''} the variety record's figure` : ''}.
                    {' '}Its approved time studies are its labor standard, the estimate until one is approved. It is offered on the channels picked below: the Flat Builder and a subscriber&rsquo;s flat plan offer a plan only on the subscriber&rsquo;s channel, and Production Planning costs a run on a channel the plan is not on at that channel&rsquo;s unit factor. On the plan now: {plan.channels.length ? channelNames(plan.channels) : 'no channel'}.
                  </p>
                  {access.isSuperAdmin && <MoveToInService code={plan.code} channels={inputs.phases.map((p) => ({ phase: p.phase, market: p.market }))} />}
                </>
              )}
            </div>
          ))
        )}
      </Card>
    </>
  );
}
