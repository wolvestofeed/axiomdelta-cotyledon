'use client';

import { Fragment, useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card, Kpi, StatusBadge, money, num } from '@/components/ui';
import { InlineNumber } from '@/components/InlineCells';
import { SOWING_CAPACITY_BASIS_LABELS, EQUIPMENT_CATEGORIES, EQUIPMENT_SETTING_LABELS, RESOURCE_SEED, type SowingCapacityBasis, type EquipmentCategory, type EquipmentSetting, type EquipmentStatus } from '@/data/capex';
import { EQUIPMENT_STATUSES, EQUIPMENT_STATUS_LABELS, countsTowardCapital, equipmentLibraryOrder, filterEquipment } from '@/engine/equipment';
import { extendedCost } from '@/engine/fixed-costs';
import { lightsOn, traysPerUnit, type ShelfLight } from '@/engine/grow-capacity';
import { LIGHT_FIXTURES } from '@/data/inputs-catalog';
import { useScenario } from '@/state/scenario-store';
import { useOperationsWorld } from '@/state/ledger';
import { createEquipment, updateEquipment } from '@/server/equipment-actions';

interface EquipmentPatch {
  status?: EquipmentStatus;
  buildPhase?: number;
  inServiceDate?: string | null;
  newUsed?: 'New' | 'Used';
  qty?: number;
  unitCostCents?: number;
  shelves?: number | null;
  shelfWidthIn?: number | null;
  fixtureKey?: string | null;
  darkStagesOnly?: boolean;
  shelfLights?: ShelfLight[] | null;
  sowingCapacityLb?: number | null;
  sowingCapacityBasis?: SowingCapacityBasis;
  concurrentSowings?: number | null;
  changeoverMinutes?: number | null;
  attendedRun?: boolean | null;
  mayRunUnattended?: boolean | null;
  resourceBasis?: SowingCapacityBasis;
}

/** Columns in an open category: item, status, phase, service date, in the open forecast (Plan only), new/used, qty, unit, extended, critical, the grow-unit fields (shelves, shelf width, fixture, 1020 flats), sowing lb a run, basis, then the resource attributes and their basis. */
const COLS = 21;
const yesNo = (v: boolean | null | undefined) => (v === true ? 'yes' : v === false ? 'no' : '');
const fromYesNo = (v: string): boolean | null => (v === 'yes' ? true : v === 'no' ? false : null);
/** An estimated figure is a placeholder until someone states or observes it. */
const basisTag = (b: SowingCapacityBasis | undefined) => (b === 'stated' || b === 'observed' ? 'STATED' : 'PLACEHOLDER');

/** The equipment library for one setting: the home grow room's list, or a commercial facility's. */
/** The fixture select's value for a dark rack: unlit, holding trays through germination and blackout only. */
const DARK = '__dark';

