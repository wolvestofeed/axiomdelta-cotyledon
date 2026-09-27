'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { money, num } from '@/components/ui';
import { CatalogImport } from '@/components/CatalogImport';
import { setPurchaseOrderStatus, deletePurchaseOrder, deleteCatalogItem, setCatalogItemApproval, setCatalogPrice, deleteCatalogPrice } from '@/server/catalog-actions';
import {
  availabilityLabel,
  isAvailableInMonth,
  nextPoStatuses,
  priceInForceOn,
  CATALOG_STATUS_LABEL,
  PRICE_BASES,
  PO_STATUS_LABEL,
  type CatalogLine,
  type PoStatus,
} from '@/engine/catalog';
import type { PoView } from '@/server/supplier-catalog';
import { setSupplierTerms } from '@/server/working-capital-actions';
import { PAYMENT_TERMS_LABELS, SUPPLIER_PAYMENT_TERMS, type PaymentTerms } from '@/data/working-capital';

/**
 * The operation's working record, in sections: what we know about them, the
 * terms we agreed, the seasonal catalog we imported from their sheet, the orders
 * we raised, and the lines of our own model that point at them.
 *
 * Everything here except the compiled directory fields is operator data — the
 * page says which is which rather than presenting them as one uniform record.
 */

interface SupplierView {
  id: string;
  name: string;
  source: string;
  certifier: string;
  status: string;
  scopes: { crops: string; livestock: string; wildCrops: string; handling: string };
  products: { crops: string; livestock: string; handling: string };
  city: string;
  county: string;
  state: string;
  zip: string;
  phone: string;
  email: string;
  website: string;
  acres: string;
  types: string[];
  prospectReady: boolean;
  tdaType: string | null;
  region: string;
  dataAsOf: string;
  geoSource: string | null;
  volumeCapacity: string | null;
  wholesaleReadiness: string | null;
  pricing: string | null;
  leadTime: string | null;
  milesFromFarm: number | null;
}

type Tab = 'overview' | 'catalog' | 'orders' | 'model';

export function SupplierDetail({
  supplier,
  catalog,
  orders,
  sources,
  sourcedLines,
  lotsReceived,
  canEdit,
  paymentTerms = null,
  canSetTerms = false,
}: {
  supplier: SupplierView;
  catalog: CatalogLine[];
  orders: PoView[];
  sources: { id: string; title: string }[];
  sourcedLines: string[];
  lotsReceived: string[];
  canEdit: boolean;
  /** The supplier's payment terms on file (Roadmap K3); null = none, no default. */
  paymentTerms?: PaymentTerms | null;
  /** Operators and super admins set terms. */
  canSetTerms?: boolean;
}) {
  const [tab, setTab] = useState<Tab>('overview');

  return (
    <div className="farm-card mt-4">
      <div
        className="flex items-center gap-2 mt-[-1.1rem]! mr-[-1.2rem]! mb-4! ml-[-1.2rem]! py-[0.6rem] px-[0.9rem] bg-[linear-gradient(135deg,var(--farm-forest)_0%,var(--farm-forest-soft)_55%,var(--farm-olive)_150%)] [border-top-left-radius:0.6rem] [border-top-right-radius:0.6rem] flex-wrap"
      >
        <TabButton active={tab === 'overview'} onClick={() => setTab('overview')}>Contact &amp; terms</TabButton>
        <TabButton active={tab === 'catalog'} onClick={() => setTab('catalog')}>
          Catalog{catalog.length > 0 ? ` (${catalog.length})` : ''}
        </TabButton>
        <TabButton active={tab === 'orders'} onClick={() => setTab('orders')}>
          Purchase orders{orders.length > 0 ? ` (${orders.length})` : ''}
        </TabButton>
        <TabButton active={tab === 'model'} onClick={() => setTab('model')}>
          In the model{sourcedLines.length > 0 ? ` (${sourcedLines.length})` : ''}
        </TabButton>
      </div>

      {tab === 'overview' ? (
        <OverviewPanel supplier={supplier} paymentTerms={paymentTerms} canSetTerms={canSetTerms} />
      ) : tab === 'catalog' ? (
        <CatalogPanel supplier={supplier} catalog={catalog} sources={sources} canEdit={canEdit} />
      ) : tab === 'orders' ? (
        <OrdersPanel orders={orders} canEdit={canEdit} />
      ) : (
        <ModelPanel supplier={supplier} sourcedLines={sourcedLines} lotsReceived={lotsReceived} />
      )}
    </div>
  );
}

