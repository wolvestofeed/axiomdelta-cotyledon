'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { money, num } from './ui';
import { useLinkedSuppliers } from './useLinkedSuppliers';
import { generatePurchaseOrders } from '../_lib/catalog-actions';
import { buildDraftPurchaseOrders, matchCatalogLine, type CatalogLine, type RequirementLine } from '../_engine/catalog';
import { orderByDate } from '../_engine/net-requirements';
import { useScenario } from '../_state/scenario-store';

/**
 * Turn a production requirement into purchase orders — one per supplier, grouped
 * by the supplier each recipe line is linked to.
 *
 * The requirement comes from portions PRODUCED, not the forecast: whole-batch
 * production is what you actually have to buy for. The caller computes it —
 * a single recipe run, or a production day merged across every recipe on it
 * (Roadmap H4) — and passes the case-rounded lines. Each line is priced off the
 * supplier's own catalog where the item matches, and off the recipe's reference
 * cost otherwise; the draft states which, because a price from a real sheet and a
 * placeholder are not the same claim.
 *
 * Generating writes the orders down as documents. From that point they no longer
 * move with the model.
 */
export function PurchaseOrderGenerator({
  canEdit,
  requirement,
  portionsProduced,
  defaultDate,
  title = 'Purchase orders for this run',
  needBy,
  today,
  summary,
}: {
  canEdit: boolean;
  /** Case-rounded requirement lines across the recipes produced — the NET, after stock and open orders. */
  requirement: RequirementLine[];
  portionsProduced: number;
  /** The production date the order buys for; defaults to today. */
  defaultDate?: string;
  title?: string;
  /** Per ingredient, the first production day with a shortfall; with the catalog lead time it gives the order-by date. */
  needBy?: Record<string, string>;
  today?: string;
  /** Replaces the portions line under the title. */
  summary?: string;
}) {
  const router = useRouter();
  const { resolved } = useScenario();
  const [orderedFor, setOrderedFor] = useState(() => defaultDate ?? new Date().toISOString().slice(0, 10));
  const [catalogs, setCatalogs] = useState<Record<string, CatalogLine[]>>({});
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const links = resolved.sustainability.ingredientSupplier;
  const suppliers = useLinkedSuppliers(links);
  const supplierIds = useMemo(() => [...new Set(Object.values(links))].sort().join(','), [links]);

  // The catalogs of exactly the suppliers in play; nothing else is fetched.
  useEffect(() => {
    if (!supplierIds) return;
    let cancelled = false;
    fetch(`/muse/suppliers/catalog?ids=${encodeURIComponent(supplierIds)}`)
      .then((r) => (r.ok ? r.json() : { catalogs: {} }))
      .then((j: { catalogs: Record<string, CatalogLine[]> }) => {
        if (!cancelled) setCatalogs(j.catalogs);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [supplierIds]);

  const built = useMemo(
    () =>
      buildDraftPurchaseOrders(
        requirement,
        links,
        Object.fromEntries(Object.entries(suppliers).map(([id, s]) => [id, { id: s.id, name: s.name }])),
        supplierIds ? catalogs : {},
        orderedFor,
      ),
    [requirement, links, suppliers, catalogs, supplierIds, orderedFor],
  );

  // Lead time from the supplier's catalog line, when it matched; order-by is need-by less the lead.
  const leadFor = (supplierId: string, ingredient: string): number | null => {
    const m = matchCatalogLine(ingredient, (supplierId ? catalogs[supplierId] : undefined) ?? []);
    return m?.leadTimeDays ?? null;
  };
  const orderBy = (supplierId: string, ingredient: string): { lead: number | null; by: string | null; late: boolean } => {
    const lead = leadFor(supplierId, ingredient);
    const need = needBy?.[ingredient] ?? null;
    const by = need ? orderByDate(need, lead) : null;
    return { lead, by, late: Boolean(by && today && by < today) };
  };
  const late = built.orders.flatMap((o) => o.lines.filter((l) => orderBy(o.supplierId, l.ingredient).late));
  const total = built.orders.reduce((s, o) => s + o.subtotalCents, 0);
  const fromCatalog = built.orders.flatMap((o) => o.lines).filter((l) => l.pricedFrom === 'catalog').length;
  const allLines = built.orders.reduce((s, o) => s + o.lines.length, 0);
  const flagged = built.orders.flatMap((o) => o.lines).filter((l) => l.seasonalityNote || l.minimumNote);

  function generate() {
    start(async () => {
      setMsg(null);
      const res = await generatePurchaseOrders({
        orderedFor,
        orders: built.orders.map((o) => ({
          supplierId: o.supplierId,
          lines: o.lines.map((l) => ({
            ingredient: l.ingredient,
            item: l.item,
            supplierItemId: l.supplierItemId,
            qty: l.qty,
            unit: l.unit,
            packSize: l.packSize,
            cases: l.cases,
            unitPriceCents: l.unitPriceCents,
            extendedCents: l.extendedCents,
          })),
        })),
      });
      if (res.ok) {
        setMsg({
          kind: 'ok',
          text: `Raised ${res.created.length} order(s): ${res.created.map((c) => `${c.poNumber} (${c.supplierName})`).join(', ')}.`,
        });
        router.refresh();
      } else setMsg({ kind: 'err', text: res.error });
    });
  }

  return (
    <div className="muse-card mt-4">
      <div className="muse-card-title">{title}</div>

      <div className="flex gap-4 flex-wrap items-end mb-[0.8rem]!">
        <label className="muse-fs-sm">
          <div className="muse-kpi-label">Production date this buys for</div>
          <input type="date" className="muse-input mt-1!" value={orderedFor} onChange={(e) => setOrderedFor(e.target.value)} />
        </label>
        <div className="muse-kpi-sub pb-[0.4rem]!">
          {summary ?? `${num(Math.round(portionsProduced))} portions produced`} · {built.orders.length} supplier(s) · {allLines} line(s)
          {allLines > 0 ? ` · ${fromCatalog} priced from a catalog` : ''}
          {late.length > 0 ? ` · ${late.length} line(s) past their order-by date` : ''}
        </div>
      </div>

      {built.orders.length === 0 ? (
        <p className="muse-kpi-sub mt-0!">
          No recipe line is linked to a supplier, so there is nothing to order against. Link lines on{' '}
          <Link className="muse-link" href="/muse/recipes">Recipes</Link> or{' '}
          <Link className="muse-link" href="/muse/procurement">Procurement</Link>.
        </p>
      ) : (
        <>
          {built.orders.map((o) => (
            <div key={o.supplierId} className="border border-[color:var(--muse-line)] rounded-[0.5rem] mb-[0.8rem]! overflow-hidden">
              <div className="flex justify-between items-baseline gap-4 py-[0.55rem] px-[0.85rem] bg-[color:var(--muse-surface-2)] border-b border-b-[color:var(--muse-line)] flex-wrap">
                <Link className="muse-link font-semibold!" href={`/muse/suppliers/${o.supplierId}`}>{o.supplierName}</Link>
                <span className="tabular-nums font-semibold">{money(o.subtotalCents / 100)}</span>
              </div>
              <div className="muse-scroll-x">
                <table className="muse-table">
                  <thead>
                    <tr><th>Recipe line</th><th>Item</th><th className="num">Qty</th><th className="num">Cases</th><th className="num">Unit price</th><th>Priced from</th><th className="num">Extended</th>{needBy && <th>Need by · lead · order by</th>}</tr>
                  </thead>
                  <tbody>
                    {o.lines.map((l) => (
                      <tr key={l.ingredient}>
                        <td className="font-medium!">{l.ingredient}</td>
                        <td className="muse-c-soft">
                          {l.item}
                          {l.seasonalityNote ? <div className="muse-fs-2xs muse-c-placeholder">{l.seasonalityNote}</div> : null}
                          {l.minimumNote ? <div className="muse-fs-2xs muse-c-placeholder">{l.minimumNote}</div> : null}
                        </td>
                        <td className="num">{num(l.qty, 2)} {l.unit}</td>
                        <td className="num">{l.cases}</td>
                        <td className="num">{money(l.unitPriceCents / 100, 4)}</td>
                        <td>
                          <span className={l.pricedFrom === 'catalog' ? 'muse-pill ok' : 'muse-pill'}>
                            {l.pricedFrom === 'catalog' ? 'Their catalog' : 'Recipe reference'}
                          </span>
                        </td>
                        <td className="num">{money(l.extendedCents / 100)}</td>
                        {needBy && (() => { const ob = orderBy(o.supplierId, l.ingredient); const need = needBy[l.ingredient]; return (
                          <td className={`muse-fs-xs ${(ob.late ? 'muse-c-over' : 'muse-c-soft')}`}>
                            {need ?? '—'}{ob.lead === null ? ' · lead time not on the catalog' : ` · ${ob.lead} d · order by ${ob.by}`}{ob.late ? ' · past' : ''}
                          </td>
                        ); })()}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}

          <div className="flex gap-3 items-center flex-wrap">
            <strong className="tabular-nums">Total across {built.orders.length} order(s): {money(total / 100)}</strong>
            {canEdit ? (
              <button type="button" className="muse-btn primary" onClick={generate} disabled={pending}>
                {pending ? 'Raising…' : `Generate ${built.orders.length} purchase order(s)`}
              </button>
            ) : (
              <span className="muse-kpi-sub">Raising an order is a super-admin action.</span>
            )}
            {msg ? <span className={`muse-kpi-sub ${(msg.kind === 'ok' ? 'muse-c-sourced' : 'muse-c-over')}`}>{msg.text}</span> : null}
          </div>
        </>
      )}

      {built.unassigned.length > 0 ? (
        <p className="muse-kpi-sub mt-2 muse-c-placeholder">
          Not on any order — no supplier linked: {built.unassigned.map((u) => u.ingredient).join(', ')}.
        </p>
      ) : null}
      {flagged.length > 0 ? (
        <p className="muse-kpi-sub mt-2">
          {flagged.length} line(s) carry a season or minimum-order note. The quantity is not adjusted —
          whether to order short or out of season is the operator&apos;s call, so the platform states the
          condition and leaves the number alone.
        </p>
      ) : null}
      <p className="muse-kpi-sub mt-2">
        Orders are raised as drafts and appear on each supplier&apos;s own page, where they move to
        issued, received and closed. A raised order writes its prices down and stops tracking the model.
      </p>
    </div>
  );
}
