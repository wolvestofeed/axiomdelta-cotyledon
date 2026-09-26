'use client';

/**
 * Sales page CRM — a two-tab section:
 *   • Directory — the full prospect table (filtered server-side).
 *   • Prospect workspace — pick one prospect and work it: Needs, Communications,
 *     Quote of Service (a live what-if calculator), and Scope of Work draft.
 *
 * Contacts and status come from the seeded prospect list and stay read-only until
 * the CRM data store lands. Two things a prospect points at ARE editable, because
 * they change what the quote computes: the distribution pickup point it would be served from,
 * and the crop plans quoted to it. Both are scenario edits, saved with a forecast.
 */

import { PageControls } from './PageControls';
import { useMemo, useState } from 'react';
import { money, num } from './ui';
import PinMap from './PinMap';
import { SectionSave } from './SectionSave';
import { EntityPicker } from './EntityPicker';
import { useLinkedEntities, useLinkedEntity } from './useLinkedEntities';
import { computeQuote, statusColors, type ClientProspect } from '../_engine/prospects-crm';
import { haversineMiles } from '../_engine/geo';
import { entityRef } from '../_engine/entity-links';
import { costCropPlan } from '../_engine';
import { useScenario } from '../_state/scenario-store';

interface Home {
  name: string;
  address: string;
  lat: number;
  lng: number;
  approximate: boolean;
}

interface Props {
  prospects: ClientProspect[];
  totalInView: number;
  quoteDefaults: { pricePerUnit: number; servingDays: number; forecastLabel: string | null };
  home: Home;
}

type SubTab = 'needs' | 'comms' | 'links' | 'quote' | 'sow';

/**
 * A prospect's links, read from the scenario. `pickup_point` is the distribution pickup point it
 * would be served from; `cropPlanCodes` are the crop plans quoted, which is what makes
 * the quote's input cost and margin computable rather than assumed.
 */
function useProspectLinks(prospectId: string) {
  const { resolved, setSales, isSuperAdmin } = useScenario();
  const row = resolved.sales[prospectId] ?? {};
  const cropPlanCodes = row.cropPlanCodes ?? [];
  const refs = useMemo(
    () => [
      ...(row.pickupPointId ? [entityRef('pickupPoint', row.pickupPointId)] : []),
      ...cropPlanCodes.map((c) => entityRef('cropPlan', c)),
    ],
    [row.pickupPointId, cropPlanCodes.join(',')],
  );
  const byRef = useLinkedEntities(refs);

  return {
    pickupPointId: row.pickupPointId,
    cropPlanCodes,
    byRef,
    canEdit: isSuperAdmin,
    setPickupPoint: (pickupPointId: string | undefined) =>
      setSales(prospectId, (d) => {
        if (pickupPointId === undefined) delete d.pickupPointId;
        else d.pickupPointId = pickupPointId;
      }),
    addCropPlan: (code: string) =>
      setSales(prospectId, (d) => {
        const list = (d.cropPlanCodes ??= []);
        if (!list.includes(code)) list.push(code);
      }),
    removeCropPlan: (code: string) =>
      setSales(prospectId, (d) => {
        d.cropPlanCodes = (d.cropPlanCodes ?? []).filter((c) => c !== code);
      }),
  };
}

