'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Card, Kpi, StatusBadge, num } from '@/components/ui';
import { InlineNumber, InlineText } from '@/components/InlineCells';
import { FACILITY_ZONES, FOOTPRINT_BASIS_LABELS, footprintTag, zoneFactorOf, type FacilityZone, type FootprintBasis } from '@/data/facility-design';
import { equipmentEnvelope, rowsThroughPhase, type FacilityRow, type GrossMethod } from '@/engine/facility';
import { updateEquipment } from '@/server/equipment-actions';
import type { FacilityView } from '@/app/(farm)/farm/sustainability/facility/facility-view';

const METHOD_LABEL: Record<GrossMethod, string> = { zone_factor: 'Zone factor', published_clearance: 'Published clearances', walk_in: 'Box + apron', none: 'No floor' };
const f1 = (v: number | null) => (v === null ? '—' : v.toFixed(2));

interface Patch {
  footprintWidthIn?: number | null;
  footprintDepthIn?: number | null;
  clearanceFrontIn?: number | null;
  clearanceRearIn?: number | null;
  clearanceSideIn?: number | null;
  footprintBasis?: FootprintBasis;
  zone?: FacilityZone | null;
  underHood?: boolean;
  footprintSource?: string | null;
  manufacturer?: string | null;
  model?: string | null;
  specSheetUrl?: string | null;
}

/**
 * Footprints: each unit's plan area and clearances as open fields on the
 * equipment library (Roadmap Q1), edited here rather than on Equipment because
 * this is where the number they move is shown. A sourced footprint comes off
 * a named model's spec sheet; an estimated one is category-typical and a
 * placeholder until stated or observed.
 */
