import Link from 'next/link';
import { Card, StatusBadge, num } from '@/components/ui';
import type { MeasuredRow } from '@/engine/measured-consumption';

const METHOD_LABELS = { mist: 'Mist', bottom: 'Bottom water', rinse: 'Jar rinse' } as const;
const diff = (measured: number, before: number, dp: number) => {
  const d = measured - before;
  return `${d >= 0 ? '+' : '−'}${num(Math.abs(d), dp)}`;
};

/**
 * What the approved time studies measured, per grow plan, beside what the plan was costed at before
 * them. The measured figures are the plan's standard from the approval date; a sowing sown before
 * it keeps the standard it was sown at.
 */
export function MeasuredConsumptionCard({ rows, names }: { rows: MeasuredRow[]; names: Record<string, string> }) {
  return (
    <Card title="Measured on approved time studies" className="mt-4">
      {rows.length === 0 ? (
        <p className="farm-kpi-sub">No time study is approved yet. A study is recorded and approved on <Link className="farm-link" href="/farm/time-studies">Time Studies</Link>; its labor, water and supplements show here from the approval.</p>
      ) : (
        <>
          <div className="farm-scroll-x">
            <table className="farm-table compact">
              <thead>
                <tr><th>Grow plan</th><th>Measure</th><th className="num">Measured</th><th className="num">Before the studies</th><th className="num">Difference</th></tr>
              </thead>
              <tbody>
                {rows.flatMap((r) => {
                  const sub = `${num(r.approved)} approved ${r.approved === 1 ? 'study' : 'studies'}${r.measured ? `; ${num(r.measured.trays)} trays measured through ${r.measured.approvedThrough}` : '; no water or supplement recorded'}`;
                  const lines = [
                    <tr key={`${r.code}:labor`}>
                      <td><span className="farm-mono">{r.code}</span> {r.name}<div className="farm-kpi-sub">{sub}</div></td>
                      <td>Labor minutes per tray</td>
                      <td className="num">{num(r.laborMinutesPerTray, 2)}</td>
                      <td className="num">{r.estimateMinutesPerTray === null ? '—' : <><StatusBadge status="PLACEHOLDER" title="The estimated study" /> {num(r.estimateMinutesPerTray, 2)}</>}</td>
                      <td className="num">{r.estimateMinutesPerTray === null ? '—' : diff(r.laborMinutesPerTray, r.estimateMinutesPerTray, 2)}</td>
                    </tr>,
                    <tr key={`${r.code}:water`}>
                      <td />
                      <td>Water per tray over the cycle, fl oz</td>
                      <td className="num">{r.waterOzPerTray.measured === null ? '—' : num(r.waterOzPerTray.measured, 1)}</td>
                      <td className="num"><StatusBadge status="PLACEHOLDER" title="The stage schedule's volumes per watering" /> {num(r.waterOzPerTray.before, 1)}</td>
                      <td className="num">{r.waterOzPerTray.measured === null ? '—' : diff(r.waterOzPerTray.measured, r.waterOzPerTray.before, 1)}</td>
                    </tr>,
                    ...r.perWatering.map((w) => (
                      <tr key={`${r.code}:${w.method}`}>
                        <td />
                        <td>{METHOD_LABELS[w.method]}, fl oz per tray per watering</td>
                        <td className="num">{w.measured === null ? '—' : num(w.measured, 1)}</td>
                        <td className="num"><StatusBadge status={w.beforeStatus} /> {num(w.before, 1)}</td>
                        <td className="num">{w.measured === null ? '—' : diff(w.measured, w.before, 1)}</td>
                      </tr>
                    )),
                    ...r.supplements.map((x) => (
                      <tr key={`${r.code}:${x.key}`}>
                        <td />
                        <td>{names[x.key] ?? x.key}, ml per tray{x.onPlan ? '' : <div className="farm-kpi-sub">Not on {r.code}&rsquo;s nutrient lines, so not in its cost</div>}</td>
                        <td className="num">{num(x.measuredMlPerTray, 2)}</td>
                        <td className="num">{x.beforeMlPerTray === null ? '—' : <><StatusBadge status="PLACEHOLDER" title="The line's strength over the placeholder volumes" /> {num(x.beforeMlPerTray, 2)}</>}</td>
                        <td className="num">{x.beforeMlPerTray === null ? '—' : diff(x.measuredMlPerTray, x.beforeMlPerTray, 2)}</td>
                      </tr>
                    )),
                  ];
                  return lines;
                })}
              </tbody>
            </table>
          </div>
          <p className="farm-kpi-sub mt-2">Each figure is the average of the plan&rsquo;s approved studies, weighted by the trays each studied; water and supplements over the studies that recorded any. From its approval date the average is the plan&rsquo;s standard, and each approval approves a standard version effective that day: sowings sown before it keep the standard they were sown at, and the difference is a variance.</p>
        </>
      )}
    </Card>
  );
}
