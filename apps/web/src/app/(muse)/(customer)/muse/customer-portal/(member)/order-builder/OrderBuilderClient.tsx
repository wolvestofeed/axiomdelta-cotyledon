'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Card, money, num } from '@/app/(muse)/muse/_components/ui';

/** The major food allergens a client flags; a note covers anything else. */
const ALLERGENS = ['Milk', 'Egg', 'Wheat / gluten', 'Soy', 'Peanut', 'Tree nut', 'Fish', 'Shellfish', 'Sesame'] as const;

interface Line {
  recipeCode: string;
  qty: number;
}

/** What the Order Builder reads — the plan of record's definitions, loaded on the server (the portal shell has no scenario store). */
export interface OrderBuilderData {
  customers: { id: string; name: string; channel: number; pricePerMealCents: number | null; sites: { id: string; name: string }[] }[];
  recipes: { code: string; name: string; channels: number[] }[];
  channels: { phase: number; market: string; pricePerMeal: number }[];
  packages: { id: string; name: string; channels: number[]; material: string | null; endOfUse: string | null; unitCost: number | null }[];
}

export function OrderBuilderClient({ initialCustomerId, data }: { initialCustomerId: string | null; data: OrderBuilderData }) {
  const clients = data.customers;
  const [customerId, setCustomerId] = useState<string>(initialCustomerId && clients.some((c) => c.id === initialCustomerId) ? initialCustomerId : clients[0]?.id ?? '');
  const customer = clients.find((c) => c.id === customerId) ?? null;
  const channel = customer?.channel ?? 2;
  const channelRow = data.channels.find((p) => p.phase === channel);
  const recipes = useMemo(() => data.recipes.filter((r) => r.channels.includes(channel)), [data.recipes, channel]);
  const packages = useMemo(() => data.packages.filter((p) => p.channels.includes(channel)), [data.packages, channel]);

  const [serviceDate, setServiceDate] = useState('');
  const [arrival, setArrival] = useState('');
  const [headcount, setHeadcount] = useState('');
  const [lines, setLines] = useState<Line[]>([]);
  const [allergens, setAllergens] = useState<Set<string>>(new Set());
  const [allergyNotes, setAllergyNotes] = useState('');
  const [packageId, setPackageId] = useState('');
  const [siteId, setSiteId] = useState('');
  const [address, setAddress] = useState('');
  const [contact, setContact] = useState('');
  const [phone, setPhone] = useState('');
  const [delivery, setDelivery] = useState('');
  const [instructions, setInstructions] = useState('');

  const pricePerMeal = customer?.pricePerMealCents != null ? customer.pricePerMealCents / 100 : channelRow?.pricePerMeal ?? 0;
  const priceBasis = customer?.pricePerMealCents != null ? 'contracted price' : `${channelRow?.market ?? 'channel'} price`;
  const meals = lines.reduce((t, l) => t + (Number.isFinite(l.qty) ? l.qty : 0), 0);
  const pkg = packages.find((p) => p.id === packageId) ?? null;
  const pkgCost = pkg?.unitCost ?? null;
  const setLine = (i: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  return (
    <>
      <Card title="Client and date of service">
        <div className="flex flex-wrap gap-3 items-end">
          <label className="muse-kpi-sub">Customer<br />
            <select className="muse-select" value={customerId} onChange={(e) => { setCustomerId(e.target.value); setLines([]); setPackageId(''); setSiteId(''); }}>
              {clients.length === 0 && <option value="">No corporate or catering customer on file</option>}
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label className="muse-kpi-sub">Date of service<br /><input type="date" className="muse-input" value={serviceDate} onChange={(e) => setServiceDate(e.target.value)} /></label>
          <label className="muse-kpi-sub">Arrival time<br /><input type="time" className="muse-input" value={arrival} onChange={(e) => setArrival(e.target.value)} /></label>
          <label className="muse-kpi-sub">Headcount<br /><input type="number" min={0} className="muse-input w-28!" value={headcount} onChange={(e) => setHeadcount(e.target.value)} /></label>
        </div>
        {customer && <p className="muse-kpi-sub mt-2">{channelRow?.market ?? `Channel ${channel}`} · {money(pricePerMeal)} a meal, the {priceBasis}. <Link className="muse-link" href={`/muse/customer-portal?customer=${customer.id}`}>Order history and invoices</Link></p>}
      </Card>

      <Card title="Recipes and quantities" className="mt-4">
        {recipes.length === 0 ? (
          <p className="muse-kpi-sub">No in-service recipe is offered on this channel. Please call the kitchen to discuss the menu.</p>
        ) : (
          <>
            {lines.map((l, i) => (
              <div key={i} className="flex flex-wrap gap-[0.6rem] items-center mb-2!">
                <select className="muse-select" value={l.recipeCode} onChange={(e) => setLine(i, { recipeCode: e.target.value })}>
                  {recipes.map((r) => <option key={r.code} value={r.code}>{r.name}</option>)}
                </select>
                <input type="number" min={0} className="muse-input w-28!" value={Number.isFinite(l.qty) ? l.qty : ''} aria-label="Quantity" onChange={(e) => setLine(i, { qty: Number(e.target.value) })} />
                <span className="muse-kpi-sub">{money((Number.isFinite(l.qty) ? l.qty : 0) * pricePerMeal)}</span>
                <button type="button" className="muse-btn" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}>Remove</button>
              </div>
            ))}
            <button type="button" className="muse-btn" onClick={() => setLines((ls) => [...ls, { recipeCode: recipes[0].code, qty: 0 }])}>Add a recipe</button>
          </>
        )}
      </Card>

      <div className="grid gap-4 mt-4 muse-autofit-20">
        <Card title="Allergies">
          <div className="flex flex-wrap gap-y-[0.4rem] gap-x-4">
            {ALLERGENS.map((a) => (
              <label key={a} className="muse-kpi-sub inline-flex! gap-[0.3rem]! items-center!">
                <input type="checkbox" checked={allergens.has(a)} onChange={(e) => setAllergens((s) => { const n = new Set(s); if (e.target.checked) n.add(a); else n.delete(a); return n; })} />{a}
              </label>
            ))}
          </div>
          <label className="muse-kpi-sub mt-2 block!">Allergy and dietary notes — how many guests, and anything else<br />
            <textarea className="muse-input w-full!" rows={3} value={allergyNotes} onChange={(e) => setAllergyNotes(e.target.value)} />
          </label>
        </Card>

        <Card title="Packaging">
          {packages.length === 0 ? (
            <p className="muse-kpi-sub">No packaging option is listed for this service yet.</p>
          ) : (
            <label className="muse-kpi-sub">Package<br />
              <select className="muse-select" value={packageId} onChange={(e) => setPackageId(e.target.value)}>
                <option value="">The recipe&rsquo;s own packaging</option>
                {packages.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
          )}
          {pkg && <p className="muse-kpi-sub mt-2">{pkg.material ?? 'Material not on file'} · {pkg.endOfUse ?? 'end of use not on file'} · {pkgCost === null ? 'no cost on file' : `${money(pkgCost)} a unit`}</p>}
        </Card>
      </div>

      <Card title="Delivery" className="mt-4">
        <div className="flex flex-wrap gap-3 items-end">
          <label className="muse-kpi-sub">Site<br />
            <select className="muse-select" value={siteId} onChange={(e) => setSiteId(e.target.value)}>
              <option value="">Another address</option>
              {(customer?.sites ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          {!siteId && <label className="muse-kpi-sub flex-[1_1_18rem]!">Address<br /><input className="muse-input w-full!" value={address} onChange={(e) => setAddress(e.target.value)} /></label>}
          <label className="muse-kpi-sub">On-site contact<br /><input className="muse-input" value={contact} onChange={(e) => setContact(e.target.value)} /></label>
          <label className="muse-kpi-sub">Contact phone<br /><input className="muse-input" value={phone} onChange={(e) => setPhone(e.target.value)} /></label>
        </div>
        <label className="muse-kpi-sub mt-2 block!">Delivery specifications — access, loading, setup and serving<br />
          <textarea className="muse-input w-full!" rows={3} value={delivery} onChange={(e) => setDelivery(e.target.value)} />
        </label>
        <label className="muse-kpi-sub mt-2 block!">Instructions<br />
          <textarea className="muse-input w-full!" rows={3} value={instructions} onChange={(e) => setInstructions(e.target.value)} />
        </label>
      </Card>

      <Card title="Order summary" className="mt-4">
        <table className="muse-table">
          <tbody>
            <tr><td>Date of service</td><td className="num">{serviceDate || '—'}{arrival ? ` at ${arrival}` : ''}</td></tr>
            <tr><td>Headcount</td><td className="num">{headcount || '—'}</td></tr>
            <tr><td>Meals</td><td className="num">{num(meals)}</td></tr>
            <tr><td>Allergens flagged</td><td className="num">{allergens.size === 0 ? 'none' : [...allergens].join(', ')}</td></tr>
            <tr className="total"><td>Meals at {money(pricePerMeal)}</td><td className="num">{money(meals * pricePerMeal)}</td></tr>
          </tbody>
        </table>
        <button type="button" className="muse-btn primary mt-3" disabled title="Submitting an order is not connected yet">Submit order</button>
        <p className="muse-kpi-sub mt-2">Submitting is not connected yet. A submitted order is reviewed by Muse Kitchen staff before it is committed to production. Delivery and any service charges are not priced here.</p>
      </Card>
    </>
  );
}
