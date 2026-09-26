'use client';

/**
 * Sales page CRM — a two-tab section:
 *   • Directory — the full prospect table (filtered server-side).
 *   • School workspace — pick one school and work it: Needs, Communications,
 *     Quote of Service (a live what-if calculator), and Scope of Work draft.
 *
 * Contacts and status come from the seeded prospect list and stay read-only until
 * the CRM data store lands. Two things a prospect points at ARE editable, because
 * they change what the quote computes: the delivery site it would be served from,
 * and the recipes quoted to it. Both are scenario edits, saved with a forecast.
 */

import { PageControls } from './PageControls';
import { useMemo, useState } from 'react';
import { money, num } from './ui';
import PinMap from './PinMap';
import { SectionSave } from './SectionSave';
import { EntityPicker } from './EntityPicker';
import { useLinkedEntities, useLinkedEntity } from './useLinkedEntities';
import { computeQuote, statusColors, type ClientSchool } from '../_engine/schools-crm';
import { haversineMiles } from '../_engine/geo';
import { entityRef } from '../_engine/entity-links';
import { costRecipe } from '../_engine';
import { useScenario } from '../_state/scenario-store';

interface Home {
  name: string;
  address: string;
  lat: number;
  lng: number;
  approximate: boolean;
}

interface Props {
  schools: ClientSchool[];
  totalInView: number;
  quoteDefaults: { pricePerMeal: number; servingDays: number; forecastLabel: string | null };
  home: Home;
}

type SubTab = 'needs' | 'comms' | 'links' | 'quote' | 'sow';

/**
 * A prospect's links, read from the scenario. `site` is the delivery site it
 * would be served from; `recipeCodes` are the recipes quoted, which is what makes
 * the quote's food cost and margin computable rather than assumed.
 */
function useProspectLinks(schoolId: string) {
  const { resolved, setSales, isSuperAdmin } = useScenario();
  const row = resolved.sales[schoolId] ?? {};
  const recipeCodes = row.recipeCodes ?? [];
  const refs = useMemo(
    () => [
      ...(row.siteId ? [entityRef('site', row.siteId)] : []),
      ...recipeCodes.map((c) => entityRef('recipe', c)),
    ],
    [row.siteId, recipeCodes.join(',')],
  );
  const byRef = useLinkedEntities(refs);

  return {
    siteId: row.siteId,
    recipeCodes,
    byRef,
    canEdit: isSuperAdmin,
    setSite: (siteId: string | undefined) =>
      setSales(schoolId, (d) => {
        if (siteId === undefined) delete d.siteId;
        else d.siteId = siteId;
      }),
    addRecipe: (code: string) =>
      setSales(schoolId, (d) => {
        const list = (d.recipeCodes ??= []);
        if (!list.includes(code)) list.push(code);
      }),
    removeRecipe: (code: string) =>
      setSales(schoolId, (d) => {
        d.recipeCodes = (d.recipeCodes ?? []).filter((c) => c !== code);
      }),
  };
}

