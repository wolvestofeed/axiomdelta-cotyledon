import { Card, StatusBadge, money, num } from '@/components/ui';
import { rollingCostSource, rollingWindowFrom, type RollingCost } from '@/engine/seed-cost';

/** One row of the card: an input, the name it is received under and its rolling average, if any. */
export interface RollingAverageItem {
  name: string;
  unitWord: string;
  cost: RollingCost | undefined;
}

/**
 * The rolling 12-month average as a key figure (`accounting-policy.md` §10): the dollars over the
 * quantity on the accepted receipt lines of the twelve months to `asOf`, per input, in the unit it
 * is received in. Shown beside the item; no plan, order or posting uses it.
 */
export function RollingAverageCard({ items, asOf, what }: { items: readonly RollingAverageItem[]; asOf: string; what: string }) {
  const from = rollingWindowFrom(asOf);
  const received = items.filter((i) => i.cost);
  return (
    <Card title="Rolling 12-month average" className="mt-4">
      {received.length === 0 ? (
        <p className="farm-kpi-sub">No {what} received from {from} to {asOf}. Each average opens with the item&rsquo;s first receipt.</p>
      ) : (
        <div className="farm-scroll-x">
          <table className="farm-table compact">
            <thead>
              <tr><th>Item</th><th className="num">Average</th><th className="num">Receipt lines</th><th className="num">Received</th><th>First and last receipt</th></tr>
            </thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.name} className={i.cost ? undefined : 'faint'}>
                  <td>{i.name}</td>
                  <td className="num">{i.cost ? <><StatusBadge status="DERIVED" title={rollingCostSource(i.cost, i.unitWord)} /> {money(i.cost.perUnit, i.unitWord === 'ml' ? 4 : 2)} / {i.unitWord}</> : '—'}</td>
                  <td className="num">{i.cost ? num(i.cost.receipts) : '—'}</td>
                  <td className="num">{i.cost ? `${num(i.cost.qty, 2)} ${i.unitWord}` : '—'}</td>
                  <td>{i.cost ? (i.cost.from === i.cost.to ? i.cost.from : `${i.cost.from} to ${i.cost.to}`) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="farm-kpi-sub mt-2">Dollars over the quantity on the accepted receipt lines dated {from} to {asOf}, rejected lines left out. A key figure: no plan, purchase order or posting uses it.</p>
    </Card>
  );
}
