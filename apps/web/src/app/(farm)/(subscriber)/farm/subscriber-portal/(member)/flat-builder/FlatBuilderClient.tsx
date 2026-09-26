'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Card, money, num } from '@/app/(farm)/farm/_components/ui';

/** The major food allergens a client flags; a note covers anything else. */
const ALLERGENS = ['Milk', 'Egg', 'Wheat / gluten', 'Soy', 'Peanut', 'Tree nut', 'Fish', 'Shellfish', 'Sesame'] as const;

interface Line {
  cropPlanCode: string;
  qty: number;
}

/** What the Flat Builder reads — the plan of record's definitions, loaded on the server (the portal shell has no scenario store). */
export interface FlatBuilderData {
  subscribers: { id: string; name: string; channel: number; pricePerUnitCents: number | null; pickupPoints: { id: string; name: string }[] }[];
  cropPlans: { code: string; name: string; channels: number[] }[];
  channels: { phase: number; market: string; pricePerUnit: number }[];
  packages: { id: string; name: string; channels: number[]; material: string | null; endOfUse: string | null; unitCost: number | null }[];
}

export function FlatBuilderClient({ initialSubscriberId, data }: { initialSubscriberId: string | null; data: FlatBuilderData }) {
  const clients = data.subscribers;
  const [subscriberId, setSubscriberId] = useState<string>(initialSubscriberId && clients.some((c) => c.id === initialSubscriberId) ? initialSubscriberId : clients[0]?.id ?? '');
  const subscriber = clients.find((c) => c.id === subscriberId) ?? null;
  const channel = subscriber?.channel ?? 2;
  const channelRow = data.channels.find((p) => p.phase === channel);
  const cropPlans = useMemo(() => data.cropPlans.filter((r) => r.channels.includes(channel)), [data.cropPlans, channel]);
  const packages = useMemo(() => data.packages.filter((p) => p.channels.includes(channel)), [data.packages, channel]);

  const [serviceDate, setServiceDate] = useState('');
  const [arrival, setArrival] = useState('');
  const [headcount, setHeadcount] = useState('');
  const [lines, setLines] = useState<Line[]>([]);
  const [allergens, setAllergens] = useState<Set<string>>(new Set());
  const [allergyNotes, setAllergyNotes] = useState('');
  const [packageId, setPackageId] = useState('');
  const [pickupPointId, setPickupPointId] = useState('');
  const [address, setAddress] = useState('');
  const [contact, setContact] = useState('');
  const [phone, setPhone] = useState('');
  const [distribution, setDistribution] = useState('');
  const [instructions, setInstructions] = useState('');

  const pricePerUnit = subscriber?.pricePerUnitCents != null ? subscriber.pricePerUnitCents / 100 : channelRow?.pricePerUnit ?? 0;
  const priceBasis = subscriber?.pricePerUnitCents != null ? 'contracted price' : `${channelRow?.market ?? 'channel'} price`;
  const units = lines.reduce((t, l) => t + (Number.isFinite(l.qty) ? l.qty : 0), 0);
  const pkg = packages.find((p) => p.id === packageId) ?? null;
  const pkgCost = pkg?.unitCost ?? null;
  const setLine = (i: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  return (
    <>
      <Card title="Client and date of service">
        <div className="flex flex-wrap gap-3 items-end">
          <label className="farm-kpi-sub">Subscriber<br />
            <select className="farm-select" value={subscriberId} onChange={(e) => { setSubscriberId(e.target.value); setLines([]); setPackageId(''); setPickupPointId(''); }}>
              {clients.length === 0 && <option value="">No corporate or restaurant subscriber on file</option>}
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label className="farm-kpi-sub">Date of service<br /><input type="date" className="farm-input" value={serviceDate} onChange={(e) => setServiceDate(e.target.value)} /></label>
          <label className="farm-kpi-sub">Arrival time<br /><input type="time" className="farm-input" value={arrival} onChange={(e) => setArrival(e.target.value)} /></label>
          <label className="farm-kpi-sub">Headcount<br /><input type="number" min={0} className="farm-input w-28!" value={headcount} onChange={(e) => setHeadcount(e.target.value)} /></label>
        </div>
        {subscriber && <p className="farm-kpi-sub mt-2">{channelRow?.market ?? `Channel ${channel}`} · {money(pricePerUnit)} a unit, the {priceBasis}. <Link className="farm-link" href={`/farm/subscriber-portal?subscriber=${subscriber.id}`}>Order history and invoices</Link></p>}
      </Card>

      <Card title="Crop plans and quantities" className="mt-4">
        {cropPlans.length === 0 ? (
          <p className="farm-kpi-sub">No in-service crop plan is offered on this channel. Please call the farm to discuss the menu.</p>
        ) : (
          <>
            {lines.map((l, i) => (
              <div key={i} className="flex flex-wrap gap-[0.6rem] items-center mb-2!">
                <select className="farm-select" value={l.cropPlanCode} onChange={(e) => setLine(i, { cropPlanCode: e.target.value })}>
                  {cropPlans.map((r) => <option key={r.code} value={r.code}>{r.name}</option>)}
                </select>
                <input type="number" min={0} className="farm-input w-28!" value={Number.isFinite(l.qty) ? l.qty : ''} aria-label="Quantity" onChange={(e) => setLine(i, { qty: Number(e.target.value) })} />
                <span className="farm-kpi-sub">{money((Number.isFinite(l.qty) ? l.qty : 0) * pricePerUnit)}</span>
                <button type="button" className="farm-btn" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}>Remove</button>
              </div>
            ))}
            <button type="button" className="farm-btn" onClick={() => setLines((ls) => [...ls, { cropPlanCode: cropPlans[0].code, qty: 0 }])}>Add a crop plan</button>
          </>
        )}
      </Card>

      <div className="grid gap-4 mt-4 farm-autofit-20">
        <Card title="Allergies">
          <div className="flex flex-wrap gap-y-[0.4rem] gap-x-4">
            {ALLERGENS.map((a) => (
              <label key={a} className="farm-kpi-sub inline-flex! gap-[0.3rem]! items-center!">
                <input type="checkbox" checked={allergens.has(a)} onChange={(e) => setAllergens((s) => { const n = new Set(s); if (e.target.checked) n.add(a); else n.delete(a); return n; })} />{a}
              </label>
            ))}
          </div>
          <label className="farm-kpi-sub mt-2 block!">Allergy and dietary notes — how many guests, and anything else<br />
            <textarea className="farm-input w-full!" rows={3} value={allergyNotes} onChange={(e) => setAllergyNotes(e.target.value)} />
          </label>
        </Card>

        <Card title="Packaging">
          {packages.length === 0 ? (
            <p className="farm-kpi-sub">No packaging option is listed for this service yet.</p>
          ) : (
            <label className="farm-kpi-sub">Package<br />
              <select className="farm-select" value={packageId} onChange={(e) => setPackageId(e.target.value)}>
                <option value="">The crop plan&rsquo;s own packaging</option>
                {packages.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
          )}
          {pkg && <p className="farm-kpi-sub mt-2">{pkg.material ?? 'Material not on file'} · {pkg.endOfUse ?? 'end of use not on file'} · {pkgCost === null ? 'no cost on file' : `${money(pkgCost)} a unit`}</p>}
        </Card>
      </div>

      <Card title="Distribution" className="mt-4">
        <div className="flex flex-wrap gap-3 items-end">
          <label className="farm-kpi-sub">Pickup point<br />
            <select className="farm-select" value={pickupPointId} onChange={(e) => setPickupPointId(e.target.value)}>
              <option value="">Another address</option>
              {(subscriber?.pickupPoints ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          {!pickupPointId && <label className="farm-kpi-sub flex-[1_1_18rem]!">Address<br /><input className="farm-input w-full!" value={address} onChange={(e) => setAddress(e.target.value)} /></label>}
          <label className="farm-kpi-sub">On-pickup-point contact<br /><input className="farm-input" value={contact} onChange={(e) => setContact(e.target.value)} /></label>
          <label className="farm-kpi-sub">Contact phone<br /><input className="farm-input" value={phone} onChange={(e) => setPhone(e.target.value)} /></label>
        </div>
        <label className="farm-kpi-sub mt-2 block!">Distribution specifications — access, loading, setup and serving<br />
          <textarea className="farm-input w-full!" rows={3} value={distribution} onChange={(e) => setDistribution(e.target.value)} />
        </label>
        <label className="farm-kpi-sub mt-2 block!">Instructions<br />
          <textarea className="farm-input w-full!" rows={3} value={instructions} onChange={(e) => setInstructions(e.target.value)} />
        </label>
      </Card>

      <Card title="Order summary" className="mt-4">
        <table className="farm-table">
          <tbody>
            <tr><td>Date of service</td><td className="num">{serviceDate || '—'}{arrival ? ` at ${arrival}` : ''}</td></tr>
            <tr><td>Headcount</td><td className="num">{headcount || '—'}</td></tr>
            <tr><td>Units</td><td className="num">{num(units)}</td></tr>
            <tr><td>Allergens flagged</td><td className="num">{allergens.size === 0 ? 'none' : [...allergens].join(', ')}</td></tr>
            <tr className="total"><td>Units at {money(pricePerUnit)}</td><td className="num">{money(units * pricePerUnit)}</td></tr>
          </tbody>
        </table>
        <button type="button" className="farm-btn primary mt-3" disabled title="Submitting an order is not connected yet">Submit order</button>
        <p className="farm-kpi-sub mt-2">Submitting is not connected yet. A submitted order is reviewed by MicroFarm staff before it is committed to production. Distribution and any service charges are not priced here.</p>
      </Card>
    </>
  );
}