export function EquipmentClient({ canEdit, setting }: { canEdit: boolean; setting: EquipmentSetting }) {
  const { resolved, setForecast } = useScenario();
  // The master list edits in both worlds; the open forecast's column is on Plan only (Roadmap N6 slice 3).
  const { forecastEditing } = useOperationsWorld({});
  const cols = forecastEditing ? COLS : COLS - 1;
  const dated = useMemo(() => new Map(resolved.datedEquipment.map((d) => [d.key, d])), [resolved.datedEquipment]);
  const setForecastEquipment = (key: string, patch: { status?: EquipmentStatus; inServiceDate?: string | null } | undefined) =>
    setForecast((d) => {
      const all = (d.equipment ??= {});
      if (patch === undefined) delete all[key];
      else all[key] = { ...all[key], ...patch };
      if (Object.keys(all).length === 0) delete d.equipment;
    });
  const basisText: Record<string, string> = {
    in_service: 'in service; at the forecast start it is owned and contributed, no cash paid',
    dated: 'from its date',
    phase_one_at_start: 'Phase 1: from the forecast start',
    undated: 'not until dated',
    not_selected: 'not selected',
  };
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [shown, setShown] = useState<Set<EquipmentStatus>>(() => new Set(EQUIPMENT_STATUSES));
  const [draft, setDraft] = useState<{ item: string; category: EquipmentCategory; buildPhase: number }>({ item: '', category: EQUIPMENT_CATEGORIES[0], buildPhase: 1 });

  const fp = resolved.equipmentPurchase;
  const lines = useMemo(() => resolved.equipment.filter((l) => l.setting === setting), [resolved.equipment, setting]);
  // What the open forecast counts: its own status for a line where it sets one.
  const counted = lines.filter((l) => countsTowardCapital(dated.get(l.key)?.status ?? l.status));
  const carried = (phase?: 1 | 2 | 3) => counted.filter((l) => phase === undefined || l.phase === phase).reduce((s, l) => s + extendedCost(l, fp), 0);
  const noPrice = lines.filter((l) => l.qty > 0 && l.unitCostNew <= 0).length;
  const rows = useMemo(() => equipmentLibraryOrder(filterEquipment(lines, shown)), [lines, shown]);
  // One category open at a time; all collapsed by default.
  const [open, setOpen] = useState<EquipmentCategory | null>(null);
  // The row whose lights are open shelf by shelf.
  const [byShelf, setByShelf] = useState<string | null>(null);
  const groups = useMemo(
    () =>
      EQUIPMENT_CATEGORIES.map((category) => ({ category, rows: rows.filter((r) => r.category === category) })).filter((g) => g.rows.length > 0),
    [rows],
  );
  const inService = lines.filter((l) => l.status === 'in_service').reduce((s, l) => s + extendedCost(l, fp), 0);
  const noQty = lines.filter((l) => l.qty <= 0).length;
  const count = (s: EquipmentStatus) => lines.filter((l) => l.status === s).length;

  const toggle = (s: EquipmentStatus) =>
    setShown((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });

  const save = (id: string | undefined, patch: EquipmentPatch) => {
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

  const add = () => {
    if (!draft.item.trim()) return;
    start(async () => {
      const r = await createEquipment({ ...draft, setting });
      if (!r.ok) setError(r.error);
      else {
        setError(null);
        setDraft((d) => ({ ...d, item: '' }));
        router.refresh();
      }
    });
  };

  const editable = canEdit && !pending;

  return (
    <>
      <div className="grid gap-3 farm-autofit-11">
        <Kpi value={money(carried(), 0)} label="Carried in capital" sub={`${num(counted.length)} of ${num(lines.length)} ${EQUIPMENT_SETTING_LABELS[setting].toLowerCase()} rows in the open forecast`} />
        <Kpi value={money(inService, 0)} label="In service" sub={`${num(count('in_service'))} rows`} />
        {setting === 'commercial' ? (
          <>
            <Kpi value={money(carried(1), 0)} label="Phase 1" sub="Counted in the open forecast" />
            <Kpi value={money(carried(2) + carried(3), 0)} label="Phases 2 and 3" sub="Counted in the open forecast" />
          </>
        ) : (
          <Kpi value={num(noPrice)} label="Rows with no price" sub="Quantity entered, unit cost not stated" />
        )}
        <Kpi value={num(noQty)} label="Rows with no quantity" sub="Listed last" />
      </div>

      <Card title={setting === 'home' ? 'Home equipment' : 'Commercial equipment'} className="mt-4">
        <div className="flex flex-wrap gap-[0.4rem] items-center mb-3!">
          <span className="farm-kpi-sub mr-1!">Show</span>
          {EQUIPMENT_STATUSES.map((s) => {
            const on = shown.has(s);
            return (
              <button
                key={s}
                type="button"
                className={`farm-btn ${on ? 'bg-[color:var(--farm-ink)]! text-[var(--farm-surface)]! border-[color:var(--farm-ink)]!' : ''}`}
                aria-pressed={on}
                onClick={() => toggle(s)}
              >
                {EQUIPMENT_STATUS_LABELS[s]} ({num(count(s))})
              </button>
            );
          })}
          {pending && <span className="farm-kpi-sub">Saving…</span>}
        </div>
        {error && <p className="farm-kpi-sub farm-c-accent mb-2!">{error}</p>}
        <div className="farm-scroll-x">
          <table className="farm-table compact">
            <thead>
              {open ? (
                <tr>
                  <th>Item</th>
                  <th>Status</th>
                  <th>Phase</th>
                  <th>Service date</th>
                  {forecastEditing && <th>In the open forecast</th>}
                  <th>New/Used</th>
                  <th className="num">Qty</th>
                  <th className="num">Unit (new)</th>
                  <th className="num">Extended</th>
                  <th>Critical</th>
                  <th className="num">Shelves</th>
                  <th className="num">Shelf <span className="farm-unit">in</span></th>
                  <th>Fixture</th>
                  <th className="num">1020 flats</th>
                  <th className="num">Sowing <span className="farm-unit">lb</span> / run</th>
                  <th>Capacity basis</th>
                  <th className="num">Sowings at once</th>
                  <th className="num">Changeover <span className="farm-unit">min</span></th>
                  <th>Attended run</th>
                  <th>May run unattended</th>
                  <th>Resource basis</th>
                </tr>
              ) : (
                <tr><th colSpan={cols}>Category</th></tr>
              )}
            </thead>
            <tbody>
              {groups.length === 0 && (
                <tr><td colSpan={cols} className="farm-c-soft">No rows with the selected status.</td></tr>
              )}
              {groups.map((g) => {
                const isOpen = open === g.category;
                const carried = g.rows.filter((r) => countsTowardCapital(r.status)).reduce((s, r) => s + extendedCost(r, fp), 0);
                return (
                <Fragment key={g.category}>
                  <tr className={`farm-group-row${isOpen ? ' is-open' : ''}`}>
                    <td colSpan={cols} className="p-0!">
                      <button type="button" className="farm-group-row-btn" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : g.category)}>
                        <span className="font-semibold farm-c-accent-hi">
                          {g.category}
                          <span className="farm-c-soft font-normal ml-[0.6rem]! farm-fs-xs">{num(g.rows.length)} {g.rows.length === 1 ? 'row' : 'rows'}</span>
                        </span>
                        <span className="inline-flex gap-4 items-baseline">
                          <span className="num farm-mono farm-fs-xs">{money(carried, 0)}</span>
                          <span className="farm-c-soft farm-fs-xs min-w-10 text-right">{isOpen ? 'Close' : 'Open'}</span>
                        </span>
                      </button>
                    </td>
                  </tr>
                  {isOpen && g.rows.map((e) => {
                const rowEditable = editable && !!e.id;
                return (
                  <tr key={e.key} className={`${countsTowardCapital(e.status) ? '' : 'farm-c-soft'}`}>
                    <td className="font-medium! min-w-52! max-w-88!">
                      {e.item}
                      {e.note ? <div className="farm-c-faint farm-fs-xs">{e.note}</div> : null}
                    </td>
                    <td>
                      <select className="farm-input farm-cell-control w-34!" value={e.status} disabled={!rowEditable} aria-label={`${e.item} status`} onChange={(ev) => save(e.id, { status: ev.target.value as EquipmentStatus })}>
                        {EQUIPMENT_STATUSES.map((s) => <option key={s} value={s}>{EQUIPMENT_STATUS_LABELS[s]}</option>)}
                      </select>
                    </td>
                    <td>
                      <select className="farm-input farm-cell-control w-17!" value={e.phase} disabled={!rowEditable} aria-label={`${e.item} build phase`} onChange={(ev) => save(e.id, { buildPhase: Number(ev.target.value) })}>
                        {[1, 2, 3].map((p) => <option key={p} value={p}>{p}</option>)}
                      </select>
                    </td>
                    <td>
                      <input type="date" className="farm-input farm-cell-control w-41!" value={e.inServiceDate ?? ''} disabled={!rowEditable} aria-label={`${e.item} service date`} onChange={(ev) => save(e.id, { inServiceDate: ev.target.value || null })} />
                      {!e.inServiceDate && <div className="farm-c-faint farm-fs-xs">TBD</div>}
                    </td>
                    {forecastEditing && <td>
                      {(() => {
                        const d = dated.get(e.key);
                        const o = resolved.forecast.equipment?.[e.key];
                        return (
                          <span className="inline-flex flex-col gap-[0.2rem]">
                            <span className="inline-flex gap-[0.3rem]">
                              <select className="farm-input farm-cell-control w-28!" value={o?.status ?? ''} aria-label={`${e.item} status in the open forecast`} onChange={(ev) => setForecastEquipment(e.key, ev.target.value ? { status: ev.target.value as EquipmentStatus } : o && 'inServiceDate' in o ? { status: undefined } : undefined)}>
                                <option value="">As record</option>
                                {EQUIPMENT_STATUSES.map((st) => <option key={st} value={st}>{EQUIPMENT_STATUS_LABELS[st]}</option>)}
                              </select>
                              <input type="date" className="farm-input farm-cell-control w-41!" value={o && 'inServiceDate' in o ? o.inServiceDate ?? '' : ''} aria-label={`${e.item} in-service date in the open forecast`} onChange={(ev) => setForecastEquipment(e.key, { inServiceDate: ev.target.value || null })} />
                            </span>
                            <span className="farm-c-faint farm-fs-xs">
                              {d?.inServiceFrom ? `counts from ${d.inServiceFrom}` : 'not in service'} · {basisText[d?.inServiceBasis ?? 'not_selected']}
                              {o && <button type="button" className="farm-btn py-0! px-[0.3rem]! ml-[0.3rem]!" onClick={() => setForecastEquipment(e.key, undefined)}>As record</button>}
                            </span>
                          </span>
                        );
                      })()}
                    </td>}
                    <td>
                      <select className="farm-input farm-cell-control w-23!" value={e.newUsed} disabled={!rowEditable} aria-label={`${e.item} new or used`} onChange={(ev) => save(e.id, { newUsed: ev.target.value === 'Used' ? 'Used' : 'New' })}>
                        <option value="New">New</option>
                        <option value="Used">Used</option>
                      </select>
                    </td>
                    <td className="num">
                      <InlineNumber value={e.qty} step={1} disabled={!rowEditable} label={`${e.item} quantity`} onCommit={(n) => n !== null && save(e.id, { qty: n })} />
                    </td>
                    <td className="num">
                      <InlineNumber value={e.unitCostNew} step={100} minChars={6} disabled={!rowEditable} label={`${e.item} unit cost`} onCommit={(n) => n !== null && save(e.id, { unitCostCents: Math.round(n * 100) })} />
                    </td>
                    <td className="num">{money(extendedCost(e, fp), 0)}</td>
                    <td className={`${(e.critical ? 'farm-c-accent' : 'farm-c-faint')} ${(e.critical ? 'font-semibold!' : 'font-normal!')}`}>{e.critical ? 'Yes' : '—'}</td>
                    <td className="num">
                      <InlineNumber value={e.shelves ?? null} step={1} nullable disabled={!rowEditable} label={`${e.item} growing shelves`} onCommit={(n) => save(e.id, { shelves: n === null || n <= 0 ? null : Math.round(n) })} />
                      {!e.shelves && <div className="farm-c-faint farm-fs-xs">Not a grow unit</div>}
                    </td>
                    <td className="num">
                      <InlineNumber value={e.shelfWidthIn ?? null} step={12} nullable disabled={!rowEditable || !e.shelves} label={`${e.item} shelf width in inches`} onCommit={(n) => save(e.id, { shelfWidthIn: n === null || n <= 0 ? null : n })} />
                    </td>
                    <td>
                      <select className="farm-input farm-cell-control w-40!" value={e.darkStagesOnly ? DARK : e.fixtureKey ?? ''} disabled={!rowEditable || !e.shelves} aria-label={`${e.item} fixture`} onChange={(ev) => save(e.id, ev.target.value === DARK ? { fixtureKey: null, darkStagesOnly: true, shelfLights: null } : { fixtureKey: ev.target.value || null, darkStagesOnly: false, shelfLights: null })}>
                        <option value="">Unlit, whole cycle</option>
                        <option value={DARK}>Dark rack: germination and blackout</option>
                        {LIGHT_FIXTURES.map((f) => <option key={f.key} value={f.key}>{f.name}</option>)}
                      </select>
                      {e.shelves && !e.darkStagesOnly && (e.fixtureKey || e.shelfLights?.length) ? (() => {
                        const lights = lightsOn({ shelves: e.shelves, fixtureKey: e.fixtureKey ?? null, shelfLights: e.shelfLights ?? null, darkOnly: false });
                        const setShelf = (i: number, next: ShelfLight) => save(e.id, { shelfLights: lights.map((l, j) => (j === i ? next : l)) });
                        return (
                          <div className="farm-fs-xs farm-c-faint mt-[0.2rem]!">
                            {e.shelfLights?.length ? 'Set shelf by shelf' : `${lights[0]?.count ?? 0} a shelf`}
                            {' · '}<button type="button" className="farm-link" onClick={() => setByShelf((k) => (k === e.id ? null : e.id ?? null))}>{byShelf === e.id ? 'Close' : 'By shelf'}</button>
                            {byShelf === e.id && (
                              <div className="flex flex-col gap-[0.2rem] mt-[0.2rem]!">
                                {lights.map((l, i) => (
                                  <div key={i} className="flex gap-[0.3rem] items-center">
                                    <span>Shelf {i + 1}</span>
                                    <select className="farm-input farm-cell-control w-36!" value={l.fixtureKey ?? ''} disabled={!rowEditable} aria-label={`${e.item} shelf ${i + 1} fixture`} onChange={(ev) => { const f = LIGHT_FIXTURES.find((x) => x.key === ev.target.value); setShelf(i, { fixtureKey: f?.key ?? null, count: f ? f.perShelf.value : 0 }); }}>
                                      <option value="">Unlit</option>
                                      {LIGHT_FIXTURES.map((f) => <option key={f.key} value={f.key}>{f.name}</option>)}
                                    </select>
                                    <InlineNumber value={l.count} step={1} disabled={!rowEditable || !l.fixtureKey} label={`${e.item} shelf ${i + 1} light count`} onCommit={(n) => n !== null && setShelf(i, { ...l, count: Math.max(0, Math.round(n)) })} />
                                  </div>
                                ))}
                                {e.shelfLights?.length ? <button type="button" className="farm-link text-left" disabled={!rowEditable} onClick={() => save(e.id, { shelfLights: null })}>Every shelf the same</button> : null}
                              </div>
                            )}
                          </div>
                        );
                      })() : null}
                    </td>
                    <td className="num">{e.shelves ? num(traysPerUnit({ key: e.key, item: e.item, shelves: e.shelves, shelfWidthIn: e.shelfWidthIn ?? 48, fixtureKey: e.fixtureKey ?? null, units: e.qty }, 'flat-1020')) : '—'}</td>
                    <td className="num">
                      <InlineNumber value={e.sowingCapacityLb ?? 0} step={10} disabled={!rowEditable} label={`${e.item} sowing capacity in pounds a run`} onCommit={(n) => n !== null && save(e.id, { sowingCapacityLb: n > 0 ? n : null })} />
                      {!e.sowingCapacityLb && <div className="farm-c-faint farm-fs-xs">Not a sowing grow unit</div>}
                    </td>
                    <td>
                      <select className="farm-input farm-cell-control w-30!" value={e.sowingCapacityBasis ?? 'estimated'} disabled={!rowEditable || !e.sowingCapacityLb} aria-label={`${e.item} sowing capacity basis`} onChange={(ev) => save(e.id, { sowingCapacityBasis: ev.target.value as SowingCapacityBasis })}>
                        {(Object.keys(SOWING_CAPACITY_BASIS_LABELS) as SowingCapacityBasis[]).map((b) => <option key={b} value={b}>{SOWING_CAPACITY_BASIS_LABELS[b]}</option>)}
                      </select>
                    </td>
                    <td className="num">
                      <InlineNumber value={e.concurrentSowings ?? null} step={1} nullable disabled={!rowEditable} label={`${e.item} sowings at once`} onCommit={(n) => save(e.id, { concurrentSowings: n === null ? null : Math.max(1, Math.round(n)) })} />
                      {e.concurrentSowings == null && <div className="farm-c-faint farm-fs-xs">No sowing runs on it</div>}
                    </td>
                    <td className="num">
                      <InlineNumber value={e.changeoverMinutes ?? null} step={5} nullable disabled={!rowEditable} label={`${e.item} changeover minutes`} onCommit={(n) => save(e.id, { changeoverMinutes: n })} />                    </td>
                    <td>
                      <select className="farm-input farm-cell-control w-19!" value={yesNo(e.attendedRun)} disabled={!rowEditable} aria-label={`${e.item} attended run`} onChange={(ev) => save(e.id, { attendedRun: fromYesNo(ev.target.value) })}>
                        <option value="">–</option>
                        <option value="yes">Yes</option>
                        <option value="no">No</option>
                      </select>
                    </td>
                    <td>
                      <select className="farm-input farm-cell-control w-19!" value={yesNo(e.mayRunUnattended)} disabled={!rowEditable} aria-label={`${e.item} may run unattended`} onChange={(ev) => save(e.id, { mayRunUnattended: fromYesNo(ev.target.value) })}>
                        <option value="">–</option>
                        <option value="yes">Yes</option>
                        <option value="no">No</option>
                      </select>
                    </td>
                    <td>
                      <span className="inline-flex gap-[0.35rem] items-center">
                        <select className="farm-input farm-cell-control w-30!" value={e.resourceBasis ?? 'estimated'} disabled={!rowEditable} aria-label={`${e.item} resource attribute basis`} onChange={(ev) => save(e.id, { resourceBasis: ev.target.value as SowingCapacityBasis })}>
                          {(Object.keys(SOWING_CAPACITY_BASIS_LABELS) as SowingCapacityBasis[]).map((b) => <option key={b} value={b}>{SOWING_CAPACITY_BASIS_LABELS[b]}</option>)}
                        </select>
                        <StatusBadge status={basisTag(e.resourceBasis)} title={RESOURCE_SEED[e.item]?.note ?? SOWING_CAPACITY_BASIS_LABELS[e.resourceBasis ?? 'estimated']} />
                      </span>
                    </td>
                  </tr>
                );
              })}
                </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        {canEdit && (
          <div className="flex flex-wrap gap-2 items-center mt-3!">
            <input className="farm-input min-w-64!" placeholder="Equipment item" value={draft.item} aria-label="New equipment item" onChange={(ev) => setDraft((d) => ({ ...d, item: ev.target.value }))} />
            <select className="farm-input farm-cell-control" value={draft.category} aria-label="New equipment category" onChange={(ev) => setDraft((d) => ({ ...d, category: ev.target.value as EquipmentCategory }))}>
              {EQUIPMENT_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <select className="farm-input farm-cell-control" value={draft.buildPhase} aria-label="New equipment build phase" onChange={(ev) => setDraft((d) => ({ ...d, buildPhase: Number(ev.target.value) }))}>
              {[1, 2, 3].map((p) => <option key={p} value={p}>Phase {p}</option>)}
            </select>
            <button type="button" className="farm-btn" disabled={pending || !draft.item.trim()} onClick={add}>Add equipment</button>
          </div>
        )}
        <p className="farm-kpi-sub mt-2">
          {forecastEditing ? 'The open forecast column is that forecast’s own status and in-service date for a line; the record does not move.' : 'On Actual the list shows the record; a forecast’s own status and in-service date for a line are set on Plan.'} {setting === 'commercial' ? 'A commercial row is on the list and counts toward nothing until a forecast selects it: set its status in the open forecast. ' : ''}In a forecast, planned Phase 1 equipment counts from the forecast start unless dated, and Phase 2 and 3 count only once dated. Statuses: In service — bought and in use; Planned — planned for its build-out phase; No — considered and not selected; – — on the list, not selected. Extended cost is quantity × unit cost, with the {Math.round(fp.usedDiscount * 100)}% used-equipment factor on used lines. Shelves, shelf width and fixture make a row a grow unit: a sowing is what one takes in trays of the plan\u2019s format, and a plan with a light line goes only on a unit whose fixture delivers it; the 1020 flats column is the count one unit takes. Sowings at once, changeover minutes, attended run and may run unattended describe a unit the Day Schedule can place work on. Capital, depreciation and financing are on <Link className="farm-link" href="/farm/financials/capital">Capital &amp; Financing</Link>; energy and refrigerant attributes per line are on <Link className="farm-link" href="/farm/sustainability/equipment">Sustainability · Equipment</Link>.
          {!canEdit && ' Editing is limited to super admins.'}
        </p>
      </Card>
    </>
  );
}