export function FacilityFootprintsTab({ view }: { view: FacilityView }) {
  const { rows, lines, canEdit } = view;
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const idOf = useMemo(() => new Map(lines.map((l) => [l.key, l.id])), [lines]);
  const counted = rows.filter((r) => r.counted);
  const withFloor = counted.filter((r) => r.unitSqFt !== null);
  const sourcedShare = withFloor.length ? withFloor.filter((r) => r.basis === 'sourced').reduce((s, r) => s + r.lineSqFt, 0) / withFloor.reduce((s, r) => s + r.lineSqFt, 0) : 0;
  const ordered = useMemo(() => [...rows].sort((a, b) => a.phase - b.phase || Number(a.unitSqFt === null) - Number(b.unitSqFt === null) || (a.zone ?? 'zz').localeCompare(b.zone ?? 'zz')), [rows]);

  const save = (row: FacilityRow, patch: Patch) => {
    const id = idOf.get(row.key);
    if (!id || !canEdit) return;
    start(async () => {
      const r = await updateEquipment({ id, ...patch });
      if (!r.ok) setError(r.error);
      else {
        setError(null);
        router.refresh();
      }
    });
  };
  const editable = canEdit && !pending;

  return (
    <>
      <div className="grid gap-3 farm-autofit-11">
        <Kpi value={num(withFloor.length)} label="Rows with floor" sub={`of ${num(counted.length)} counted rows; the rest are bench-mounted, shelved, overhead or vehicles`} />
        <Kpi value={num(withFloor.filter((r) => r.basis === 'sourced').length)} label="Sourced to a spec sheet" sub={`carrying ${(sourcedShare * 100).toFixed(0)}% of the envelope`} />
        <Kpi value={`${num(Math.round(equipmentEnvelope(rowsThroughPhase(rows, 1))))} sq ft`} label="Phase 1 envelope" sub="Plan area only, no aisle, warewash excluded" />
        <Kpi value={`${num(Math.round(equipmentEnvelope(rowsThroughPhase(rows, 3))))} sq ft`} label="Full-build envelope" sub="Cumulative through Phase 3" />
      </div>

      <Card title="Footprints and clearances, every row of the library" className="mt-4">
        {pending && <p className="farm-kpi-sub">Saving…</p>}
        {error && <p className="farm-kpi-sub farm-c-accent mb-2!">{error}</p>}
        <div className="farm-scroll-x">
          <table className="farm-table compact">
            <thead>
              <tr>
                <th>Item</th>
                <th>Ph</th>
                <th className="num">Qty</th>
                <th>Zone</th>
                <th className="num">Width in</th>
                <th className="num">Depth in</th>
                <th className="num">Unit sq ft</th>
                <th className="num">Line sq ft</th>
                <th className="num">Front in</th>
                <th className="num">Rear in</th>
                <th className="num">Side in</th>
                <th>Gross by</th>
                <th className="num">Unit gross</th>
                <th>Hood</th>
                <th>Basis</th>
                <th>Manufacturer</th>
                <th>Model</th>
                <th>Spec sheet</th>
                <th>Source</th>
              </tr>
            </thead>
            <tbody>
              {ordered.map((r) => {
                const rowEditable = editable && idOf.has(r.key);
                const zf = r.zone && r.zone !== 'Walk-in' ? zoneFactorOf(r.zone) : null;
                return (
                  <tr key={r.key} className={`${r.counted ? '' : 'farm-c-soft'}`}>
                    <td className="font-medium! min-w-52! max-w-80!">
                      {r.item}
                      {!r.counted && <div className="farm-c-faint farm-fs-xs">Not counted: {r.status === 'no' ? 'not selected' : r.status === 'unset' ? 'not needed' : 'no quantity'}</div>}
                    </td>
                    <td>{r.phase}</td>
                    <td className="num">{num(r.qty)}</td>
                    <td>
                      <select className="farm-input farm-cell-control w-34!" value={r.zone ?? ''} disabled={!rowEditable} aria-label={`${r.item} zone`} onChange={(ev) => save(r, { zone: ev.target.value ? (ev.target.value as FacilityZone) : null })}>
                        <option value="">No floor</option>
                        {FACILITY_ZONES.map((z) => <option key={z} value={z}>{z}</option>)}
                      </select>
                    </td>
                    <td className="num"><InlineNumber value={r.widthIn} step={1} nullable disabled={!rowEditable} label={`${r.item} width in inches`} onCommit={(n) => save(r, { footprintWidthIn: n })} /></td>
                    <td className="num"><InlineNumber value={r.depthIn} step={1} nullable disabled={!rowEditable} label={`${r.item} depth in inches`} onCommit={(n) => save(r, { footprintDepthIn: n })} /></td>
                    <td className="num">{f1(r.unitSqFt)}</td>
                    <td className="num">{r.unitSqFt === null ? '—' : r.lineSqFt.toFixed(2)}</td>
                    <td className="num"><InlineNumber value={r.clearance?.frontIn ?? null} step={6} nullable disabled={!rowEditable} label={`${r.item} front clearance`} onCommit={(n) => save(r, { clearanceFrontIn: n })} /></td>
                    <td className="num"><InlineNumber value={r.clearance?.rearIn ?? null} step={6} nullable disabled={!rowEditable} label={`${r.item} rear clearance`} onCommit={(n) => save(r, { clearanceRearIn: n })} /></td>
                    <td className="num"><InlineNumber value={r.clearance?.sideIn ?? null} step={6} nullable disabled={!rowEditable} label={`${r.item} side clearance`} onCommit={(n) => save(r, { clearanceSideIn: n })} /></td>
                    <td>
                      {METHOD_LABEL[r.method]}
                      {zf && r.method === 'zone_factor' && <div className="farm-c-faint farm-fs-xs">× {zf.factor}{zf.aisleIn ? ` · ${zf.aisleIn} in aisle` : ''}</div>}
                    </td>
                    <td className="num">{f1(r.unitGrossSqFt)}</td>
                    <td>
                      <select className="farm-input farm-cell-control w-18!" value={r.underHood ? 'yes' : 'no'} disabled={!rowEditable} aria-label={`${r.item} under hood`} onChange={(ev) => save(r, { underHood: ev.target.value === 'yes' })}>
                        <option value="no">—</option>
                        <option value="yes">Yes</option>
                      </select>
                    </td>
                    <td>
                      <span className="inline-flex gap-[0.35rem] items-center">
                        <select className="farm-input farm-cell-control w-29!" value={r.basis} disabled={!rowEditable} aria-label={`${r.item} footprint basis`} onChange={(ev) => save(r, { footprintBasis: ev.target.value as FootprintBasis })}>
                          {(Object.keys(FOOTPRINT_BASIS_LABELS) as FootprintBasis[]).map((b) => <option key={b} value={b}>{FOOTPRINT_BASIS_LABELS[b]}</option>)}
                        </select>
                        <StatusBadge status={footprintTag(r.basis)} title={r.source ?? FOOTPRINT_BASIS_LABELS[r.basis]} />
                      </span>
                    </td>
                    <td><InlineText value={r.manufacturer} minChars={10} disabled={!rowEditable} label={`${r.item} manufacturer`} onCommit={(s) => save(r, { manufacturer: s })} /></td>
                    <td><InlineText value={r.model} minChars={10} disabled={!rowEditable} label={`${r.item} model`} onCommit={(s) => save(r, { model: s })} /></td>
                    <td>
                      <span className="inline-flex gap-[0.35rem] items-center">
                        <InlineText value={r.specSheetUrl} minChars={12} disabled={!rowEditable} label={`${r.item} spec sheet URL`} placeholder="https://" onCommit={(s) => save(r, { specSheetUrl: s })} />
                        {r.specSheetUrl && <a className="farm-link" href={r.specSheetUrl} target="_blank" rel="noreferrer">Open</a>}
                      </span>
                    </td>
                    <td className="min-w-64!">
                      <InlineText value={r.source} minChars={24} disabled={!rowEditable} label={`${r.item} footprint source`} placeholder="Spec sheet, or why no floor" onCommit={(s) => save(r, { footprintSource: s })} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="farm-kpi-sub mt-2">
          Width is along the front. A walk-in&rsquo;s width is its door wall and its box is grossed as nominal + 2 in panel clearance + a 6 ft apron. Clearances are entered only where a manufacturer publishes them; a unit with any clearance is grossed by them directly and the zone factor does not apply. A row with no zone carries no floor and its source says why. Rows not counted (No, not needed, or no quantity) are shown and derive nothing. Manufacturer and model are the representative units the footprint is read from, not selected equipment; the unit costs on Equipment are working figures and are not tied to them. Edited on this page; Equipment carries the same row.
          {!canEdit && ' Editing is limited to admins.'}
        </p>
      </Card>
    </>
  );
}