// ── Contact & terms ─────────────────────────────────────────────────────────

/** A supplier's payment terms (Roadmap K3): no default; a bill against this supplier takes them. */
function TermsControl({ supplierId, supplierName, paymentTerms, canSetTerms }: { supplierId: string; supplierName: string; paymentTerms: PaymentTerms | null; canSetTerms: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [value, setValue] = useState<PaymentTerms | ''>(paymentTerms ?? '');
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="mb-4!">
      <div className="farm-card-title">Payment terms</div>
      {canSetTerms ? (
        <div className="flex flex-wrap gap-2 items-center">
          <select className="farm-select" value={value} onChange={(e) => setValue(e.target.value as PaymentTerms | '')}>
            <option value="">No terms on file</option>
            {SUPPLIER_PAYMENT_TERMS.map((t) => <option key={t} value={t}>{PAYMENT_TERMS_LABELS[t]}</option>)}
          </select>
          <button
            type="button"
            className="farm-btn"
            disabled={pending || value === '' || value === paymentTerms}
            onClick={() =>
              start(async () => {
                const res = await setSupplierTerms({ supplierId, supplierName, paymentTerms: value });
                setMsg(res.ok ? 'Saved.' : res.error);
                if (res.ok) router.refresh();
              })
            }
          >
            Save terms
          </button>
          {msg && <span className="farm-kpi-sub">{msg}</span>}
        </div>
      ) : (
        <p className="farm-kpi-sub">{paymentTerms ? PAYMENT_TERMS_LABELS[paymentTerms] : 'No terms on file'}</p>
      )}
      <p className="farm-kpi-sub mt-2">A supplier bill takes these terms and its due date is the bill date plus them. With none on file, a bill is not recorded.</p>
    </div>
  );
}

