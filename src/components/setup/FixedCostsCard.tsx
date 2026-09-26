'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Card, money } from '@/components/ui';
import { EditableNumber } from '@/components/EditableNumber';
import { EQUIPMENT_SETTING_LABELS, type EquipmentSetting } from '@/data/capex';
import { FIXED_COST_STATUSES, FIXED_COST_STATUS_LABELS, FIXED_COST_TREATMENT_LABELS, FIXED_COST_TREATMENT_NOTES, type FixedCostStatus } from '@/data/finance';
import { createFixedCostLine, deleteFixedCostLine } from '@/server/finance-actions';
import { useScenario } from '@/state/scenario-store';

/** The monthly fixed-cost lines, for one setting (home or commercial) or all of them. A new line takes the setting shown. */
export function FixedCostsCard({ setting, title = 'Monthly fixed costs', className }: { setting?: EquipmentSetting; title?: string; className?: string }) {
  const { resolved, setFixedCostLine, isSuperAdmin } = useScenario();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const run = (fn: () => Promise<{ ok: true } | { ok: false; error: string }>, after: () => void) =>
    start(async () => {
      const res = await fn();
      if (res.ok) {
        setErr(null);
        after();
        router.refresh();
      } else setErr(res.error);
    });
  const [newLine, setNewLine] = useState('');
  const lines = setting ? resolved.fixedCostLines.filter((l) => l.setting === setting) : resolved.fixedCostLines;
  const fixedMonthly = lines.reduce((s, l) => s + l.monthlyAmountCents / 100, 0);
  return (
      <Card title={title} className={className}>
          <div className="farm-scroll-x">
            <table className="farm-table">
              <thead>
                <tr><th>Line</th><th>Status</th><th>Treatment</th><th className="num">Monthly</th><th className="num">Annual</th>{isSuperAdmin ? <th /> : null}</tr>
              </thead>
              <tbody>
                {lines.length === 0 ? <tr><td colSpan={isSuperAdmin ? 6 : 5} className="farm-c-soft">No fixed cost entered.</td></tr> : null}
                {lines.map((l) => (
                  <tr key={l.key}>
                    <td className="font-medium!">
                      {l.label}
                      {setting ? null : <span className="farm-kpi-sub farm-fs-2xs"> · {EQUIPMENT_SETTING_LABELS[l.setting]}</span>}
                      {l.notes ? <div className="farm-kpi-sub farm-fs-2xs">{l.notes}</div> : null}
                    </td>
                    <td>
                      <select
                        className="farm-input farm-fs-xs"
                        value={l.status}
                        onChange={(e) => setFixedCostLine(l.key, { status: e.target.value as FixedCostStatus })}
                        aria-label={`${l.label} status`}
                      >
                        {FIXED_COST_STATUSES.map((k) => <option key={k} value={k}>{FIXED_COST_STATUS_LABELS[k]}</option>)}
                      </select>
                    </td>
                    <td title={FIXED_COST_TREATMENT_NOTES[l.treatment]} className="farm-c-soft farm-fs-sm">
                      {FIXED_COST_TREATMENT_LABELS[l.treatment]}
                    </td>
                    <td className="num">
                      <EditableNumber
                        value={l.monthlyAmountCents / 100}
                        onChange={(v) => setFixedCostLine(l.key, { monthlyAmountCents: Math.round(v * 100) })}
                        step={100}
                        prefix="$"
                        ariaLabel={`${l.label} monthly amount`}
                        showBadge={false}
                      />
                    </td>
                    <td className="num">{money((l.monthlyAmountCents / 100) * 12, 0)}</td>
                    {isSuperAdmin ? (
                      <td>
                        {l.id ? (
                          <button
                            type="button"
                            className="farm-btn farm-fs-2xs"
                            disabled={pending}
                            onClick={() => run(() => deleteFixedCostLine(l.id!), () => {})}
                          >
                            Remove
                          </button>
                        ) : null}
                      </td>
                    ) : null}
                  </tr>
                ))}
                <tr className="total"><td colSpan={3}>Total monthly, before financing</td><td className="num">{money(fixedMonthly, 0)}</td><td className="num">{money(fixedMonthly * 12, 0)}</td>{isSuperAdmin ? <td /> : null}</tr>
              </tbody>
            </table>
          </div>
          {isSuperAdmin ? (
            <div className="flex gap-2 items-center mt-[0.7rem]! flex-wrap">
              <input
                className="farm-input w-64!"
                value={newLine}
                placeholder="Name another fixed cost"
                onChange={(e) => setNewLine(e.target.value)}
                aria-label="New fixed cost name"
              />
              <button
                type="button"
                className="farm-btn"
                disabled={pending || newLine.trim() === ''}
                onClick={() =>
                  run(
                    // A new line is G&A until someone states otherwise: the
                    // treatment that keeps it OUT of inventory is the safe default.
                    () => createFixedCostLine({ label: newLine, category: 'other', setting: setting ?? 'commercial', treatment: 'general_admin', status: 'planned', monthlyAmountCents: 0 }),
                    () => setNewLine(''),
                  )
                }
              >
                Add a fixed cost
              </button>
              {err ? <span className="farm-kpi-sub farm-c-over">{err}</span> : null}
            </div>
          ) : null}
          <p className="farm-kpi-sub mt-2">
            Treatment is the accounting fact, not the label: manufacturing overhead absorbs into
            inventory on normal capacity (ASC 330-10-30-1/-3), and general &amp; administrative is a
            period cost that ASC 330-10-30-8 keeps out of it. A line is Planned until a signed lease or
            an open account puts it In force.
          </p>
        </Card>
  );
}