export default function SchoolsCRM({ schools, totalInView, quoteDefaults, home }: Props) {
  const [tab, setTab] = useState<'directory' | 'map' | 'workspace'>('directory');
  const [selectedId, setSelectedId] = useState<string>(schools[0]?.id ?? '');
  const [sub, setSub] = useState<SubTab>('needs');

  const selected = schools.find((s) => s.id === selectedId) ?? schools[0] ?? null;
  const mappable = useMemo(() => schools.filter((s) => s.lat != null && s.lng != null), [schools]);
  const unmappable = schools.length - mappable.length;
  const mapMiles =
    selected && selected.lat != null && selected.lng != null
      ? haversineMiles(home, { lat: selected.lat, lng: selected.lng })
      : null;

  function openSchool(id: string) {
    setSelectedId(id);
    setTab('workspace');
  }

  return (
    <div className="muse-card mt-4">
      {/* Tab bar — gradient header band, bleeds to the card edges */}
      <div
        className="flex items-center gap-2 mt-[-1.1rem]! mr-[-1.2rem]! mb-4! ml-[-1.2rem]! py-[0.6rem] px-[0.9rem] bg-[linear-gradient(135deg,var(--muse-forest)_0%,var(--muse-forest-soft)_55%,var(--muse-olive)_150%)] [border-top-left-radius:0.6rem] [border-top-right-radius:0.6rem]"
      >
        <TabButton active={tab === 'directory'} onClick={() => setTab('directory')}>Directory</TabButton>
        <TabButton active={tab === 'map'} onClick={() => setTab('map')}>Map</TabButton>
        <TabButton active={tab === 'workspace'} onClick={() => setTab('workspace')}>School workspace</TabButton>
        {tab !== 'workspace' && (
          <div className="ml-auto! muse-fs-xs font-medium text-[rgba(255,255,255,0.8)]">
            {num(schools.length)} of {num(totalInView)}
          </div>
        )}
      </div>

      {tab === 'directory' ? (
        <div className="muse-scroll-x">
          <table className="muse-table">
            <thead>
              <tr>
                <th>School</th><th>Location</th><th>Status</th><th className="num">Students</th>
                <th>Grades</th><th>Current food program</th><th>Parent-pay</th><th>Point of contact</th><th></th>
              </tr>
            </thead>
            <tbody>
              {schools.map((s) => (
                <tr key={s.id}>
                  <td>
                    <button type="button" onClick={() => openSchool(s.id)} className="muse-link bg-none! border-0! p-0! cursor-pointer! [font:inherit]! font-medium! text-left!">{s.name}</button>
                    <div className="muse-c-faint muse-fs-xs">{s.segmentLabel} · {s.model}</div>
                  </td>
                  <td className="muse-c-soft">{s.location}</td>
                  <td><StatusPill status={s.status} /></td>
                  <td className="num">{s.studentsRaw || '—'}</td>
                  <td className="muse-c-soft">{s.grades}</td>
                  <td className="muse-c-soft muse-fs-xs">{s.foodProgram}</td>
                  <td className="muse-c-soft muse-fs-xs">{s.parentPay}</td>
                  <td className="muse-c-soft muse-fs-xs">{s.pointOfContact}</td>
                  <td><button type="button" onClick={() => openSchool(s.id)} className="py-1! px-[0.6rem]! border! border-[color:var(--muse-line)]! rounded-[0.35rem]! bg-[color:var(--muse-surface)]! muse-c-forest muse-fs-xs font-semibold! cursor-pointer! whitespace-nowrap!">Open →</button></td>
                </tr>
              ))}
              {schools.length === 0 && (
                <tr><td colSpan={9} className="muse-c-faint p-4!">No schools match the current filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      ) : tab === 'map' ? (
        <div className="flex flex-wrap gap-4 items-stretch">
          <div className="flex-[1_1_22rem] min-w-72">
            <PinMap pins={mappable} home={home} selectedId={selectedId || null} onSelect={(id) => setSelectedId(id ?? '')} />
            <p className="muse-kpi-sub mt-2">
              Pins are street-address geocodes (U.S. Census) or ZIP centroids. Distance is straight-line
              from the kitchen. Map data © OpenStreetMap contributors.
              {unmappable > 0 ? ` ${num(unmappable)} school${unmappable === 1 ? '' : 's'} in this view had no mappable address and ${unmappable === 1 ? 'is' : 'are'} not shown.` : ''}
            </p>
          </div>

          <aside className="flex-[0_0_19rem] min-w-64 flex flex-col gap-[0.8rem]">
            <div className="border border-[color:var(--muse-line)] rounded-[0.5rem] py-[0.8rem] px-[0.9rem] bg-[color:var(--muse-surface-2)]">
              <div className="muse-card-title mb-[0.4rem]!">Home</div>
              <div className="flex items-center gap-2">
                <span className="w-[12px] h-[12px] rounded-full bg-[color:var(--muse-accent)] border-2 border-[color:var(--muse-ink-strong)] shadow-[0_0_0_1px_var(--muse-line)] flex-none" />
                <span className="font-semibold">{home.name}</span>
              </div>
              <div className="muse-c-soft muse-fs-sm mt-[0.3rem]!">{home.address}</div>
              {home.approximate && (
                <div className="muse-c-faint muse-fs-xs mt-[0.3rem]!">Approximate pin — exact address to be confirmed.</div>
              )}
            </div>

            <div className="border border-[color:var(--muse-line)] rounded-[0.5rem] py-[0.8rem] px-[0.9rem] bg-[color:var(--muse-surface-2)]">
              <div className="muse-card-title mb-[0.4rem]!">Selected school</div>
              {selected && selected.lat != null ? (
                <>
                  <div className="flex items-center gap-2">
                    <span className="w-[12px] h-[12px] rounded-full bg-[color:var(--muse-forest)] border-2 border-[color:var(--muse-ink-strong)] shadow-[0_0_0_1px_var(--muse-line)] flex-none" />
                    <span className="font-semibold">{selected.name}</span>
                  </div>
                  <div className="muse-c-soft muse-fs-sm mt-[0.3rem]!">{selected.location}</div>
                  <div className="mt-[0.4rem]!"><StatusPill status={selected.status} /></div>
                  {mapMiles != null && (
                    <div className="mt-[0.7rem]!">
                      <div className="muse-kpi-value muse-fs-xl">{fmtMiles(mapMiles)} mi</div>
                      <div className="muse-kpi-sub">Straight-line distance from {home.name}</div>
                    </div>
                  )}
                  <div className="muse-c-faint muse-fs-xs mt-2!">
                    Pin is a {selected.geoSource === 'address' ? 'street-address geocode' : 'ZIP-code centroid'} — distance is approximate.
                  </div>
                  <button type="button" onClick={() => setTab('workspace')} className="py-1! px-[0.6rem]! border! border-[color:var(--muse-line)]! rounded-[0.35rem]! bg-[color:var(--muse-surface)]! muse-c-forest muse-fs-xs font-semibold! cursor-pointer! whitespace-nowrap!">Open workspace →</button>
                </>
              ) : (
                <div className="muse-c-faint muse-fs-sm">
                  Select a school pin on the map to see its straight-line distance from {home.name}.
                </div>
              )}
            </div>
          </aside>
        </div>
      ) : !selected ? (
        <p className="muse-kpi-sub">No schools in the current view. Adjust the filters above.</p>
      ) : (
        <div>
          {/* School selector + header */}
          <PageControls>
            <label className="muse-kpi-sub inline-flex items-center gap-2">
              School
              <select value={selected.id} onChange={(e) => setSelectedId(e.target.value)} className="muse-select">
                {schools.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </label>
          </PageControls>
          <div className="flex flex-wrap gap-3 items-end mb-[0.9rem]!">
            <div className="muse-card-title m-0!">{selected.name}</div>
            <div className="pb-[0.15rem]"><StatusPill status={selected.status} /></div>
            <div className="ml-auto! text-right muse-c-soft muse-fs-xs pb-[0.15rem]">
              {selected.segmentLabel}<br />{selected.location}
            </div>
          </div>

          {/* Sub-tabs */}
          <div className="flex gap-[0.3rem] border-b border-b-[color:var(--muse-line)] mb-4! flex-wrap">
            <SubTabButton active={sub === 'needs'} onClick={() => setSub('needs')}>Needs</SubTabButton>
            <SubTabButton active={sub === 'comms'} onClick={() => setSub('comms')}>Communications</SubTabButton>
            <SubTabButton active={sub === 'links'} onClick={() => setSub('links')}>Site &amp; recipes</SubTabButton>
            <SubTabButton active={sub === 'quote'} onClick={() => setSub('quote')}>Quote of service</SubTabButton>
            <SubTabButton active={sub === 'sow'} onClick={() => setSub('sow')}>Scope of work</SubTabButton>
          </div>

          {sub === 'needs' && <NeedsPanel school={selected} />}
          {sub === 'comms' && <CommsPanel school={selected} />}
          {sub === 'links' && <LinksPanel school={selected} />}
          {sub === 'quote' && <QuotePanel key={selected.id} school={selected} defaults={quoteDefaults} />}
          {sub === 'sow' && <SowPanel school={selected} defaults={quoteDefaults} />}
        </div>
      )}
    </div>
  );
}

// ── Needs ──────────────────────────────────────────────────────────────────
function NeedsPanel({ school }: { school: ClientSchool }) {
  const rows: Array<[string, string]> = [
    ['Enrollment', school.studentsRaw || 'Unknown'],
    ['Grades served', school.grades || '—'],
    ['Educational model', school.model || '—'],
    ['Current food program', school.foodProgram || '—'],
    ['Parent-pay model', school.parentPay || '—'],
  ];
  return (
    <>
      <div className="muse-card-title">What this school needs from the kitchen</div>
      <div className="border border-[color:var(--muse-line)] rounded-[0.5rem] overflow-hidden max-w-152">
        {rows.map(([k, v], i) => (
          <div key={k} className={`flex gap-4 py-[0.55rem] px-[0.8rem] ${(i % 2 ? 'bg-[color:var(--muse-surface-2)]' : 'bg-transparent')}`}>
            <div className="flex-[0_0_12rem] muse-c-faint muse-fs-xs">{k}</div>
            <div className="muse-c-ink muse-fs-sm">{v}</div>
          </div>
        ))}
      </div>
      <p className="muse-kpi-sub mt-2 max-w-152!">
        The fields above come from the prospect list. Meals per day, menu preferences, allergen
        constraints, and delivery cadence are defined with the school and captured here once the CRM
        data store lands. Use the Quote of service tab to model volume and value from enrollment.
      </p>
    </>
  );
}

// ── Communications ───────────────────────────────────────────────────────────
function CommsPanel({ school }: { school: ClientSchool }) {
  return (
    <div className="flex flex-wrap gap-[1.2rem]">
      <div className="flex-[1_1_20rem] min-w-64">
        <div className="muse-card-title">Timeline</div>
        <ul className="list-none p-0 m-0! border-l-2 border-l-[color:var(--muse-line)]">
          <TimelineItem label="First contact" value={school.firstContact || 'Not recorded'} />
          <TimelineItem label="Current status" value={school.status} />
        </ul>
        <p className="muse-kpi-sub mt-2 max-w-104!">
          Logging calls, emails, and sales notes here becomes available with the CRM data store.
          Nothing is editable in this version.
        </p>
      </div>
      <div className="flex-[0_0_18rem] min-w-60">
        <div className="muse-card-title">Contact</div>
        <div className="border border-[color:var(--muse-line)] rounded-[0.5rem] py-[0.8rem] px-[0.9rem] bg-[color:var(--muse-surface-2)] muse-fs-sm leading-[1.7]">
          <div className="font-semibold">{school.pointOfContact || '—'}</div>
          {school.phone && <div><a className="muse-link" href={`tel:${school.phone.replace(/[^0-9+]/g, '')}`}>{school.phone}</a></div>}
          {school.email && <div><a className="muse-link" href={`mailto:${school.email}`}>{school.email}</a></div>}
          {school.website && <div><a className="muse-link" href={`https://${school.website.replace(/^https?:\/\//, '')}`} target="_blank" rel="noopener noreferrer">{school.website}</a></div>}
        </div>
      </div>
    </div>
  );
}

function TimelineItem({ label, value }: { label: string; value: string }) {
  return (
    <li className="relative pt-0 pr-0 pb-[0.9rem] pl-4">
      <span className="absolute left-[-5px] top-[0.35rem] w-[8px] h-[8px] rounded-full bg-[color:var(--muse-forest)]" />
      <div className="muse-fs-xs muse-c-faint">{label}</div>
      <div className="muse-fs-base muse-c-ink">{value}</div>
    </li>
  );
}

// ── Site & recipes (the prospect's links) ───────────────────────────────────
function LinksPanel({ school }: { school: ClientSchool }) {
  const { siteId, recipeCodes, byRef, canEdit, setSite, addRecipe, removeRecipe } = useProspectLinks(school.id);
  const { resolved } = useScenario();
  const site = siteId ? byRef[entityRef('site', siteId)] ?? null : null;

  return (
    <div className="max-w-184">
      <SectionSave sections={['sales']} title="this prospect's links" />

      <div className="muse-card-title mt-[0.9rem]!">Served from</div>
      <EntityPicker
        kinds={['site']}
        linked={site}
        canEdit={canEdit}
        label="site"
        ariaLabel={`Link ${school.name} to a delivery site`}
        placeholder="Search site name, type, county…"
        onLink={setSite}
      />
      <p className="muse-kpi-sub mt-2">
        The delivery site carries the service window and the outbound leg. A site linked to this
        school on Sites &amp; Delivery is the same record seen from the other side.
      </p>

      <div className="muse-card-title mt-[1.2rem]!">Recipes quoted</div>
      {recipeCodes.length === 0 ? (
        <p className="muse-kpi-sub mt-0!">None linked. The quote then carries no food cost.</p>
      ) : (
        <div className="border border-[color:var(--muse-line)] rounded-[0.5rem] overflow-hidden mb-[0.6rem]!">
          {recipeCodes.map((code, i) => {
            const r = byRef[entityRef('recipe', code)];
            const lib = resolved.recipes.find((x) => x.code === code);
            const cost = lib ? costRecipe(lib, resolved.assumptions.yield.shrinkAllowance.value).totalFoodCostPerPortion : null;
            return (
              <div key={code} className={`flex items-center gap-[0.8rem] py-[0.55rem] px-[0.8rem] ${(i % 2 ? 'bg-[color:var(--muse-surface-2)]' : 'bg-transparent')}`}>
                <div className="flex-1">
                  <div className="font-medium muse-fs-sm">{r?.name ?? code}</div>
                  <div className="muse-fs-xs muse-c-faint">{r?.subtitle ?? code}</div>
                </div>
                <div className="muse-fs-sm tabular-nums">
                  {cost !== null ? `${money(cost, 4)} food / portion` : <span className="muse-c-faint">not costed in this model</span>}
                </div>
                {canEdit ? (
                  <button type="button" className="muse-btn muse-fs-2xs" onClick={() => removeRecipe(code)}>Remove</button>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
      <EntityPicker
        kinds={['recipe']}
        linked={null}
        canEdit={canEdit}
        emptyText=""
        addLabel="Add a recipe"
        ariaLabel={`Add a recipe quoted to ${school.name}`}
        placeholder="Search recipe name, code, category…"
        onLink={(code) => { if (code) addRecipe(code); }}
      />
      <p className="muse-kpi-sub mt-2">
        Food cost per portion comes from the open forecast for each recipe quoted, so the Quote of service
        tab shows margin over food cost rather than revenue alone. Links are part of the scenario.
      </p>
    </div>
  );
}

// ── Quote of service (live what-if) ──────────────────────────────────────────
function QuotePanel({ school, defaults }: { school: ClientSchool; defaults: Props['quoteDefaults'] }) {
  const [students, setStudents] = useState<number>(school.students ?? 0);
  const [participation, setParticipation] = useState<number>(50); // %
  const [pricePerMeal, setPricePerMeal] = useState<number>(defaults.pricePerMeal);
  const [servingDays, setServingDays] = useState<number>(defaults.servingDays);

  const r = computeQuote({ students, participation: participation / 100, pricePerMeal, servingDays });

  // Food cost comes from the recipes linked to this prospect, through the live
  // model. With none linked there is no cost to show, and the quote stays revenue.
  const { recipeCodes, byRef } = useProspectLinks(school.id);
  const { resolved } = useScenario();
  const costed = recipeCodes
    .map((code) => ({
      code,
      name: byRef[entityRef('recipe', code)]?.name ?? code,
      cost: (() => { const lib = resolved.recipes.find((x) => x.code === code); return lib ? costRecipe(lib, resolved.assumptions.yield.shrinkAllowance.value).totalFoodCostPerPortion : null; })(),
    }))
    .filter((x) => x.cost !== null) as { code: string; name: string; cost: number }[];
  const avgFoodCost = costed.length > 0 ? costed.reduce((t, x) => t + x.cost, 0) / costed.length : null;

  return (
    <div className="flex flex-wrap gap-6">
      <div className="flex-[1_1_18rem] min-w-60">
        <div className="muse-card-title">Inputs</div>
        <NumField label="Enrollment" value={students} onChange={setStudents} />
        <div className="my-[0.7rem]! mx-0!">
          <div className="flex justify-between muse-fs-xs muse-c-soft">
            <span>Assumed participation</span><span>{participation}%</span>
          </div>
          <input type="range" min={0} max={100} step={5} value={participation} onChange={(e) => setParticipation(Number(e.target.value))} className="w-full!" />
        </div>
        <NumField label="Price per meal ($)" value={pricePerMeal} onChange={setPricePerMeal} step={0.25} />
        <NumField label="Serving days / year" value={servingDays} onChange={setServingDays} />
        <p className="muse-kpi-sub mt-2">
          Defaults from School lunches in {defaults.forecastLabel ? <>the open forecast, {defaults.forecastLabel}</> : 'plan defaults'} (${defaults.pricePerMeal}/meal, {defaults.servingDays} days).
          Adjust the inputs — figures recompute live.
        </p>
      </div>

      <div className="flex-[1_1_20rem] min-w-68">
        <div className="muse-card-title">Quote of service — draft</div>
        <div className="border border-[color:var(--muse-line)] rounded-[0.5rem] overflow-hidden">
          <div className="py-[0.8rem] px-[0.9rem] bg-[color:var(--muse-surface-2)] border-b border-b-[color:var(--muse-line)]">
            <div className="font-semibold">{school.name}</div>
            <div className="muse-fs-xs muse-c-faint">{school.location}</div>
          </div>
          <QuoteRow label="Estimated meals / day" value={num(r.mealsPerDay)} />
          <QuoteRow label="Serving days / year" value={num(servingDays)} />
          <QuoteRow label="Estimated annual meals" value={num(r.annualMeals)} />
          <QuoteRow label="Price per meal" value={money(r.perMealValue, 2)} />
          <QuoteRow label="Estimated monthly value" value={money(r.monthlyValue, 0)} />
          <QuoteRow label="Estimated annual value" value={money(r.annualValue, 0)} strong />
          {avgFoodCost !== null ? (
            <>
              <QuoteRow
                label={costed.length === 1 ? `Food cost / portion — ${costed[0].name}` : `Food cost / portion — mean of ${costed.length} recipes`}
                value={money(avgFoodCost, 4)}
              />
              <QuoteRow label="Over food cost / meal" value={money(pricePerMeal - avgFoodCost, 2)} />
              <QuoteRow label="Over food cost / year" value={money((pricePerMeal - avgFoodCost) * r.annualMeals, 0)} strong />
            </>
          ) : null}
        </div>
        <p className="muse-kpi-sub mt-2">
          Draft — not saved. Estimates derived from the inputs at left; not a binding offer.
          {avgFoodCost === null
            ? ' Link the recipes quoted on the Site & recipes tab to carry food cost into the quote.'
            : ' Food cost is from the open forecast for the linked recipes; it covers ingredients only, not labor, packaging, delivery, or overhead.'}
        </p>
      </div>
    </div>
  );
}

function NumField({ label, value, onChange, step = 1 }: { label: string; value: number; onChange: (n: number) => void; step?: number }) {
  return (
    <label className="block! muse-fs-sm mb-2!">
      <div className="muse-kpi-label">{label}</div>
      <input type="number" value={Number.isFinite(value) ? value : 0} step={step} min={0}
        onChange={(e) => onChange(Number(e.target.value))} className="py-[0.4rem]! px-[0.6rem]! border! border-[color:var(--muse-line)]! rounded-[0.4rem]! bg-[color:var(--muse-surface)]! muse-c-ink muse-fs-sm w-full!" />
    </label>
  );
}

function QuoteRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between py-2 px-[0.9rem] border-b border-b-[color:var(--muse-line)] ${(strong ? 'bg-[color:var(--muse-surface-2)]' : 'bg-transparent')}`}>
      <span className="muse-c-soft muse-fs-sm">{label}</span>
      <span className={`tabular-nums ${(strong ? 'font-bold' : 'font-medium')}`}>{value}</span>
    </div>
  );
}

// ── Scope of work (draft) ────────────────────────────────────────────────────
function SowPanel({ school, defaults }: { school: ClientSchool; defaults: { pricePerMeal: number; servingDays: number } }) {
  return (
    <div className="max-w-184">
      <div className="muse-card-title">Scope of work — draft</div>
      <div className="border border-[color:var(--muse-line)] rounded-[0.5rem] py-[1.1rem] px-[1.3rem] leading-[1.6] muse-fs-base">
        <SowSection title="1. Parties">
          <strong>Provider:</strong> Muse Kitchen (commissary). <strong>Client:</strong>{' '}
          {school.name}, {school.location}.
        </SowSection>
        <SowSection title="2. Program scope">
          Prepared meal service for a {school.segmentLabel.toLowerCase()} serving grades {school.grades || '—'}
          {school.students ? `, approximately ${num(school.students)} students` : ''}. Current food
          program on record: {school.foodProgram || '—'} ({school.parentPay || 'payment model TBD'}).
        </SowSection>
        <SowSection title="3. Deliverables">
          Cook-chill prepared meals produced at the commissary, blast-chilled, delivered on a cadence
          agreed with the school, and reheated on site. Menu, portion size, allergen requirements, and
          delivery schedule to be confirmed with the school.
        </SowSection>
        <SowSection title="4. Food safety & compliance">
          HACCP-based food-safety plan, two-stage cooling with logged CCPs, and allergen changeover
          controls. Documentation available to the school on request.
        </SowSection>
        <SowSection title="5. Term & service window">
          Service window aligned to the school calendar (default {defaults.servingDays} serving days /
          year). Term, start date, and renewal to be defined with the school.
        </SowSection>
        <SowSection title="6. Pricing basis">
          Per-meal pricing (default reference ${defaults.pricePerMeal}/meal). See the Quote of service
          tab for a volume and value estimate. Final pricing subject to menu, volume, and delivery terms.
        </SowSection>
      </div>
      <p className="muse-kpi-sub mt-2">
        Draft — not saved. A working scope-of-work statement generated from the prospect record and the
        kitchen&apos;s operating model; confirm all figures and terms with the school before issuing.
      </p>
    </div>
  );
}

function SowSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-[0.9rem]!">
      <div className="font-semibold mb-[0.2rem]!">{title}</div>
      <div className="muse-c-soft">{children}</div>
    </div>
  );
}

// ── Shared bits ──────────────────────────────────────────────────────────────
function StatusPill({ status }: { status: string }) {
  const c = statusColors(status);
  return (
    <span className="inline-block py-[0.1rem] px-2 rounded-full muse-fs-xs font-semibold whitespace-nowrap" style={{ background: c.bg, color: c.fg, border: `1px solid ${c.border}` }}>
      {status}
    </span>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active}
      className={`py-[0.4rem]! px-[1.15rem]! rounded-[0.45rem]! muse-fs-sm tracking-[0.01em]! cursor-pointer! [transition:background_120ms_ease,color_120ms_ease]! ${(active ? 'border! border-[color:transparent]!' : 'border! border-[color:rgba(255,255,255,0.45)]!')} ${(active ? 'bg-[color:var(--muse-ink-strong)]!' : 'bg-[color:rgba(255,255,255,0.12)]!')} ${(active ? 'muse-c-forest' : 'text-[rgba(255,255,255,0.92)]!')} ${(active ? 'font-bold!' : 'font-semibold!')}`} style={{ boxShadow: active ? '0 1px 3px rgba(0,0,0,0.28)' : 'none' }}>
      {children}
    </button>
  );
}

function SubTabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick}
      className={`py-[0.45rem]! px-[0.9rem]! border-0! bg-none! muse-fs-sm cursor-pointer! mb-[-1px]! ${(active ? 'border-b-2! border-b-[color:var(--muse-forest)]!' : 'border-b-2! border-b-[color:transparent]!')} ${(active ? 'muse-c-ink' : 'muse-c-faint')} ${(active ? 'font-semibold!' : 'font-medium!')}`}>
      {children}
    </button>
  );
}

function fmtMiles(mi: number): string {
  return mi < 100 ? mi.toFixed(1) : mi.toFixed(0);
}