function OverviewPanel({ supplier: s, paymentTerms, canSetTerms }: { supplier: SupplierView; paymentTerms: PaymentTerms | null; canSetTerms: boolean }) {
  const tel = s.phone.replace(/[^0-9+]/g, '');
  const pickupPoint = s.website ? `https://${s.website.replace(/^https?:\/\//, '')}` : '';

  return (
    <div className="flex flex-wrap gap-6">
      <div className="flex-[1_1_20rem] min-w-68">
        <div className="farm-card-title">Contact</div>
        <Rows
          rows={[
            ['Operation', s.name],
            ['Phone', s.phone ? <a className="farm-link" href={`tel:${tel}`}>{s.phone}</a> : null],
            ['Email', s.email ? <a className="farm-link" href={`mailto:${s.email}`}>{s.email}</a> : null],
            ['Website', s.website ? <a className="farm-link" href={pickupPoint} target="_blank" rel="noopener noreferrer">{s.website}</a> : null],
            ['Address', [s.city, s.county ? `${s.county} County` : '', s.state, s.zip].filter(Boolean).join(', ')],
            ['Distance', s.milesFromFarm === null ? null : `${s.milesFromFarm.toFixed(0)} miles, straight line`],
            ['Placement', s.geoSource === 'zip' ? 'ZIP-code centroid (town level)' : s.geoSource === 'county' ? 'County centroid' : 'No coordinates on file'],
          ]}
        />

        <div className="farm-card-title mt-[1.2rem]!">Certification — compiled record</div>
        <Rows
          rows={[
            ['Record source', s.source],
            ['Certifier', s.certifier],
            ['Status', s.status],
            ['Crops', s.scopes.crops],
            ['Livestock', s.scopes.livestock],
            ['Handling', s.scopes.handling],
            ['Wild crops', s.scopes.wildCrops],
            ['Prospect channel', s.prospectReady ? s.tdaType ?? 'TDA Farm Fresh' : null],
            ['Acres', s.acres],
            ['Data as of', s.dataAsOf.slice(0, 15)],
          ]}
        />
      </div>

      <div className="flex-[1_1_20rem] min-w-68">
        <TermsControl supplierId={s.id} supplierName={s.name} paymentTerms={paymentTerms} canSetTerms={canSetTerms} />
        <div className="farm-card-title">Terms — operator-entered</div>
        <Rows
          rows={[
            ['Volume capacity', s.volumeCapacity],
            ['Wholesale readiness', s.wholesaleReadiness],
            ['Pricing', s.pricing],
            ['Lead time', s.leadTime],
          ]}
        />
        <p className="farm-kpi-sub mt-2">
          None of these four appear in any public directory. They come from conversations and are
          entered per supplier once engaged; a dash means the conversation has not happened yet.
        </p>

        <div className="farm-card-title mt-[1.2rem]!">Products — as the record states them</div>
        <Rows
          rows={[
            ['Crops', s.products.crops],
            ['Livestock', s.products.livestock],
            ['Handling', s.products.handling],
          ]}
          wrap
        />
        <p className="farm-kpi-sub mt-2">
          This is the certifier&apos;s own product wording, not a price list. What they sell and on what
          terms is the Catalog tab.
        </p>
      </div>
    </div>
  );
}

// ── Catalog ─────────────────────────────────────────────────────────────────

