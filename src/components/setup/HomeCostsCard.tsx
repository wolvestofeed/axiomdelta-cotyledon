'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card, Kpi, StatusBadge, money, num, pct } from '@/components/ui';
import { EditableNumber } from '@/components/EditableNumber';
import { FIXED_COST_TREATMENT_LABELS, FIXED_COST_TREATMENT_NOTES, FIXED_COST_TREATMENTS, HOME_LINE_QUANTITY_UNITS, type FixedCostTreatment } from '@/data/finance';
import { ENERGY_RATE_PER_KWH } from '@/data/inputs-catalog';
import { costCarrier } from '@/engine/grow-plan-bridge';
import { createFixedCostLine, deleteFixedCostLine } from '@/server/finance-actions';
import { useScenario } from '@/state/scenario-store';

/**
 * The home grow room's running costs: the grow room's share of the household's residential
 * services, by floor area unless a line states its own share, and the business's own bills. The
 * grow lights' electricity is on each plan's cost card, in the cost of every tray; it is shown here
 * from there and is no fixed cost.
 */
export function HomeCostsCard({ className }: { className?: string }) {
  const { resolved, setFixedCostLine, setCapexFinance, isSuperAdmin } = useScenario();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [newLine, setNewLine] = useState('');
  const [newTreatment, setNewTreatment] = useState<FixedCostTreatment>('manufacturing_overhead');
  const run = (fn: () => Promise<{ ok: true } | { ok: false; error: string }>, after: () => void) =>
    start(async () => {
      const res = await fn();
      if (res.ok) {
        setErr(null);
        after();
        router.refresh();
      } else setErr(res.error);
    });

  const { homeSqFt, growRoomSqFt, share } = resolved.home;
  const lines = resolved.fixedCostLines.filter((l) => l.setting === 'home');
  const monthly = lines.reduce((s, l) => s + l.monthlyAmountCents / 100, 0);
  // The grow lights, from each in-service plan's cost card.
  const light = useMemo(() => {
    const cards = resolved.cropPlans.filter((r) => r.status === 'in_service').map((r) => costCarrier(r));
    const perTray = cards.map((c) => c.perTray.light);
    const fixtures = [...new Set(cards.map((c) => `${c.fixture.name}, ${c.fixture.watts.value} W`))];
    return { min: perTray.length ? Math.min(...perTray) : 0, max: perTray.length ? Math.max(...perTray) : 0, plans: cards.length, fixtures };
  }, [resolved.cropPlans]);

  return (
    <Card title="Home running costs" className={className}>
      <div className="grid gap-3 farm-autofit-11">
        <Kpi value={share === null ? '—' : pct(share, 1)} label="Grow room's share of the home" sub={share === null ? 'Enter both floor areas' : `${num(growRoomSqFt ?? 0)} of ${num(homeSqFt ?? 0)} sq ft`} />
        <Kpi value={money(monthly, 0)} label="A month, to the business" sub={`${money(monthly * 12, 0)} a year`} />
      </div>
      <table className="farm-table mt-3">
        <tbody>
          <tr>
            <td>Home floor area</td>
            <td className="num"><EditableNumber value={homeSqFt ?? 0} onChange={(v) => setCapexFinance('homeSqFt', v > 0 ? v : undefined)} step={50} min={0} suffix="sq ft" ariaLabel="Home floor area" showBadge={false} /></td>
          </tr>
          <tr>
            <td>Grow room floor area</td>
            <td className="num"><EditableNumber value={growRoomSqFt ?? 0} onChange={(v) => setCapexFinance('growRoomSqFt', v > 0 ? v : undefined)} step={10} min={0} suffix="sq ft" ariaLabel="Grow room floor area" showBadge={false} /></td>
          </tr>
        </tbody>
      </table>

      <div className="farm-scroll-x mt-3">
        <table className="farm-table">
          <thead>
            <tr><th>Line</th><th className="num">Household bill a month</th><th className="num">Household quantity</th><th className="num">Share</th><th className="num">To the business a month</th><th>Treatment</th>{isSuperAdmin ? <th /> : null}</tr>
          </thead>
          <tbody>
            {lines.map((l) => {
              const unit = HOME_LINE_QUANTITY_UNITS[l.key];
              const stated = l.allocationShare != null;
              return (
                <tr key={l.key}>
                  <td className="font-medium!">{l.label}{l.notes ? <div className="farm-kpi-sub farm-fs-2xs">{l.notes}</div> : null}</td>
                  <td className="num"><EditableNumber value={(l.householdAmountCents ?? 0) / 100} onChange={(v) => setFixedCostLine(l.key, { householdAmountCents: Math.round(v * 100) })} step={10} prefix="$" ariaLabel={`${l.label} household bill a month`} showBadge={false} /></td>
                  <td className="num">
                    {unit ? (
                      <>
                        <EditableNumber value={l.householdQuantity ?? 0} onChange={(v) => setFixedCostLine(l.key, { householdQuantity: v > 0 ? v : null })} step={100} suffix={`${unit} / month`} ariaLabel={`${l.label} household quantity`} showBadge={false} />
                        {l.householdQuantity != null && l.allocatedShare != null ? <div className="farm-kpi-sub farm-fs-2xs">{num(l.householdQuantity * l.allocatedShare)} {unit} to the grow room</div> : null}
                      </>
                    ) : '—'}
                  </td>
                  <td className="num">
                    <span className="inline-flex items-center gap-2">
                      <EditableNumber value={(l.allocatedShare ?? 0) * 100} onChange={(v) => setFixedCostLine(l.key, { allocationShare: Math.min(1, Math.max(0, v / 100)) })} step={1} suffix="%" ariaLabel={`${l.label} share`} showBadge={false} />
                      <StatusBadge status={stated ? 'STATED' : 'DERIVED'} title={stated ? 'The share this forecast states for the line' : l.treatment === 'general_admin' ? "The business's own bill: all of it" : 'The floor-area share'} />
                    </span>
                    {stated ? <div><button type="button" className="farm-btn farm-fs-2xs mt-1" onClick={() => setFixedCostLine(l.key, { allocationShare: null })}>Use the {l.treatment === 'general_admin' ? 'whole bill' : 'floor-area share'}</button></div> : null}
                  </td>
                  <td className="num">{money(l.monthlyAmountCents / 100, 2)}</td>
                  <td title={FIXED_COST_TREATMENT_NOTES[l.treatment]} className="farm-c-soft farm-fs-sm">{FIXED_COST_TREATMENT_LABELS[l.treatment]}</td>
                  {isSuperAdmin ? (
                    <td>{l.id ? <button type="button" className="farm-btn farm-fs-2xs" disabled={pending} onClick={() => run(() => deleteFixedCostLine(l.id!), () => {})}>Remove</button> : null}</td>
                  ) : null}
                </tr>
              );
            })}
            <tr>
              <td className="font-medium!">
                Electricity, grow lights
                <div className="farm-kpi-sub farm-fs-2xs">From the cost card: each plan&rsquo;s light by the tray-day, at {money(ENERGY_RATE_PER_KWH.value, 4)}/kWh <StatusBadge status={ENERGY_RATE_PER_KWH.status} title={ENERGY_RATE_PER_KWH.note ?? ''} />{light.fixtures.length ? `, ${light.fixtures.join('; ')}` : ''}. It is in the cost of every tray, so it is no fixed cost here.</div>
              </td>
              <td className="num">—</td>
              <td className="num">—</td>
              <td className="num">—</td>
              <td className="num">{light.plans === 0 ? '—' : light.min === light.max ? `${money(light.min, 3)} a tray` : `${money(light.min, 3)}–${money(light.max, 3)} a tray`}</td>
              <td className="farm-c-soft farm-fs-sm">In the cost of a tray</td>
              {isSuperAdmin ? <td /> : null}
            </tr>
            <tr className="total"><td colSpan={4}>A month, to the business</td><td className="num">{money(monthly, 2)}</td><td />{isSuperAdmin ? <td /> : null}</tr>
          </tbody>
        </table>
      </div>
      {isSuperAdmin ? (
        <div className="flex gap-2 items-center mt-[0.7rem]! flex-wrap">
          <input className="farm-input w-64!" value={newLine} placeholder="Name another household bill or business cost" onChange={(e) => setNewLine(e.target.value)} aria-label="New home cost name" />
          <select className="farm-input farm-fs-xs" value={newTreatment} onChange={(e) => setNewTreatment(e.target.value as FixedCostTreatment)} aria-label="New home cost treatment">
            {FIXED_COST_TREATMENTS.map((t) => <option key={t} value={t}>{FIXED_COST_TREATMENT_LABELS[t]}</option>)}
          </select>
          <button type="button" className="farm-btn" disabled={pending || newLine.trim() === ''} onClick={() => run(() => createFixedCostLine({ label: newLine, category: 'other', setting: 'home', treatment: newTreatment, status: 'planned', monthlyAmountCents: 0 }), () => setNewLine(''))}>Add a line</button>
          {err ? <span className="farm-kpi-sub farm-c-over">{err}</span> : null}
        </div>
      ) : null}
      <p className="farm-kpi-sub mt-2">
        Each line is the household&rsquo;s bill and the grow room&rsquo;s share of it: the floor-area share unless the line states its own, such as the share of water you measure the grow room using. A general &amp; administrative line is the business&rsquo;s own bill, all of it unless a share is stated. The water line&rsquo;s gallons, at its share, are the metered water on{' '}
        <Link className="farm-link" href="/farm/sustainability/water">Sustainability · Water</Link>. Manufacturing overhead absorbs into the cost of a tray on normal capacity; general &amp; administrative stays in the period. Every figure is this forecast&rsquo;s.
      </p>
    </Card>
  );
}
