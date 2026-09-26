'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { money, num } from './ui';
import { deliverOrder } from '../_lib/order-actions';
import type { FinishedLotRef } from '../_engine/actuals';

/**
 * Ship an order — the delivery recorded on the order it fills (Roadmap I4).
 * The order keeps what was ordered; the record carries what went out: meals,
 * the finished-goods lots on the truck, the temperature at hand-off and who
 * signed at the site. Revenue and cost of goods sold post from the record.
 */

export interface ShipOrder {
  id: string;
  orderDate: string;
  customerName: string;
  siteName: string;
  recipeCode: string;
  recipeName: string;
  meals: number;
  pricePerMealCents: number;
}

export type FinishedLot = FinishedLotRef;

const fromCents = (c: number) => c / 100;

export function ShipForm({
  order,
  finishedLots,
  today,
  showPrice = true,
  onDone,
  onCancel,
}: {
  order: ShipOrder;
  /** Output lots from closed batch records, for the recipe shipped, newest first. */
  finishedLots: FinishedLot[];
  today: string;
  showPrice?: boolean;
  onDone: () => void;
  onCancel?: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [date, setDate] = useState(order.orderDate >= today ? order.orderDate : today);
  const [meals, setMeals] = useState(Math.round(order.meals));
  const [priceCents, setPriceCents] = useState(order.pricePerMealCents);
  const [lots, setLots] = useState<string[]>([]);
  const [extraLots, setExtraLots] = useState('');
  const [temp, setTemp] = useState('');
  const [by, setBy] = useState('');
  const [receivedBy, setReceivedBy] = useState('');

  const forRecipe = finishedLots.filter((l) => l.recipeCode === order.recipeCode);
  const toggleLot = (code: string) => setLots((ls) => (ls.includes(code) ? ls.filter((x) => x !== code) : [...ls, code]));

  function submit() {
    const lotCodes = [...lots, ...extraLots.split(',').map((s) => s.trim()).filter(Boolean)];
    start(async () => {
      const res = await deliverOrder({
        orderId: order.id,
        deliveredOn: date,
        meals,
        pricePerMealCents: priceCents,
        lotCodes,
        deliveredBy: by || null,
        handoffTempF: temp === '' ? null : Number(temp),
        receivedBy: receivedBy || null,
        notes: null,
      });
      if (res.ok) {
        setMsg({ kind: 'ok', text: `Shipped ${num(meals)} meals to ${order.siteName}.` });
        router.refresh();
        onDone();
      } else setMsg({ kind: 'err', text: res.error });
    });
  }

  return (
    <div className="muse-card mb-4!">
      <div className="muse-card-title">Ship — {order.customerName} · {order.siteName} · {order.recipeCode} {order.recipeName}</div>
      {msg && <div className={`muse-scenariobar-msg ${msg.kind} mb-[0.6rem]!`} role="status">{msg.text}</div>}
      <p className="muse-kpi-sub mb-[0.6rem]!">
        Ordered {num(Math.round(order.meals))} meals for {order.orderDate}. The count below is what went out the door.
      </p>
      <div className="flex flex-wrap gap-3 items-end mb-3!">
        <label className="muse-kpi-sub">Delivered on<br /><input className="muse-input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
        <label className="muse-kpi-sub">Meals delivered<br /><input className="muse-input w-28!" type="number" inputMode="numeric" min={0} value={meals} onChange={(e) => setMeals(Number(e.target.value))} /></label>
        {showPrice ? (
          <label className="muse-kpi-sub">Price per meal $<br /><input className="muse-input w-28!" type="number" min={0} step={0.01} value={fromCents(priceCents)} onChange={(e) => setPriceCents(Math.round(Number(e.target.value) * 100))} /></label>
        ) : (
          <span className="muse-kpi-sub">Price: on the order ({money(fromCents(priceCents))})</span>
        )}
        <label className="muse-kpi-sub">Temp at hand-off °F<br /><input className="muse-input w-28!" type="number" inputMode="decimal" step={1} value={temp} onChange={(e) => setTemp(e.target.value)} /></label>
        <label className="muse-kpi-sub">Delivered by<br /><input className="muse-input w-36!" value={by} onChange={(e) => setBy(e.target.value)} /></label>
        <label className="muse-kpi-sub">Signed for at the site by<br /><input className="muse-input w-36!" value={receivedBy} onChange={(e) => setReceivedBy(e.target.value)} /></label>
      </div>
      <div className="muse-kpi-sub mb-[0.3rem]!">Lots on the truck</div>
      {forRecipe.length === 0 ? (
        <p className="muse-kpi-sub">No closed batch of {order.recipeCode} on file to pick from. A lot code can still be typed below.</p>
      ) : (
        <div className="flex flex-wrap gap-[0.4rem] mb-2!">
          {forRecipe.map((l) => (
            <button key={l.lotCode} type="button" className={`muse-btn${lots.includes(l.lotCode) ? ' primary' : ''}`} onClick={() => toggleLot(l.lotCode)}>
              {l.lotCode}<span className="muse-fs-2xs opacity-[0.8]"> · {l.component} · {l.productionDate}</span>
            </button>
          ))}
        </div>
      )}
      <label className="muse-kpi-sub">Other lot codes (comma-separated)<br /><input className="muse-input w-80!" value={extraLots} onChange={(e) => setExtraLots(e.target.value)} /></label>
      <div className="flex gap-2 mt-3!">
        <button type="button" className="muse-btn primary" onClick={submit} disabled={pending || meals < 0}>Record delivery</button>
        {onCancel && <button type="button" className="muse-btn" onClick={onCancel} disabled={pending}>Cancel</button>}
      </div>
    </div>
  );
}