function CatalogPanel({
  supplier,
  catalog,
  sources,
  canEdit,
}: {
  supplier: SupplierView;
  catalog: CatalogLine[];
  sources: { id: string; title: string }[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [onlyInSeason, setOnlyInSeason] = useState(false);
  const [openPrices, setOpenPrices] = useState<string | null>(null);
  const today = new Date().toISOString().slice(0, 10);
  const month = new Date().getUTCMonth() + 1;

  const rows = useMemo(
    () => (onlyInSeason ? catalog.filter((c) => isAvailableInMonth(c.availStartMonth, c.availEndMonth, month)) : catalog),
    [catalog, onlyInSeason, month],
  );

  if (catalog.length === 0) {
    return (
      <>
        <p className="farm-kpi-sub mt-0!">
          No catalog on file. Import the price sheet this operation sends — a pasted spreadsheet or a
          CSV. Until then, a purchase order for them prices off the growPlan&apos;s own reference cost
          rather than their actual price.
        </p>
        {canEdit ? <CatalogImport supplierId={supplier.id} sources={sources} hasExisting={false} /> : null}
      </>
    );
  }

  return (
    <>
      <div className="flex gap-4 items-center flex-wrap mb-[0.6rem]!">
        <label className="farm-fs-sm inline-flex! items-center! gap-[0.4rem]!">
          <input type="checkbox" checked={onlyInSeason} onChange={(e) => setOnlyInSeason(e.target.checked)} />
          Available this month only
        </label>
        <span className="farm-kpi-sub">
          {num(rows.length)} of {num(catalog.length)} lines · {num(catalog.filter((c) => c.status === 'approved').length)} approved,{' '}
          {num(catalog.filter((c) => c.status !== 'approved').length)} candidate
        </span>
      </div>

      <div className="farm-scroll-x">
        <table className="farm-table">
          <thead>
            <tr>
              <th>Item</th><th>Status</th><th>Category</th><th>Variety / breed</th><th>Pack</th><th className="num">Price in force</th>
              <th>Per</th><th className="num">Min order</th><th className="num">Lead</th><th>Available</th>
              <th>Certification</th><th>Origin</th><th>SKU</th><th>Notes</th>{canEdit ? <th /> : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => {
              const inSeason = isAvailableInMonth(c.availStartMonth, c.availEndMonth, month);
              const price = priceInForceOn(c.prices, today);
              return (
                <tr key={c.id}>
                  <td className="font-medium!">{c.item}</td>
                  <td>
                    <span className={c.status === 'approved' ? 'farm-pill ok' : 'farm-pill'}>{CATALOG_STATUS_LABEL[c.status]}</span>
                  </td>
                  <td className="farm-c-soft">{c.category ?? '—'}</td>
                  <td className="farm-c-soft">{c.variety ?? '—'}</td>
                  <td className="farm-c-soft">{c.packSize ?? '—'}</td>
                  <td className="num">
                    {price === null || price.unitPrice === null ? (
                      <span className="farm-c-faint">no price</span>
                    ) : (
                      <>
                        {money(price.unitPrice, price.unitPrice < 1 ? 4 : 2)}
                        <div className="farm-kpi-sub farm-fs-2xs">from {price.effectiveFrom}{c.prices.length > 1 ? ` · ${c.prices.length} on file` : ''}</div>
                      </>
                    )}
                  </td>
                  <td className="farm-c-soft">{price?.priceBasis ?? c.unit}</td>
                  <td className="num">{c.minOrderQty === null ? '—' : `${num(c.minOrderQty, 0)} ${c.unit}`}</td>
                  <td className="num">{c.leadTimeDays === null ? '—' : `${c.leadTimeDays} d`}</td>
                  <td>
                    <span className={inSeason ? 'farm-pill ok' : 'farm-pill'}>
                      {availabilityLabel(c.availStartMonth, c.availEndMonth)}
                    </span>
                  </td>
                  <td className="farm-c-soft farm-fs-xs">{c.certification ?? '—'}</td>
                  <td className="farm-c-soft farm-fs-xs">{c.origin ?? '—'}</td>
                  <td className="farm-mono farm-fs-xs farm-c-faint">{c.sku ?? '—'}</td>
                  <td className="farm-c-soft farm-fs-xs max-w-56!">{c.notes ?? '—'}</td>
                  {canEdit ? (
                    <td className="whitespace-nowrap!">
                      <button
                        type="button"
                        className="farm-btn farm-fs-2xs"
                        disabled={pending}
                        onClick={() => start(async () => { await setCatalogItemApproval({ id: c.id, approved: c.status !== 'approved' }); router.refresh(); })}
                      >
                        {c.status === 'approved' ? 'Set candidate' : 'Approve'}
                      </button>{' '}
                      <button
                        type="button"
                        className="farm-btn farm-fs-2xs"
                        onClick={() => setOpenPrices(openPrices === c.id ? null : c.id)}
                      >
                        Prices
                      </button>{' '}
                      <button
                        type="button"
                        className="farm-btn farm-fs-2xs"
                        disabled={pending}
                        onClick={() => start(async () => { await deleteCatalogItem(c.id); router.refresh(); })}
                      >
                        Remove
                      </button>
                    </td>
                  ) : null}
                </tr>
              );
            })}
            {canEdit && openPrices
              ? (() => {
                  const c = rows.find((x) => x.id === openPrices);
                  return c ? (
                    <tr key={`${c.id}-prices`}>
                      <td colSpan={15} className="bg-[color:var(--farm-surface-2)]!">
                        <PricePanel line={c} onDone={() => router.refresh()} />
                      </td>
                    </tr>
                  ) : null;
                })()
              : null}
          </tbody>
        </table>
      </div>
      <p className="farm-kpi-sub mt-2">
        An availability window that reads as a green pill covers the current month. A line with no
        window recorded shows as year-round, which states the absence rather than implying it was
        checked. Only an APPROVED line prices the plan or a purchase order; a candidate is a quote on
        file. The price shown is the one in force today — a purchase order reads the price in force
        on its own order date.
      </p>
      {canEdit ? <CatalogImport supplierId={supplier.id} sources={sources} hasExisting /> : null}
    </>
  );
}

/**
 * A catalog line's prices, per date. Adding a price for a date that already has
 * one replaces it; every other date stands, so what was in force last season
 * stays readable after this season's sheet lands.
 */
function PricePanel({ line, onDone }: { line: CatalogLine; onDone: () => void }) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [from, setFrom] = useState(() => new Date().toISOString().slice(0, 10));
  const [price, setPrice] = useState('');
  const [basis, setBasis] = useState<string>(line.prices[line.prices.length - 1]?.priceBasis ?? line.unit);

  const rows = [...line.prices].sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? 1 : -1));

  function save() {
    const n = price.trim() === '' ? null : Number(price);
    if (n !== null && !Number.isFinite(n)) {
      setErr('That price could not be read.');
      return;
    }
    start(async () => {
      const res = await setCatalogPrice({
        itemId: line.id,
        effectiveFrom: from,
        unitPrice: n,
        priceBasis: (PRICE_BASES as readonly string[]).includes(basis) ? basis : null,
      });
      if (res.ok) {
        setPrice('');
        setErr(null);
        onDone();
      } else setErr(res.error);
    });
  }

  return (
    <div className="py-[0.6rem] px-[0.2rem]">
      <div className="farm-card-title mb-[0.4rem]!">{line.item} — prices on file</div>
      {rows.length === 0 ? (
        <p className="farm-kpi-sub mt-0!">No price on file. Until one is, this line prices nothing.</p>
      ) : (
        <table className="farm-table mb-[0.6rem]!">
          <thead><tr><th>In force from</th><th className="num">Price</th><th>Per</th><th>Note</th><th /></tr></thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.effectiveFrom}>
                <td className="farm-mono farm-fs-xs">{p.effectiveFrom}</td>
                <td className="num">{p.unitPrice === null ? '—' : money(p.unitPrice, p.unitPrice < 1 ? 4 : 2)}</td>
                <td className="farm-c-soft">{p.priceBasis ?? line.unit}</td>
                <td className="farm-c-soft farm-fs-xs">{p.note ?? '—'}</td>
                <td />
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="flex gap-2 items-end flex-wrap">
        <label className="farm-fs-xs">
          <span className="farm-kpi-label">In force from</span>
          <input type="date" className="farm-input block! mt-1!" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="farm-fs-xs">
          <span className="farm-kpi-label">Price</span>
          <input
            className="farm-input block! mt-1! w-28!"
            inputMode="decimal"
            value={price}
            placeholder="4.85"
            onChange={(e) => setPrice(e.target.value)}
          />
        </label>
        <label className="farm-fs-xs">
          <span className="farm-kpi-label">Per</span>
          <select className="farm-input block! mt-1!" value={basis} onChange={(e) => setBasis(e.target.value)}>
            {PRICE_BASES.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
        </label>
        <button type="button" className="farm-btn primary" disabled={pending} onClick={save}>
          {pending ? 'Saving…' : 'Put in force'}
        </button>
        {err ? <span className="farm-kpi-sub farm-c-over">{err}</span> : null}
      </div>
    </div>
  );
}

// ── Purchase orders ─────────────────────────────────────────────────────────

function OrdersPanel({ orders, canEdit }: { orders: PoView[]; canEdit: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState<string | null>(orders[0]?.id ?? null);
  const [err, setErr] = useState<string | null>(null);

  if (orders.length === 0) {
    return (
      <p className="farm-kpi-sub mt-0!">
        No purchase order has been raised against this operation. Orders are generated from a
        production run on{' '}
        <Link className="farm-link" href="/farm/production-planning">Production Planning</Link>, which
        groups the day&apos;s requirement by the supplier each line is linked to.
      </p>
    );
  }

  const move = (id: string, status: PoStatus) =>
    start(async () => {
      setErr(null);
      const res = await setPurchaseOrderStatus({ id, status });
      if (res.ok) router.refresh();
      else setErr(res.error);
    });

  return (
    <>
      <div className="farm-scroll-x">
        <table className="farm-table">
          <thead>
            <tr><th>PO number</th><th>Status</th><th>For production</th><th className="num">Lines</th><th className="num">Subtotal</th><th>Raised</th><th /></tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id}>
                <td className="farm-mono farm-fs-xs font-medium!">
                  <button type="button" className="farm-link bg-none! border-0! p-0! cursor-pointer! [font:inherit]!" onClick={() => setOpen(open === o.id ? null : o.id)}>
                    {o.poNumber}
                  </button>
                </td>
                <td>
                  <span className={`farm-pill ${o.status === 'cancelled' ? 'over' : o.status === 'draft' ? '' : 'ok'}`}>
                    {PO_STATUS_LABEL[o.status as PoStatus] ?? o.status}
                  </span>
                </td>
                <td>{o.orderedFor}</td>
                <td className="num">{o.lines.length}</td>
                <td className="num">{money(o.subtotalCents / 100)}</td>
                <td className="farm-c-soft farm-fs-xs">{o.createdAt.toISOString().slice(0, 10)}</td>
                <td>
                  {canEdit ? (
                    <span className="inline-flex gap-[0.3rem] flex-wrap">
                      {nextPoStatuses(o.status as PoStatus).map((next) => (
                        <button key={next} type="button" className="farm-btn farm-fs-2xs" disabled={pending} onClick={() => move(o.id, next)}>
                          {next === 'cancelled' ? 'Cancel' : `Mark ${PO_STATUS_LABEL[next].toLowerCase()}`}
                        </button>
                      ))}
                      {o.status === 'draft' ? (
                        <button type="button" className="farm-btn farm-fs-2xs" disabled={pending} onClick={() => start(async () => { const r = await deletePurchaseOrder(o.id); if (r.ok) router.refresh(); else setErr(r.error); })}>
                          Delete
                        </button>
                      ) : null}
                    </span>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {err ? <p className="farm-kpi-sub farm-c-over">{err}</p> : null}

      {open ? (
        (() => {
          const o = orders.find((x) => x.id === open);
          if (!o) return null;
          return (
            <div className="mt-4! border border-[color:var(--farm-line)] rounded-[0.5rem] py-[0.9rem] px-4">
              <div className="farm-card-title">{o.poNumber} — {o.supplierName}</div>
              <div className="farm-scroll-x">
                <table className="farm-table">
                  <thead><tr><th>Grow plan line</th><th>Item</th><th className="num">Qty</th><th className="num">Cases</th><th className="num">Unit price</th><th className="num">Extended</th></tr></thead>
                  <tbody>
                    {o.lines.map((l) => (
                      <tr key={l.id}>
                        <td className="font-medium!">{l.input}</td>
                        <td className="farm-c-soft">{l.item}{l.packSize ? <span className="farm-c-faint"> · {l.packSize}</span> : null}</td>
                        <td className="num">{num(l.qty, 2)} {l.unit}</td>
                        <td className="num">{l.cases ?? '—'}</td>
                        <td className="num">{money(l.unitPriceCents / 100, 4)}</td>
                        <td className="num">{money(l.extendedCents / 100)}</td>
                      </tr>
                    ))}
                    <tr className="total"><td colSpan={5}>Subtotal</td><td className="num">{money(o.subtotalCents / 100)}</td></tr>
                  </tbody>
                </table>
              </div>
              {o.notes ? <p className="farm-kpi-sub mt-2">{o.notes}</p> : null}
              <p className="farm-kpi-sub mt-2">
                An order states what was ordered at the price in force when it was raised. Unlike every
                other figure on the platform it is written down, not recomputed — which is what makes it
                a document rather than a view.
              </p>
            </div>
          );
        })()
      ) : null}
    </>
  );
}

// ── In the model ────────────────────────────────────────────────────────────

function ModelPanel({
  supplier,
  sourcedLines,
  lotsReceived,
}: {
  supplier: SupplierView;
  sourcedLines: string[];
  lotsReceived: string[];
}) {
  return (
    <div className="flex flex-wrap gap-6">
      <div className="flex-[1_1_20rem] min-w-64">
        <div className="farm-card-title">Grow plan lines sourced here</div>
        {sourcedLines.length === 0 ? (
          <p className="farm-kpi-sub mt-0!">
            No line of the open forecast names this operation. A line is linked on{' '}
            <Link className="farm-link" href="/farm/grow-plans">Grow plans</Link>, and the link drives the
            certification and rating shown on Procurement and the inbound ton-miles on Logistics.
          </p>
        ) : (
          <>
            <ul className="mt-[0.3rem]! mr-0! mb-0! ml-0! pl-[1.1rem] farm-fs-base leading-[1.9]">
              {sourcedLines.map((l) => <li key={l}>{l}</li>)}
            </ul>
            <p className="farm-kpi-sub mt-2">
              This page shows the last saved version of what is open, not unsaved edits. Changing a link
              in the working copy shows here once the forecast is saved.
            </p>
          </>
        )}
      </div>

      <div className="flex-[1_1_20rem] min-w-64">
        <div className="farm-card-title">Lots received from {supplier.name}</div>
        {lotsReceived.length === 0 ? (
          <p className="farm-kpi-sub mt-0!">
            No lot records this operation as its source. Receiving is recorded on{' '}
            <Link className="farm-link" href="/farm/inventory">Inventory</Link>; that link is what lets
            a recall trace a lot back here.
          </p>
        ) : (
          <>
            <ul className="mt-[0.3rem]! mr-0! mb-0! ml-0! pl-[1.1rem] farm-mono farm-fs-sm leading-[1.9]">
              {lotsReceived.map((l) => <li key={l}>{l}</li>)}
            </ul>
            <p className="farm-kpi-sub mt-2">
              A fact of record: the lot was received from this operation in every scenario. The forward
              half of the trace — the pickupPoints each lot reached — is on{' '}
              <Link className="farm-link" href="/farm/produce-safety">Produce Safety</Link>.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

// ── Shared ──────────────────────────────────────────────────────────────────

function Rows({ rows, wrap = false }: { rows: Array<[string, React.ReactNode]>; wrap?: boolean }) {
  return (
    <div className="border border-[color:var(--farm-line)] rounded-[0.5rem] overflow-hidden">
      {rows.map(([k, v], i) => (
        <div key={k} className={`flex gap-4 py-2 px-[0.8rem] ${(i % 2 ? 'bg-[color:var(--farm-surface-2)]' : 'bg-transparent')}`}>
          <div className="flex-[0_0_9rem] farm-c-faint farm-fs-xs">{k}</div>
          <div className={`farm-c-ink farm-fs-sm min-w-0${wrap ? ' whitespace-normal' : ''}`}>
            {v === null || v === undefined || v === '' ? <span className="farm-c-faint">—</span> : v}
          </div>
        </div>
      ))}
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`py-[0.4rem]! px-[1.15rem]! rounded-[0.45rem]! farm-fs-sm cursor-pointer! ${(active ? 'border! border-[color:transparent]!' : 'border! border-[color:rgba(255,255,255,0.45)]!')} ${(active ? 'bg-[color:var(--farm-ink-strong)]!' : 'bg-[color:rgba(255,255,255,0.12)]!')} ${(active ? 'farm-c-forest' : 'text-[rgba(255,255,255,0.92)]!')} ${(active ? 'font-bold!' : 'font-semibold!')}`}
    >
      {children}
    </button>
  );
}