export default function ProspectsCRM({ prospects, totalInView, quoteDefaults, home }: Props) {
  const [tab, setTab] = useState<'directory' | 'map' | 'workspace'>('directory');
  const [selectedId, setSelectedId] = useState<string>(prospects[0]?.id ?? '');
  const [sub, setSub] = useState<SubTab>('needs');

  const selected = prospects.find((s) => s.id === selectedId) ?? prospects[0] ?? null;
  const mappable = useMemo(() => prospects.filter((s) => s.lat != null && s.lng != null), [prospects]);
  const unmappable = prospects.length - mappable.length;
  const mapMiles =
    selected && selected.lat != null && selected.lng != null
      ? haversineMiles(home, { lat: selected.lat, lng: selected.lng })
      : null;

  function openProspect(id: string) {
    setSelectedId(id);
    setTab('workspace');
  }

  return (
    <div className="farm-card mt-4">
      {/* Tab bar — gradient header band, bleeds to the card edges */}
      <div
        className="flex items-center gap-2 mt-[-1.1rem]! mr-[-1.2rem]! mb-4! ml-[-1.2rem]! py-[0.6rem] px-[0.9rem] bg-[linear-gradient(135deg,var(--farm-forest)_0%,var(--farm-forest-soft)_55%,var(--farm-olive)_150%)] [border-top-left-radius:0.6rem] [border-top-right-radius:0.6rem]"
      >
        <TabButton active={tab === 'directory'} onClick={() => setTab('directory')}>Directory</TabButton>
        <TabButton active={tab === 'map'} onClick={() => setTab('map')}>Map</TabButton>
        <TabButton active={tab === 'workspace'} onClick={() => setTab('workspace')}>Prospect workspace</TabButton>
        {tab !== 'workspace' && (
          <div className="ml-auto! farm-fs-xs font-medium text-[rgba(255,255,255,0.8)]">
            {num(prospects.length)} of {num(totalInView)}
          </div>
        )}
      </div>

      {tab === 'directory' ? (
        <div className="farm-scroll-x">
          <table className="farm-table">
            <thead>
              <tr>
                <th>Prospect</th><th>Location</th><th>Status</th><th className="num">Headcount</th>
                <th>Grades</th><th>Current program</th><th>Payment model</th><th>Point of contact</th><th></th>
              </tr>
            </thead>
            <tbody>
              {prospects.map((s) => (
                <tr key={s.id}>
                  <td>
                    <button type="button" onClick={() => openProspect(s.id)} className="farm-link bg-none! border-0! p-0! cursor-pointer! [font:inherit]! font-medium! text-left!">{s.name}</button>
                    <div className="farm-c-faint farm-fs-xs">{s.segmentLabel} · {s.model}</div>
                  </td>
                  <td className="farm-c-soft">{s.location}</td>
                  <td><StatusPill status={s.status} /></td>
                  <td className="num">{s.headcountRaw || '—'}</td>
                  <td className="farm-c-soft">{s.grades}</td>
                  <td className="farm-c-soft farm-fs-xs">{s.currentProgram}</td>
                  <td className="farm-c-soft farm-fs-xs">{s.paymentModel}</td>
                  <td className="farm-c-soft farm-fs-xs">{s.pointOfContact}</td>
                  <td><button type="button" onClick={() => openProspect(s.id)} className="py-1! px-[0.6rem]! border! border-[color:var(--farm-line)]! rounded-[0.35rem]! bg-[color:var(--farm-surface)]! farm-c-forest farm-fs-xs font-semibold! cursor-pointer! whitespace-nowrap!">Open →</button></td>
                </tr>
              ))}
              {prospects.length === 0 && (
                <tr><td colSpan={9} className="farm-c-faint p-4!">No prospects match the current filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      ) : tab === 'map' ? (
        <div className="flex flex-wrap gap-4 items-stretch">
          <div className="flex-[1_1_22rem] min-w-72">
            <PinMap pins={mappable} home={home} selectedId={selectedId || null} onSelect={(id) => setSelectedId(id ?? '')} />
            <p className="farm-kpi-sub mt-2">
              Pins are street-address geocodes (U.S. Census) or ZIP centroids. Distance is straight-line
              from the farm. Map data © OpenStreetMap contributors.
              {unmappable > 0 ? ` ${num(unmappable)} prospect${unmappable === 1 ? '' : 's'} in this view had no mappable address and ${unmappable === 1 ? 'is' : 'are'} not shown.` : ''}
            </p>
          </div>

          <aside className="flex-[0_0_19rem] min-w-64 flex flex-col gap-[0.8rem]">
            <div className="border border-[color:var(--farm-line)] rounded-[0.5rem] py-[0.8rem] px-[0.9rem] bg-[color:var(--farm-surface-2)]">
              <div className="farm-card-title mb-[0.4rem]!">Home</div>
              <div className="flex items-center gap-2">
                <span className="w-[12px] h-[12px] rounded-full bg-[color:var(--farm-accent)] border-2 border-[color:var(--farm-ink-strong)] shadow-[0_0_0_1px_var(--farm-line)] flex-none" />
                <span className="font-semibold">{home.name}</span>
              </div>
              <div className="farm-c-soft farm-fs-sm mt-[0.3rem]!">{home.address}</div>
              {home.approximate && (
                <div className="farm-c-faint farm-fs-xs mt-[0.3rem]!">Approximate pin — exact address to be confirmed.</div>
              )}
            </div>

            <div className="border border-[color:var(--farm-line)] rounded-[0.5rem] py-[0.8rem] px-[0.9rem] bg-[color:var(--farm-surface-2)]">
              <div className="farm-card-title mb-[0.4rem]!">Selected prospect</div>
              {selected && selected.lat != null ? (
                <>
                  <div className="flex items-center gap-2">
                    <span className="w-[12px] h-[12px] rounded-full bg-[color:var(--farm-forest)] border-2 border-[color:var(--farm-ink-strong)] shadow-[0_0_0_1px_var(--farm-line)] flex-none" />
                    <span className="font-semibold">{selected.name}</span>
                  </div>
                  <div className="farm-c-soft farm-fs-sm mt-[0.3rem]!">{selected.location}</div>
                  <div className="mt-[0.4rem]!"><StatusPill status={selected.status} /></div>
                  {mapMiles != null && (
                    <div className="mt-[0.7rem]!">
                      <div className="farm-kpi-value farm-fs-xl">{fmtMiles(mapMiles)} mi</div>
                      <div className="farm-kpi-sub">Straight-line distance from {home.name}</div>
                    </div>
                  )}
                  <div className="farm-c-faint farm-fs-xs mt-2!">
                    Pin is a {selected.geoSource === 'address' ? 'street-address geocode' : 'ZIP-code centroid'} — distance is approximate.
                  </div>
                  <button type="button" onClick={() => setTab('workspace')} className="py-1! px-[0.6rem]! border! border-[color:var(--farm-line)]! rounded-[0.35rem]! bg-[color:var(--farm-surface)]! farm-c-forest farm-fs-xs font-semibold! cursor-pointer! whitespace-nowrap!">Open workspace →</button>
                </>
              ) : (
                <div className="farm-c-faint farm-fs-sm">
                  Select a prospect pin on the map to see its straight-line distance from {home.name}.
                </div>
              )}
            </div>
          </aside>
        </div>
      ) : !selected ? (
        <p className="farm-kpi-sub">No prospects in the current view. Adjust the filters above.</p>
      ) : (
        <div>
          {/* Prospect selector + header */}
          <PageControls>
            <label className="farm-kpi-sub inline-flex items-center gap-2">
              Prospect
              <select value={selected.id} onChange={(e) => setSelectedId(e.target.value)} className="farm-select">
                {prospects.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </label>
          </PageControls>
          <div className="flex flex-wrap gap-3 items-end mb-[0.9rem]!">
            <div className="farm-card-title m-0!">{selected.name}</div>
            <div className="pb-[0.15rem]"><StatusPill status={selected.status} /></div>
            <div className="ml-auto! text-right farm-c-soft farm-fs-xs pb-[0.15rem]">
              {selected.segmentLabel}<br />{selected.location}
            </div>
          </div>

          {/* Sub-tabs */}
          <div className="flex gap-[0.3rem] border-b border-b-[color:var(--farm-line)] mb-4! flex-wrap">
            <SubTabButton active={sub === 'needs'} onClick={() => setSub('needs')}>Needs</SubTabButton>
            <SubTabButton active={sub === 'comms'} onClick={() => setSub('comms')}>Communications</SubTabButton>
            <SubTabButton active={sub === 'links'} onClick={() => setSub('links')}>Pickup point &amp; crop plans</SubTabButton>
            <SubTabButton active={sub === 'quote'} onClick={() => setSub('quote')}>Quote of service</SubTabButton>
            <SubTabButton active={sub === 'sow'} onClick={() => setSub('sow')}>Scope of work</SubTabButton>
          </div>

          {sub === 'needs' && <NeedsPanel prospect={selected} />}
          {sub === 'comms' && <CommsPanel prospect={selected} />}
          {sub === 'links' && <LinksPanel prospect={selected} />}
          {sub === 'quote' && <QuotePanel key={selected.id} prospect={selected} defaults={quoteDefaults} />}
          {sub === 'sow' && <SowPanel prospect={selected} defaults={quoteDefaults} />}
        </div>
      )}
    </div>
  );
}

// ── Needs ──────────────────────────────────────────────────────────────────
function NeedsPanel({ prospect }: { prospect: ClientProspect }) {
  const rows: Array<[string, string]> = [
    ['Enrollment', prospect.headcountRaw || 'Unknown'],
    ['Grades served', prospect.grades || '—'],
    ['Educational model', prospect.model || '—'],
    ['Current program', prospect.currentProgram || '—'],
    ['Payment model', prospect.paymentModel || '—'],
  ];
  return (
    <>
      <div className="farm-card-title">What this prospect needs from the farm</div>
      <div className="border border-[color:var(--farm-line)] rounded-[0.5rem] overflow-hidden max-w-152">
        {rows.map(([k, v], i) => (
          <div key={k} className={`flex gap-4 py-[0.55rem] px-[0.8rem] ${(i % 2 ? 'bg-[color:var(--farm-surface-2)]' : 'bg-transparent')}`}>
            <div className="flex-[0_0_12rem] farm-c-faint farm-fs-xs">{k}</div>
            <div className="farm-c-ink farm-fs-sm">{v}</div>
          </div>
        ))}
      </div>
      <p className="farm-kpi-sub mt-2 max-w-152!">
        The fields above come from the prospect list. Units per day, menu preferences, allergen
        constraints, and distribution cadence are defined with the prospect and captured here once the CRM
        data store lands. Use the Quote of service tab to model volume and value from enrollment.
      </p>
    </>
  );
}

// ── Communications ───────────────────────────────────────────────────────────
function CommsPanel({ prospect }: { prospect: ClientProspect }) {
  return (
    <div className="flex flex-wrap gap-[1.2rem]">
      <div className="flex-[1_1_20rem] min-w-64">
        <div className="farm-card-title">Timeline</div>
        <ul className="list-none p-0 m-0! border-l-2 border-l-[color:var(--farm-line)]">
          <TimelineItem label="First contact" value={prospect.firstContact || 'Not recorded'} />
          <TimelineItem label="Current status" value={prospect.status} />
        </ul>
        <p className="farm-kpi-sub mt-2 max-w-104!">
          Logging calls, emails, and sales notes here becomes available with the CRM data store.
          Nothing is editable in this version.
        </p>
      </div>
      <div className="flex-[0_0_18rem] min-w-60">
        <div className="farm-card-title">Contact</div>
        <div className="border border-[color:var(--farm-line)] rounded-[0.5rem] py-[0.8rem] px-[0.9rem] bg-[color:var(--farm-surface-2)] farm-fs-sm leading-[1.7]">
          <div className="font-semibold">{prospect.pointOfContact || '—'}</div>
          {prospect.phone && <div><a className="farm-link" href={`tel:${prospect.phone.replace(/[^0-9+]/g, '')}`}>{prospect.phone}</a></div>}
          {prospect.email && <div><a className="farm-link" href={`mailto:${prospect.email}`}>{prospect.email}</a></div>}
          {prospect.website && <div><a className="farm-link" href={`https://${prospect.website.replace(/^https?:\/\//, '')}`} target="_blank" rel="noopener noreferrer">{prospect.website}</a></div>}
        </div>
      </div>
    </div>
  );
}

function TimelineItem({ label, value }: { label: string; value: string }) {
  return (
    <li className="relative pt-0 pr-0 pb-[0.9rem] pl-4">
      <span className="absolute left-[-5px] top-[0.35rem] w-[8px] h-[8px] rounded-full bg-[color:var(--farm-forest)]" />
      <div className="farm-fs-xs farm-c-faint">{label}</div>
      <div className="farm-fs-base farm-c-ink">{value}</div>
    </li>
  );
}

// ── Pickup point & crop plans (the prospect's links) ───────────────────────────────────
function LinksPanel({ prospect }: { prospect: ClientProspect }) {
  const { pickupPointId, cropPlanCodes, byRef, canEdit, setPickupPoint, addCropPlan, removeCropPlan } = useProspectLinks(prospect.id);
  const { resolved } = useScenario();
  const pickupPoint = pickupPointId ? byRef[entityRef('pickupPoint', pickupPointId)] ?? null : null;

  return (
    <div className="max-w-184">
      <SectionSave sections={['sales']} title="this prospect's links" />

      <div className="farm-card-title mt-[0.9rem]!">Served from</div>
      <EntityPicker
        kinds={['pickupPoint']}
        linked={pickupPoint}
        canEdit={canEdit}
        label="pickup_point"
        ariaLabel={`Link ${prospect.name} to a distribution pickup point`}
        placeholder="Search pickup point name, type, county…"
        onLink={setPickupPoint}
      />
      <p className="farm-kpi-sub mt-2">
        The distribution pickupPoint carries the service window and the outbound leg. A pickupPoint linked to this
        prospect on Pickup Points &amp; Routes is the same record seen from the other side.
      </p>

      <div className="farm-card-title mt-[1.2rem]!">Crop plans quoted</div>
      {cropPlanCodes.length === 0 ? (
        <p className="farm-kpi-sub mt-0!">None linked. The quote then carries no input cost.</p>
      ) : (
        <div className="border border-[color:var(--farm-line)] rounded-[0.5rem] overflow-hidden mb-[0.6rem]!">
          {cropPlanCodes.map((code, i) => {
            const r = byRef[entityRef('cropPlan', code)];
            const lib = resolved.cropPlans.find((x) => x.code === code);
            const cost = lib ? costCropPlan(lib, resolved.assumptions.yield.shrinkAllowance.value).totalInputCostPerUnit : null;
            return (
              <div key={code} className={`flex items-center gap-[0.8rem] py-[0.55rem] px-[0.8rem] ${(i % 2 ? 'bg-[color:var(--farm-surface-2)]' : 'bg-transparent')}`}>
                <div className="flex-1">
                  <div className="font-medium farm-fs-sm">{r?.name ?? code}</div>
                  <div className="farm-fs-xs farm-c-faint">{r?.subtitle ?? code}</div>
                </div>
                <div className="farm-fs-sm tabular-nums">
                  {cost !== null ? `${money(cost, 4)} food / unit` : <span className="farm-c-faint">not costed in this model</span>}
                </div>
                {canEdit ? (
                  <button type="button" className="farm-btn farm-fs-2xs" onClick={() => removeCropPlan(code)}>Remove</button>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
      <EntityPicker
        kinds={['cropPlan']}
        linked={null}
        canEdit={canEdit}
        emptyText=""
        addLabel="Add a crop plan"
        ariaLabel={`Add a crop plan quoted to ${prospect.name}`}
        placeholder="Search crop plan name, code, category…"
        onLink={(code) => { if (code) addCropPlan(code); }}
      />
      <p className="farm-kpi-sub mt-2">
        Input cost per unit comes from the open forecast for each cropPlan quoted, so the Quote of service
        tab shows margin over input cost rather than revenue alone. Links are part of the scenario.
      </p>
    </div>
  );
}

// ── Quote of service (live what-if) ──────────────────────────────────────────
function QuotePanel({ prospect, defaults }: { prospect: ClientProspect; defaults: Props['quoteDefaults'] }) {
  const [headcount, setStudents] = useState<number>(prospect.headcount ?? 0);
  const [participation, setParticipation] = useState<number>(50); // %
  const [pricePerUnit, setPricePerUnit] = useState<number>(defaults.pricePerUnit);
  const [servingDays, setServingDays] = useState<number>(defaults.servingDays);

  const r = computeQuote({ headcount, participation: participation / 100, pricePerUnit, servingDays });

  // Input cost comes from the crop plans linked to this prospect, through the live
  // model. With none linked there is no cost to show, and the quote stays revenue.
  const { cropPlanCodes, byRef } = useProspectLinks(prospect.id);
  const { resolved } = useScenario();
  const costed = cropPlanCodes
    .map((code) => ({
      code,
      name: byRef[entityRef('cropPlan', code)]?.name ?? code,
      cost: (() => { const lib = resolved.cropPlans.find((x) => x.code === code); return lib ? costCropPlan(lib, resolved.assumptions.yield.shrinkAllowance.value).totalInputCostPerUnit : null; })(),
    }))
    .filter((x) => x.cost !== null) as { code: string; name: string; cost: number }[];
  const avgInputCost = costed.length > 0 ? costed.reduce((t, x) => t + x.cost, 0) / costed.length : null;

  return (
    <div className="flex flex-wrap gap-6">
      <div className="flex-[1_1_18rem] min-w-60">
        <div className="farm-card-title">Inputs</div>
        <NumField label="Enrollment" value={headcount} onChange={setStudents} />
        <div className="my-[0.7rem]! mx-0!">
          <div className="flex justify-between farm-fs-xs farm-c-soft">
            <span>Assumed participation</span><span>{participation}%</span>
          </div>
          <input type="range" min={0} max={100} step={5} value={participation} onChange={(e) => setParticipation(Number(e.target.value))} className="w-full!" />
        </div>
        <NumField label="Price per unit ($)" value={pricePerUnit} onChange={setPricePerUnit} step={0.25} />
        <NumField label="Serving days / year" value={servingDays} onChange={setServingDays} />
        <p className="farm-kpi-sub mt-2">
          Defaults from Subscriptions in {defaults.forecastLabel ? <>the open forecast, {defaults.forecastLabel}</> : 'plan defaults'} (${defaults.pricePerUnit}/unit, {defaults.servingDays} days).
          Adjust the inputs — figures recompute live.
        </p>
      </div>

      <div className="flex-[1_1_20rem] min-w-68">
        <div className="farm-card-title">Quote of service — draft</div>
        <div className="border border-[color:var(--farm-line)] rounded-[0.5rem] overflow-hidden">
          <div className="py-[0.8rem] px-[0.9rem] bg-[color:var(--farm-surface-2)] border-b border-b-[color:var(--farm-line)]">
            <div className="font-semibold">{prospect.name}</div>
            <div className="farm-fs-xs farm-c-faint">{prospect.location}</div>
          </div>
          <QuoteRow label="Estimated units / day" value={num(r.unitsPerDay)} />
          <QuoteRow label="Serving days / year" value={num(servingDays)} />
          <QuoteRow label="Estimated annual units" value={num(r.annualUnits)} />
          <QuoteRow label="Price per unit" value={money(r.perUnitValue, 2)} />
          <QuoteRow label="Estimated monthly value" value={money(r.monthlyValue, 0)} />
          <QuoteRow label="Estimated annual value" value={money(r.annualValue, 0)} strong />
          {avgInputCost !== null ? (
            <>
              <QuoteRow
                label={costed.length === 1 ? `Input cost / unit — ${costed[0].name}` : `Input cost / unit — mean of ${costed.length} crop plans`}
                value={money(avgInputCost, 4)}
              />
              <QuoteRow label="Over input cost / unit" value={money(pricePerUnit - avgInputCost, 2)} />
              <QuoteRow label="Over input cost / year" value={money((pricePerUnit - avgInputCost) * r.annualUnits, 0)} strong />
            </>
          ) : null}
        </div>
        <p className="farm-kpi-sub mt-2">
          Draft — not saved. Estimates derived from the inputs at left; not a binding offer.
          {avgInputCost === null
            ? ' Link the crop plans quoted on the Pickup point & crop plans tab to carry input cost into the quote.'
            : ' Input cost is from the open forecast for the linked crop plans; it covers inputs only, not labor, packaging, distribution, or overhead.'}
        </p>
      </div>
    </div>
  );
}

function NumField({ label, value, onChange, step = 1 }: { label: string; value: number; onChange: (n: number) => void; step?: number }) {
  return (
    <label className="block! farm-fs-sm mb-2!">
      <div className="farm-kpi-label">{label}</div>
      <input type="number" value={Number.isFinite(value) ? value : 0} step={step} min={0}
        onChange={(e) => onChange(Number(e.target.value))} className="py-[0.4rem]! px-[0.6rem]! border! border-[color:var(--farm-line)]! rounded-[0.4rem]! bg-[color:var(--farm-surface)]! farm-c-ink farm-fs-sm w-full!" />
    </label>
  );
}

function QuoteRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between py-2 px-[0.9rem] border-b border-b-[color:var(--farm-line)] ${(strong ? 'bg-[color:var(--farm-surface-2)]' : 'bg-transparent')}`}>
      <span className="farm-c-soft farm-fs-sm">{label}</span>
      <span className={`tabular-nums ${(strong ? 'font-bold' : 'font-medium')}`}>{value}</span>
    </div>
  );
}

// ── Scope of work (draft) ────────────────────────────────────────────────────
function SowPanel({ prospect, defaults }: { prospect: ClientProspect; defaults: { pricePerUnit: number; servingDays: number } }) {
  return (
    <div className="max-w-184">
      <div className="farm-card-title">Scope of work — draft</div>
      <div className="border border-[color:var(--farm-line)] rounded-[0.5rem] py-[1.1rem] px-[1.3rem] leading-[1.6] farm-fs-base">
        <SowSection title="1. Parties">
          <strong>Provider:</strong> MicroFarm (facility). <strong>Client:</strong>{' '}
          {prospect.name}, {prospect.location}.
        </SowSection>
        <SowSection title="2. Program scope">
          Prepared unit service for a {prospect.segmentLabel.toLowerCase()} serving grades {prospect.grades || '—'}
          {prospect.headcount ? `, approximately ${num(prospect.headcount)} headcount` : ''}. Current food
          program on record: {prospect.currentProgram || '—'} ({prospect.paymentModel || 'payment model TBD'}).
        </SowSection>
        <SowSection title="3. Deliverables">
          Grow prepared units produced at the facility, blackouted, distributed on a cadence
          agreed with the prospect, and reheated on pickupPoint. Menu, unit size, allergen requirements, and
          distribution schedule to be confirmed with the prospect.
        </SowSection>
        <SowSection title="4. Food safety & compliance">
          HACCP-based produce-safety plan, two-stage cooling with logged CCPs, and allergen changeover
          controls. Documentation available to the prospect on request.
        </SowSection>
        <SowSection title="5. Term & service window">
          Service window aligned to the prospect calendar (default {defaults.servingDays} serving days /
          year). Term, start date, and renewal to be defined with the prospect.
        </SowSection>
        <SowSection title="6. Pricing basis">
          Per-unit pricing (default reference ${defaults.pricePerUnit}/unit). See the Quote of service
          tab for a volume and value estimate. Final pricing subject to menu, volume, and distribution terms.
        </SowSection>
      </div>
      <p className="farm-kpi-sub mt-2">
        Draft — not saved. A working scope-of-work statement generated from the prospect record and the
        farm&apos;s operating model; confirm all figures and terms with the prospect before issuing.
      </p>
    </div>
  );
}

function SowSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-[0.9rem]!">
      <div className="font-semibold mb-[0.2rem]!">{title}</div>
      <div className="farm-c-soft">{children}</div>
    </div>
  );
}

// ── Shared bits ──────────────────────────────────────────────────────────────
function StatusPill({ status }: { status: string }) {
  const c = statusColors(status);
  return (
    <span className="inline-block py-[0.1rem] px-2 rounded-full farm-fs-xs font-semibold whitespace-nowrap" style={{ background: c.bg, color: c.fg, border: `1px solid ${c.border}` }}>
      {status}
    </span>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active}
      className={`py-[0.4rem]! px-[1.15rem]! rounded-[0.45rem]! farm-fs-sm tracking-[0.01em]! cursor-pointer! [transition:background_120ms_ease,color_120ms_ease]! ${(active ? 'border! border-[color:transparent]!' : 'border! border-[color:rgba(255,255,255,0.45)]!')} ${(active ? 'bg-[color:var(--farm-ink-strong)]!' : 'bg-[color:rgba(255,255,255,0.12)]!')} ${(active ? 'farm-c-forest' : 'text-[rgba(255,255,255,0.92)]!')} ${(active ? 'font-bold!' : 'font-semibold!')}`} style={{ boxShadow: active ? '0 1px 3px rgba(0,0,0,0.28)' : 'none' }}>
      {children}
    </button>
  );
}

function SubTabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick}
      className={`py-[0.45rem]! px-[0.9rem]! border-0! bg-none! farm-fs-sm cursor-pointer! mb-[-1px]! ${(active ? 'border-b-2! border-b-[color:var(--farm-forest)]!' : 'border-b-2! border-b-[color:transparent]!')} ${(active ? 'farm-c-ink' : 'farm-c-faint')} ${(active ? 'font-semibold!' : 'font-medium!')}`}>
      {children}
    </button>
  );
}

function fmtMiles(mi: number): string {
  return mi < 100 ? mi.toFixed(1) : mi.toFixed(0);
}
