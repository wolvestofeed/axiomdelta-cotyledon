import { PageHeader, Card, StatusBadge, money, num } from '@/components/ui';
import { withWorkspace } from '@/server/workspace';
import { listGrowPlans } from '@/server/grow-plans';
import { listSubscribers } from '@/server/subscribers';
import { BLENDS, BLEND_SOURCE_LABEL, blendCode } from '@/data/blends';
import { VARIETY_BY_KEY, growthFor } from '@/data/varieties';
import { REGIME_BY_KEY } from '@/data/inputs-catalog';
import { cycleDays, daysToHarvest } from '@/data/stage-schedule';
import { BLEND_CODE_PREFIX, planStageDays, seedLines } from '@/data/grow-plan';
import { costPlan } from '@/engine/grow-costing';
import { scoreFlat, targetKeysIn, targetsOfPlan } from '@/engine/nutrition-targets';
import { NUTRITION_TARGETS, TARGET_BY_KEY, benefitsFor } from '@/data/nutrition-targets';
import { BlendTargetPicker } from './BlendTargetPicker';

export const dynamic = 'force-dynamic';

/** R&D · Blends: the blends under development, how their varieties grow together and what they carry. */
export default async function BlendsPage(props: Parameters<typeof BlendsPageInner>[0]) {
  return withWorkspace(() => BlendsPageInner(props));
}

