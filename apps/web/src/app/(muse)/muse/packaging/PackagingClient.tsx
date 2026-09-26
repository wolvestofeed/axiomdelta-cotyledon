'use client';

import { Fragment, useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card, Kpi, money, num } from '../_components/ui';
import { InlineNumber, InlineText } from '../_components/InlineCells';
import { PACKAGE_TEMPERATURES, type PackageDef, type PackageTemperature } from '../_data/packaging';
import { PACKAGE_COST_BASIS_LABELS, PACKAGE_TEMPERATURE_LABELS, packageUnitCost, packagingOrder } from '../_engine/packaging';
import { useScenario } from '../_state/scenario-store';
import { createPackage, deletePackage, updatePackage } from '../_lib/packaging-actions';

type PackagePatch = Partial<Omit<PackageDef, 'id' | 'source'>>;
type ActionResult = { ok: true } | { ok: false; error: string };

/** Columns in an open group: package, channels, hot/cold, material, size, end of use, rank, manual cost, supplier item, units / pack, cost in force, recipes. */
const COLS = 12;

export function PackagingClient({ canEdit }: { canEdit: boolean }) {
  const { resolved } = useScenario();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // One channel group open at a time; all collapsed by default.
  const [open, setOpen] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ name: string; channel: number | 0 }>({ name: '', channel: 1 });

  const lib = resolved.packaging;
  const channelShort = (phase: number) => (resolved.phases.find((p) => p.phase === phase)?.market ?? `Channel ${phase}`).split(' ')[0];

  const usage = useMemo(() => {
    const m: Record<string, number> = {};
    for (const p of lib.picks) m[p.packageId] = (m[p.packageId] ?? 0) + 1;
    return m;
  }, [lib.picks]);

  const groups = useMemo(() => {
    const sorted = [...lib.packages].sort(packagingOrder);
    const out = resolved.phases.map((p) => ({ key: `channel-${p.phase}`, label: p.market, rows: sorted.filter((x) => x.channels.includes(p.phase)) }));
    out.push({ key: 'channel-none', label: 'No channel set', rows: sorted.filter((x) => x.channels.length === 0) });
    return out.filter((g) => g.rows.length > 0);
  }, [lib.packages, resolved.phases]);

  const bases = lib.packages.map((p) => packageUnitCost(p, lib.supplierItems).basis);
  const recipesWithPicks = new Set(lib.picks.map((p) => p.recipeCode)).size;

  const run = (fn: () => Promise<ActionResult>, after?: () => void) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) setError(r.error);
      else {
        setError(null);
        after?.();
        router.refresh();
      }
    });
  const save = (id: string, patch: PackagePatch) => {
    if (canEdit) run(() => updatePackage({ id, ...patch }));
  };
  const add = () => {
    if (!draft.name.trim()) return;
    run(() => createPackage({ name: draft.name, channels: draft.channel ? [draft.channel] : [] }), () => setDraft((d) => ({ ...d, name: '' })));
  };

  const editable = canEdit && !pending;

  return (
    <>
      <div className="grid gap-3 muse-autofit-11">
        <Kpi value={num(lib.packages.length)} label="Packages in the library" />
        <Kpi value={num(bases.filter((b) => b !== 'none').length)} label="With a cost on file" sub={`${num(bases.filter((b) => b === 'supplier').length)} at a supplier price`} />
        <Kpi value={num(recipesWithPicks)} label="Recipes with packages picked" sub={`of ${num(resolved.recipes.length)} recipes`} />
      </div>

      <Card title="Packaging library" className="mt-4">
        {pending && <p className="muse-kpi-sub mb-2!">Saving…</p>}
        {error && <p className="muse-kpi-sub muse-c-accent mb-2!">{error}</p>}
        <div className="muse-scroll-x">
          <table className="muse-table compact">
            <thead>
              {open ? (
                <tr>
                  <th>Package</th>
                  <th>Channels</th>
                  <th>Hot/Cold</th>
                  <th>Material</th>
                  <th>Size</th>
                  <th>End of use</th>
                  <th className="num">Rank</th>
                  <th className="num">Manual cost</th>
                  <th>Supplier item</th>
                  <th className="num">Units / pack</th>
                  <th className="num">Cost in force</th>
                  <th className="num">Recipes</th>
                </tr>
              ) : (
                <tr><th colSpan={COLS}>Channel</th></tr>
              )}
            </thead>
            <tbody>
              {groups.length === 0 && (
                <tr><td colSpan={COLS} className="muse-c-soft">No packages in the library.</td></tr>
              )}
              {groups.map((g) => {
                const isOpen = open === g.key;
                return (
                  <Fragment key={g.key}>
                    <tr className={`muse-group-row${isOpen ? ' is-open' : ''}`}>
                      <td colSpan={COLS} className="p-0!">
                        <button type="button" className="muse-group-row-btn" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : g.key)}>
                          <span className="font-semibold muse-c-accent-hi">
                            {g.label}
                            <span className="muse-c-soft font-normal ml-[0.6rem]! muse-fs-xs">{num(g.rows.length)} {g.rows.length === 1 ? 'package' : 'packages'}</span>
                          </span>
                          <span className="muse-c-soft muse-fs-xs">{isOpen ? 'Close' : 'Open'}</span>
                        </button>
                      </td>
                    </tr>
                    {isOpen &&
                      g.rows.map((p) => {
                        const unit = packageUnitCost(p, lib.supplierItems);
                        const used = usage[p.id] ?? 0;
                        return (
                          <tr key={`${g.key}:${p.id}`}>
                            <td className="font-medium!">
                              <InlineText value={p.name} minChars={18} disabled={!editable} label="Package name" onCommit={(s) => s && save(p.id, { name: s })} />
                              {p.notes ? <div className="muse-c-faint muse-fs-xs max-w-88">{p.notes}</div> : null}
                              {canEdit && used === 0 && (
                                <button type="button" className="muse-btn mt-[0.3rem]! py-[0.1rem]! px-[0.45rem]! muse-fs-2xs" disabled={pending} onClick={() => run(() => deletePackage({ id: p.id }))}>
                                  Remove
                                </button>
                              )}
                            </td>
                            <td>
                              <div className="flex gap-[0.55rem]">
                                {resolved.phases.map((ph) => (
                                  <label key={ph.phase} className="inline-flex! gap-1! items-center! muse-fs-xs whitespace-nowrap!">
                                    <input
                                      type="checkbox"
                                      checked={p.channels.includes(ph.phase)}
                                      disabled={!editable}
                                      aria-label={`${p.name} on ${ph.market}`}
                                      onChange={(ev) => save(p.id, { channels: ev.target.checked ? [...p.channels, ph.phase] : p.channels.filter((c) => c !== ph.phase) })}
                                    />
                                    {channelShort(ph.phase)}
                                  </label>
                                ))}
                              </div>
                            </td>
                            <td>
                              <select className="muse-input muse-cell-control w-21!" value={p.temperature ?? ''} disabled={!editable} aria-label={`${p.name} hot or cold`} onChange={(ev) => save(p.id, { temperature: (ev.target.value || null) as PackageTemperature | null })}>
                                <option value="">–</option>
                                {PACKAGE_TEMPERATURES.map((t) => <option key={t} value={t}>{PACKAGE_TEMPERATURE_LABELS[t]}</option>)}
                              </select>
                            </td>
                            <td><InlineText value={p.material} minChars={11} disabled={!editable} label={`${p.name} material`} onCommit={(s) => save(p.id, { material: s })} /></td>
                            <td>
                              <span className="inline-flex gap-[0.3rem]">
                                <InlineNumber value={p.sizeValue} nullable step={1} minChars={3} disabled={!editable} label={`${p.name} size`} onCommit={(n) => save(p.id, { sizeValue: n })} />
                                <InlineText value={p.sizeUnit} minChars={4} placeholder="unit" disabled={!editable} label={`${p.name} size unit`} onCommit={(s) => save(p.id, { sizeUnit: s })} />
                              </span>
                            </td>
                            <td><InlineText value={p.endOfUse} minChars={11} disabled={!editable} label={`${p.name} end of use`} onCommit={(s) => save(p.id, { endOfUse: s })} /></td>
                            <td className="num"><InlineNumber value={p.endOfUseRank} nullable step={1} minChars={2} disabled={!editable} label={`${p.name} end-of-use rank`} onCommit={(n) => save(p.id, { endOfUseRank: n === null ? null : Math.max(1, Math.round(n)) })} /></td>
                            <td className="num"><InlineNumber value={p.manualUnitCost} nullable step={0.01} minChars={5} disabled={!editable} label={`${p.name} manual unit cost`} onCommit={(n) => save(p.id, { manualUnitCost: n })} /></td>
                            <td>
                              <select className="muse-input muse-cell-control w-60!" value={p.supplierItemId ?? ''} disabled={!editable} aria-label={`${p.name} supplier catalog item`} onChange={(ev) => save(p.id, { supplierItemId: ev.target.value || null })}>
                                <option value="">No supplier item</option>
                                {lib.supplierItems.map((i) => (
                                  <option key={i.id} value={i.id}>
                                    {i.item}
                                    {i.supplierName ? ` — ${i.supplierName}` : ''}
                                    {i.unitPrice !== null ? ` · ${money(i.unitPrice)} / ${i.priceBasis ?? 'unit'}` : ''}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="num"><InlineNumber value={p.supplierUnitsPerPack} step={1} minChars={3} disabled={!editable} label={`${p.name} units per supplier pack`} onCommit={(n) => n !== null && n > 0 && save(p.id, { supplierUnitsPerPack: n })} /></td>
                            <td className="num">
                              {unit.cost === null ? <span className="muse-c-soft">—</span> : money(unit.cost, 4)}
                              <div className="muse-c-faint muse-fs-xs">{PACKAGE_COST_BASIS_LABELS[unit.basis]}</div>
                            </td>
                            <td className="num">{num(used)}</td>
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
            <input className="muse-input min-w-64!" placeholder="Package name" value={draft.name} aria-label="New package name" onChange={(ev) => setDraft((d) => ({ ...d, name: ev.target.value }))} />
            <select className="muse-input muse-cell-control w-48!" value={draft.channel} aria-label="New package channel" onChange={(ev) => setDraft((d) => ({ ...d, channel: Number(ev.target.value) }))}>
              {resolved.phases.map((p) => <option key={p.phase} value={p.phase}>{p.market}</option>)}
              <option value={0}>No channel set</option>
            </select>
            <button type="button" className="muse-btn" disabled={pending || !draft.name.trim()} onClick={add}>Add package</button>
          </div>
        )}
        <p className="muse-kpi-sub mt-2">
          Cost in force is the linked supplier catalog item&rsquo;s price when one is on file — per each, or per pack ÷ units per pack — else the manual cost. Groups are channels; a package on more than one channel is listed under each. Within a group, packages sort hot, cold, then unset; by material; by size; and by end-of-use rank, unranked last. Recipes pick their packages on <Link className="muse-link" href="/muse/recipes">Recipes</Link>, and each recipe&rsquo;s packaging per meal is the sum of its picks at the cost here — zero for a package with no cost entered. Packing machines are on <Link className="muse-link" href="/muse/equipment">Equipment</Link>. Supplier prices come from catalogs imported on <Link className="muse-link" href="/muse/suppliers">Suppliers</Link>.
          {!canEdit && ' Editing is limited to super admins.'}
        </p>
      </Card>
    </>
  );
}
