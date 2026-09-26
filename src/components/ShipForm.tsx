'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { money, num } from '@/components/ui';
import { distributeOrder } from '@/server/order-actions';
import type { FinishedLotRef } from '@/engine/actuals';

/**
 * Ship an order — the distribution recorded on the order it fills (Roadmap I4).
 * The order keeps what was ordered; the record carries what went out: units,
 * the finished-goods lots on the truck, the temperature at hand-off and who
 * signed at the pickup point. Revenue and cost of goods sold post from the record.
 */

export interface ShipOrder {
  id: string;
  orderDate: string;
  subscriberName: string;
  pickupPointName: string;
  cropPlanCode: string;
  cropPlanName: string;
  units: number;
  pricePerUnitCents: number;
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
  /** Output lots from closed sowing records, for the crop plan shipped, newest first. */
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
  const [units, setUnits] = useState(Math.round(order.units));
  const [priceCents, setPriceCents] = useState(order.pricePerUnitCents);
  const [lots, setLots] = useState<string[]>([]);
  const [extraLots, setExtraLots] = useState('');
  const [temp, setTemp] = useState('');
  const [by, setBy] = useState('');
  const [receivedBy, setReceivedBy] = useState('');

  const forCropPlan = finishedLots.filter((l) => l.cropPlanCode === order.cropPlanCode);
  const toggleLot = (code: string) => setLots((ls) => (ls.includes(code) ? ls.filter((x) => x !== code) : [...ls, code]));

  function submit() {
    const lotCodes = [...lots, ...extraLots.split(',').map((s) => s.trim()).filter(Boolean)];
    start(async () => {
      const res = await distributeOrder({
        orderId: order.id,
        distributedOn: date,
        units,
        pricePerUnitCents: priceCents,
        lotCodes,
        distributedBy: by || null,
        handoffTempF: temp === '' ? null : Number(temp),
        receivedBy: receivedBy || null,
        notes: null,
      });
      if (res.ok) {
        setMsg({ kind: 'ok', text: `Shipped ${num(units)} units to ${order.pickupPointName}.` });
        router.refresh();
        onDone();
      } else setMsg({ kind: 'err', text: res.error });
    });
  }

  return (
    <div className="farm-card mb-4!">
      <div className="farm-card-title">Ship — {order.subscriberName} · {order.pickupPointName} · {order.cropPlanCode} {order.cropPlanName}</div>
      {msg && <div className={`farm-scenariobar-msg ${msg.kind} mb-[0.6rem]!`} role="status">{msg.text}</div>}
      <p className="farm-kpi-sub mb-[0.6rem]!">
        Ordered {num(Math.round(order.units))} units for {order.orderDate}. The count below is what went out the door.
      </p>
      <div className="flex flex-wrap gap-3 items-end mb-3!">
        <label className="farm-kpi-sub">Distributed on<br /><input className="farm-input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
        <label className="farm-kpi-sub">Units distributed<br /><input className="farm-input w-28!" type="number" inputMode="numeric" min={0} value={units} onChange={(e) => setUnits(Number(e.target.value))} /></label>
        {showPrice ? (
          <label className="farm-kpi-sub">Price per unit $<br /><input className="farm-input w-28!" type="number" min={0} step={0.01} value={fromCents(priceCents)} onChange={(e) => setPriceCents(Math.round(Number(e.target.value) * 100))} /></label>
        ) : (
          <span className="farm-kpi-sub">Price: on the order ({money(fromCents(priceCents))})</span>
        )}
        <label className="farm-kpi-sub">Temp at hand-off °F<br /><input className="farm-input w-28!" type="number" inputMode="decimal" step={1} value={temp} onChange={(e) => setTemp(e.target.value)} /></label>
        <label className="farm-kpi-sub">Distributed by<br /><input className="farm-input w-36!" value={by} onChange={(e) => setBy(e.target.value)} /></label>
        <label className="farm-kpi-sub">Signed for at the pickup point by<br /><input className="farm-input w-36!" value={receivedBy} onChange={(e) => setReceivedBy(e.target.value)} /></label>
      </div>
      <div className="farm-kpi-sub mb-[0.3rem]!">Lots on the truck</div>
      {forCropPlan.length === 0 ? (
        <p className="farm-kpi-sub">No closed sowing of {order.cropPlanCode} on file to pick from. A lot code can still be typed below.</p>
      ) : (
        <div className="flex flex-wrap gap-[0.4rem] mb-2!">
          {forCropPlan.map((l) => (
            <button key={l.lotCode} type="button" className={`farm-btn${lots.includes(l.lotCode) ? ' primary' : ''}`} onClick={() => toggleLot(l.lotCode)}>
              {l.lotCode}<span className="farm-fs-2xs opacity-[0.8]"> · {l.variety} · {l.productionDate}</span>
            </button>
          ))}
        </div>
      )}
      <label className="farm-kpi-sub">Other lot codes (comma-separated)<br /><input className="farm-input w-80!" value={extraLots} onChange={(e) => setExtraLots(e.target.value)} /></label>
      <div className="flex gap-2 mt-3!">
        <button type="button" className="farm-btn primary" onClick={submit} disabled={pending || units < 0}>Record distribution</button>
        {onCancel && <button type="button" className="farm-btn" onClick={onCancel} disabled={pending}>Cancel</button>}
      </div>
    </div>
  );
}