async function BlendsPageInner({ searchParams }: { searchParams: Promise<{ subscriber?: string; targets?: string }> }) {
  const [library, allSubscribers, params] = await Promise.all([listGrowPlans(), listSubscribers(), searchParams]);
  const subscribers = allSubscribers.filter((c) => c.status !== 'inactive').sort((a, b) => a.name.localeCompare(b.name));
  const subscriber = subscribers.find((c) => c.id === params.subscriber) ?? null;
  const chosen = targetKeysIn(params.targets !== undefined ? params.targets.split(',') : subscriber?.nutritionTargets ?? []);
  const rows = BLENDS.map((b) => {
    const plan = library.find((p) => p.code === blendCode(b)) ?? null;
    return { def: b, code: blendCode(b), plan, score: plan && chosen.length ? scoreFlat(chosen, [plan], library) : null };
  });
  const built = rows.filter((r) => r.plan).length;
  return (
    <>
      <PageHeader
        title="Blends"
        purpose="Read each blend under development: how its varieties grow together, what it carries, and what its experiments run by hand."
        functions={['Target set', 'The blends', 'Growing fit', 'Nutrition targets', 'Methods by hand']}
        connects={[
          { href: '/farm/grow-plans', dir: 'to' },
          { href: '/farm/varieties', dir: 'from' },
          { href: '/farm/sources', dir: 'from' },
        ]}
        howItWorks={
          <ul>
            <li>A blend is one grow plan with two or more seed lines, developing until its experiments show a stable yield. Its lines are edited on Grow plans like any plan&rsquo;s.</li>
            <li>A seed line&rsquo;s share is its share of the tray, sown at the variety&rsquo;s own full-tray density times the share; lentil, mung and wheat are sown on their microgreen tray records.</li>
            <li>The plan runs on the slowest variety at each stage. Growing fit sets each variety&rsquo;s own figures beside it, and the spread in days to harvest.</li>
            <li>The nutrition targets are those the blend&rsquo;s varieties carry, each benefit citing its row on Sources.</li>
            <li>Target set reads every blend against a subscriber&rsquo;s saved targets or a set chosen here, as the Flat Builder reads a flat: a target is carried when one of the blend&rsquo;s varieties names it. For a target it does not carry, the library plans that do are listed.</li>
            <li>What a grow plan cannot yet express, a staggered sowing, a weighted blackout, a UV-C dose, a regime for the last days only, is listed as its document states it.</li>
          </ul>
        }
        status="partial"
      />

      <Card title="Target set">
        <BlendTargetPicker
          subscribers={subscribers.map((c) => ({ id: c.id, name: c.name, nutritionTargets: targetKeysIn(c.nutritionTargets ?? []) }))}
          targets={NUTRITION_TARGETS.map((t) => ({ key: t.key, name: t.name, kind: t.kind }))}
          subscriberId={subscriber?.id ?? ''}
          chosen={chosen}
        />
        <p className="farm-kpi-sub mt-2">
          {chosen.length
            ? `${chosen.length} targets${subscriber ? `, ${subscriber.name}'s` : ''}: ${chosen.map((k) => TARGET_BY_KEY[k]!.name).join(', ')}.`
            : subscriber
              ? `${subscriber.name} has no nutrition targets saved; they are set on Subscribers.`
              : 'No target set chosen.'}
        </p>
      </Card>

      <Card title="The blends" className="mt-4">
        <div className="farm-scroll-x">
          <table className="farm-table compact">
            <thead>
              <tr><th>Code</th><th>Blend</th><th>Composed for</th><th>Varieties</th><th className="num">To harvest</th><th>As stated</th><th>Light</th><th className="num">Cost per tray</th>{chosen.length > 0 && <th className="num">Chosen targets</th>}</tr>
            </thead>
            <tbody>
              {rows.map(({ def, code, plan, score }) => {
                if (!plan) {
                  return (
                    <tr key={code} className="faint">
                      <td className="farm-mono">{code}</td><td>{def.name}</td><td>{def.focus}</td>
                      <td colSpan={chosen.length ? 6 : 5}>Held: {def.held ?? 'not in the library'}</td>
                    </tr>
                  );
                }
                const days = planStageDays(plan);
                const card = costPlan(plan);
                const light = plan.lines.find((l) => l.kind === 'light');
                return (
                  <tr key={code}>
                    <td className="farm-mono"><a className="farm-link" href={`#${code}`}>{code}</a></td>
                    <td>{plan.name}</td>
                    <td>{def.focus}</td>
                    <td>{seedLines(plan).map((s) => `${VARIETY_BY_KEY[s.varietyKey]?.name ?? s.varietyKey} ${num(s.share * 100, 0)}%`).join(', ')}</td>
                    <td className="num">{daysToHarvest(days)} d</td>
                    <td>{def.harvestAsStated ?? '—'}</td>
                    <td>{light && light.kind === 'light' ? REGIME_BY_KEY[light.regimeKey]?.name ?? light.regimeKey : '—'}</td>
                    <td className="num">{money(card.perTray.total, 2)}</td>
                    {chosen.length > 0 && <td className="num">{score ? `${score.covered} of ${chosen.length}` : '—'}</td>}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="farm-kpi-sub mt-2">{built} of {rows.length} blends are built as developing grow plans. Cost per tray is the cost card: seed, the hemp mat, FloraGrow, light and consumables, before labor.</p>
      </Card>

      {rows.map(({ def, code, plan, score }) => {
        if (!plan) return null;
        const days = planStageDays(plan);
        const fit = seedLines(plan).map((s) => {
          const v = VARIETY_BY_KEY[s.varietyKey]!;
          const t = growthFor(v, true);
          return { s, v, t, toHarvest: daysToHarvest(t.stageDays.value) };
        });
        const harvestDays = fit.map((f) => f.toHarvest);
        const keys = new Set(fit.map((f) => f.v.key));
        const targets = targetsOfPlan(plan)
          .map((t) => ({ t, by: fit.filter((f) => t.varieties.includes(f.v.key)) }))
          .sort((a, b) => b.by.length - a.by.length || a.t.name.localeCompare(b.t.name));
        return (
          <Card key={code} title={`${code} · ${plan.name}`} className="mt-4">
            <div id={code} className="scroll-mt-4" />
            <p className="farm-kpi-sub">{BLEND_SOURCE_LABEL[def.source]}. Composed for {def.focus.toLowerCase()}. Ratio: {def.ratioAsStated}. Light as stated: {def.lightAsStated}.</p>

            <div className="farm-card-title mt-3">Growing fit</div>
            <div className="farm-scroll-x">
              <table className="farm-table compact">
                <thead>
                  <tr><th>Variety</th><th>Family</th><th className="num">Share</th><th className="num">Seed per tray</th><th className="num">Soak</th><th className="num">Blackout</th><th className="num">To harvest</th><th className="num">Harvest per 1020</th><th>Own light regime</th></tr>
                </thead>
                <tbody>
                  {fit.map(({ s, v, t, toHarvest }) => (
                    <tr key={v.key}>
                      <td>{v.name}</td>
                      <td>{v.family}</td>
                      <td className="num">{num(s.share * 100, 0)}%</td>
                      <td className="num"><StatusBadge status={s.gramsPerTray.status} title={s.gramsPerTray.note} /> {num(s.gramsPerTray.value, 0)} g</td>
                      <td className="num"><StatusBadge status={t.soakHours.status} title={t.soakHours.note} /> {num(t.soakHours.value, 0)} h</td>
                      <td className="num">{t.stageDays.value.blackout} d</td>
                      <td className="num"><StatusBadge status={t.stageDays.status} title={t.stageDays.note} /> {toHarvest} d</td>
                      <td className="num"><StatusBadge status={t.harvestGramsPer1020.status} title={t.harvestGramsPer1020.note} /> {num(t.harvestGramsPer1020.value, 0)} g</td>
                      <td>{REGIME_BY_KEY[v.light.defaultRegime]?.name ?? v.light.defaultRegime}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="farm-kpi-sub mt-2">
              Days to harvest run {Math.min(...harvestDays)} to {Math.max(...harvestDays)} across the varieties, a spread of {Math.max(...harvestDays) - Math.min(...harvestDays)}.
              The plan runs on the slowest at each stage: {daysToHarvest(days)} days to harvest, {cycleDays(days)} on the shelf{def.harvestAsStated ? `; the document states ${def.harvestAsStated}` : ''}.
              {' '}{new Set(fit.map((f) => f.v.family)).size === 1 ? `All ${fit[0]!.v.family}.` : `Families: ${[...new Set(fit.map((f) => f.v.family))].join(', ')}.`}
            </p>

            <div className="farm-card-title mt-3">Nutrition targets</div>
            <div className="farm-scroll-x">
              <table className="farm-table compact">
                <thead>
                  <tr><th>Target</th><th>Carried by</th><th>Stated benefits</th></tr>
                </thead>
                <tbody>
                  {targets.map(({ t, by }) => {
                    const benefits = by.flatMap((f) => benefitsFor(f.v, t).map((b) => ({ v: f.v, b })));
                    return (
                      <tr key={t.key}>
                        <td>{t.name}</td>
                        <td>{by.map((f) => f.v.name).join(', ')}</td>
                        <td className="farm-kpi-sub">{benefits.length ? benefits.map(({ v, b }, i) => <div key={i}>{v.name}: {b.statement} <span>({b.evidence}; rows {b.rows.join(', ')})</span></div>) : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="farm-kpi-sub mt-2">{targets.length} targets across {keys.size} varieties; {targets.filter((x) => x.by.length > 1).length} carried by more than one.</p>

            {score && (
              <>
                <div className="farm-card-title mt-3">Against the chosen targets</div>
                <div className="farm-scroll-x">
                  <table className="farm-table compact">
                    <thead>
                      <tr><th>Target</th><th>Carried by</th><th>Stated benefits</th><th>Carried elsewhere by</th></tr>
                    </thead>
                    <tbody>
                      {score.targets.map((c) => (
                        <tr key={c.target.key} className={c.covered ? '' : 'farm-c-accent'}>
                          <td>{c.target.name}</td>
                          <td>{c.covered ? c.by.map((b) => b.variety.name).join(', ') : 'no variety on the blend'}</td>
                          <td className="farm-kpi-sub">{c.by.some((b) => b.benefits.length) ? c.by.flatMap((b) => b.benefits.map((x, i) => <div key={`${b.variety.key}-${i}`}>{b.variety.name}: {x.statement} <span>({x.evidence}; rows {x.rows.join(', ')})</span></div>)) : '—'}</td>
                          <td className="farm-kpi-sub">{c.covered ? '' : carriedElsewhere(c.carriedBy)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="farm-kpi-sub mt-2">{score.covered} of {chosen.length} chosen targets carried by {plan.name}; {score.uncovered} not.</p>
              </>
            )}

            {def.methods.length > 0 && (
              <>
                <div className="farm-card-title mt-3">Methods by hand</div>
                <ul className="list-disc pl-5">
                  {def.methods.map((m, i) => <li key={i}>{m}</li>)}
                </ul>
              </>
            )}
          </Card>
        );
      })}
    </>
  );
}

/** The library plans carrying a target a blend does not: the other blends, then the plans of one variety. */
function carriedElsewhere(plans: { code: string; name: string }[]): string {
  const blends = plans.filter((p) => p.code.startsWith(`${BLEND_CODE_PREFIX}-`)).map((p) => p.code);
  const others = plans.filter((p) => !p.code.startsWith(`${BLEND_CODE_PREFIX}-`)).map((p) => `${p.code} ${p.name}`);
  return [blends.length ? `Blends: ${blends.join(', ')}` : '', others.length ? `Plans: ${others.join(', ')}` : ''].filter(Boolean).join('. ') || 'nothing in the library';
}
