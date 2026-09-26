'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { money } from './ui';
import { recordReceipt } from '../_lib/actuals-actions';
import { RECEIPT_CONDITION_LABELS, type ReceiptCondition, type ReceiptLine } from '../_engine/actuals';

/**
 * Receive goods — on the purchase order when there is one, free-form when
 * there is not (Roadmap I2). Every line carries what the receiver found at the
 * dock: the quantity that came off the truck, the supplier's lot code from the
 * case, the use-by date printed on it, the product temperature, and a
 * condition verdict. A rejected line stays on the record and never enters
 * stock. A receipt that covers every line of an issued order marks the order
 * received.
 *
 * Receiving has no tolerance (Roadmap K2): each line keeps the quantity and
 * price its purchase-order line carried, and a line received short, over or at
 * a changed price states the override reason. The supplier's bill is matched
 * against this record on Payables.
 */

export interface ReceiveIngredient { name: string; unit: 'lb' | 'each'; standardUnitPriceCents: number; onFoodTraceabilityList: boolean }
export interface ReceivePo {
  id: string; poNumber: string; supplierId: string; supplierName: string; status: string; orderedFor: string;
  lines: { ingredient: string; qty: number; unit: string; unitPriceCents: number }[];
}

type Line = Required<Pick<ReceiptLine, 'ingredient' | 'qty' | 'unit' | 'lotCode' | 'unitPriceCents'>> & {
  useBy: string;
  receivedTempF: string;
  condition: ReceiptCondition;
  onFoodTraceabilityList: boolean;
  poQty: number | null;
  poUnitPriceCents: number | null;
  overrideReason: string;
};

const fromCents = (c: number) => c / 100;
const toCents = (d: number) => Math.round(d * 100);

/** True when an accepted line differs from its purchase-order line in quantity or price. */
const differsFromOrder = (l: Line) =>
  l.condition !== 'rejected' && l.poQty !== null && (Math.abs(l.qty - l.poQty) > 0.0005 || l.unitPriceCents !== (l.poUnitPriceCents ?? l.unitPriceCents));

export function ReceiveForm({
  purchaseOrders,
  ingredients,
  today,
  initialPoId = '',
  showPrices = true,
  onDone,
  onCancel,
}: {
  purchaseOrders: ReceivePo[];
  ingredients: ReceiveIngredient[];
  today: string;
  initialPoId?: string;
  /** Hide the price columns where only quantities and lots are taken. */
  showPrices?: boolean;
  onDone: () => void;
  onCancel?: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const lineFromIngredient = (name: string, qty = 0, unitPriceCents?: number, fromOrder = false): Line => {
    const ing = ingredients.find((x) => x.name === name);
    const price = unitPriceCents ?? ing?.standardUnitPriceCents ?? 0;
    return {
      ingredient: name,
      qty,
      unit: ing?.unit ?? 'lb',
      lotCode: '',
      unitPriceCents: price,
      useBy: '',
      receivedTempF: '',
      condition: 'accepted',
      onFoodTraceabilityList: ing?.onFoodTraceabilityList ?? false,
      poQty: fromOrder ? qty : null,
      poUnitPriceCents: fromOrder ? price : null,
      overrideReason: '',
    };
  };
  const linesFromPo = (id: string): Line[] => {
    const po = purchaseOrders.find((p) => p.id === id);
    return po ? po.lines.map((l) => lineFromIngredient(l.ingredient, l.qty, l.unitPriceCents, true)) : [];
  };

  const [date, setDate] = useState(today);
  const [poId, setPoId] = useState(initialPoId);
  const [supplier, setSupplier] = useState(purchaseOrders.find((p) => p.id === initialPoId)?.supplierName ?? '');
  const [by, setBy] = useState('');
  const [lines, setLines] = useState<Line[]>(() => linesFromPo(initialPoId));

  function pickPo(id: string) {
    setPoId(id);
    const po = purchaseOrders.find((p) => p.id === id);
    if (po) setSupplier(po.supplierName);
    setLines(linesFromPo(id));
  }
  const setLine = (i: number, fn: (l: Line) => Line) => setLines((ls) => ls.map((l, li) => (li === i ? fn(l) : l)));
  const totalCents = lines.filter((l) => l.condition !== 'rejected').reduce((s, l) => s + Math.round(l.qty * l.unitPriceCents), 0);
  const missingLots = lines.filter((l) => !l.lotCode.trim()).length;
  const missingReasons = lines.filter((l) => differsFromOrder(l) && !l.overrideReason.trim()).length;

  function submit() {
    const po = purchaseOrders.find((p) => p.id === poId);
    start(async () => {
      const res = await recordReceipt({
        poId: poId || null,
        supplierId: po?.supplierId ?? null,
        supplierName: supplier || po?.supplierName || null,
        receivedOn: date,
        invoiceNumber: null,
        invoiceTotalCents: totalCents,
        lines: lines.map((l) => ({
          ingredient: l.ingredient,
          qty: l.qty,
          unit: l.unit,
          lotCode: l.lotCode.trim() || 'not recorded',
          unitPriceCents: l.unitPriceCents,
          useBy: l.useBy || null,
          receivedTempF: l.receivedTempF === '' ? null : Number(l.receivedTempF),
          condition: l.condition,
          onFoodTraceabilityList: l.onFoodTraceabilityList,
          poQty: l.poQty,
          poUnitPriceCents: l.poUnitPriceCents,
          overrideReason: l.overrideReason.trim() || null,
        })),
        receivedBy: by || null,
        notes: null,
      });
      if (res.ok) {
        setMsg({ kind: 'ok', text: `Recorded the receipt${po ? ` against ${po.poNumber}` : ''}.` });
        router.refresh();
        onDone();
      } else setMsg({ kind: 'err', text: res.error });
    });
  }

  const columns = 8 + (showPrices ? 3 : 0);

  return (
    <div className="muse-card mb-4!">
      <div className="muse-card-title">Receive goods{poId ? ` — ${purchaseOrders.find((p) => p.id === poId)?.poNumber ?? ''}` : ''}</div>
      {msg && <div className={`muse-scenariobar-msg ${msg.kind} mb-[0.6rem]!`} role="status">{msg.text}</div>}
      <p className="muse-kpi-sub mb-[0.6rem]!">
        Quantities and prices start at what was ordered; type what came off the truck. A line received short,
        over, or at a changed price states why. The lot code is the supplier&apos;s, from the case. A line marked
        rejected stays on the record and does not enter stock.
      </p>
      <div className="flex flex-wrap gap-3 items-end mb-3!">
        <label className="muse-kpi-sub">Received on<br /><input className="muse-input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
        <label className="muse-kpi-sub">Purchase order<br />
          <select className="muse-select" value={poId} onChange={(e) => pickPo(e.target.value)}>
            <option value="">No purchase order</option>
            {purchaseOrders.map((po) => <option key={po.id} value={po.id}>{po.poNumber} — {po.supplierName} · for {po.orderedFor} ({po.status})</option>)}
          </select>
        </label>
        <label className="muse-kpi-sub">Supplier<br /><input className="muse-input w-48!" value={supplier} onChange={(e) => setSupplier(e.target.value)} /></label>
        <label className="muse-kpi-sub">Received by<br /><input className="muse-input w-36!" value={by} onChange={(e) => setBy(e.target.value)} /></label>
      </div>
      <div className="muse-scroll-x">
        <table className="muse-table">
          <thead>
            <tr>
              <th>Ingredient</th><th className="num">Ordered</th><th className="num">Qty received</th><th>Unit</th><th>Supplier lot code</th><th>Use by</th><th className="num">Temp °F</th><th>Condition</th>
              {showPrices && <><th className="num">$/unit received</th><th className="num">Extended</th><th>Override reason</th></>}
              <th />
            </tr>
          </thead>
          <tbody>
            {lines.flatMap((l, i) => {
              const differs = differsFromOrder(l);
              const row = (
                <tr key={i} className={`${l.condition === 'rejected' ? 'opacity-[0.6]!' : ''}`}>
                  <td>
                    <select className="muse-select" value={l.ingredient} onChange={(e) => setLine(i, (x) => ({ ...lineFromIngredient(e.target.value, x.qty), lotCode: x.lotCode, useBy: x.useBy, receivedTempF: x.receivedTempF, condition: x.condition, overrideReason: x.overrideReason }))}>
                      {ingredients.map((x) => <option key={x.name} value={x.name}>{x.name}</option>)}
                    </select>
                    {l.onFoodTraceabilityList && <div className="muse-fs-2xs muse-c-faint">Food Traceability List — lot code required</div>}
                  </td>
                  <td className="num">{l.poQty === null ? '—' : `${l.poQty}${showPrices ? ` @ ${money(fromCents(l.poUnitPriceCents ?? 0))}` : ''}`}</td>
                  <td className="num"><input className="muse-num-input" type="number" inputMode="decimal" min={0} step={0.01} value={l.qty} onChange={(e) => setLine(i, (x) => ({ ...x, qty: Number(e.target.value) }))} /></td>
                  <td>{l.unit}</td>
                  <td><input className="muse-input w-40!" value={l.lotCode} placeholder="from the case" onChange={(e) => setLine(i, (x) => ({ ...x, lotCode: e.target.value }))} /></td>
                  <td><input className="muse-input" type="date" value={l.useBy} onChange={(e) => setLine(i, (x) => ({ ...x, useBy: e.target.value }))} /></td>
                  <td className="num"><input className="muse-num-input" type="number" inputMode="decimal" step={1} value={l.receivedTempF} onChange={(e) => setLine(i, (x) => ({ ...x, receivedTempF: e.target.value }))} /></td>
                  <td>
                    <select className="muse-select" value={l.condition} onChange={(e) => setLine(i, (x) => ({ ...x, condition: e.target.value as ReceiptCondition }))}>
                      {(Object.keys(RECEIPT_CONDITION_LABELS) as ReceiptCondition[]).map((k) => <option key={k} value={k}>{RECEIPT_CONDITION_LABELS[k]}</option>)}
                    </select>
                  </td>
                  {showPrices && (
                    <>
                      <td className="num"><input className="muse-num-input" type="number" min={0} step={0.01} value={fromCents(l.unitPriceCents)} onChange={(e) => setLine(i, (x) => ({ ...x, unitPriceCents: toCents(Number(e.target.value)) }))} /></td>
                      <td className="num">{money(fromCents(Math.round(l.qty * l.unitPriceCents)))}</td>
                      <td>{differs ? <input className="muse-input w-48!" value={l.overrideReason} placeholder="Why it differs from the order" onChange={(e) => setLine(i, (x) => ({ ...x, overrideReason: e.target.value }))} /> : '—'}</td>
                    </>
                  )}
                  <td><button type="button" className="muse-btn py-[0.1rem]! px-[0.4rem]!" onClick={() => setLines((ls) => ls.filter((_, li) => li !== i))}>×</button></td>
                </tr>
              );
              return !showPrices && differs
                ? [row, <tr key={`${i}-reason`}><td colSpan={columns}><input className="muse-input w-full!" value={l.overrideReason} placeholder={`${l.ingredient}: why it differs from the order`} onChange={(e) => setLine(i, (x) => ({ ...x, overrideReason: e.target.value }))} /></td></tr>]
                : [row];
            })}
            {showPrices && <tr className="total"><td colSpan={9}>Received value, accepted lines</td><td className="num">{money(fromCents(totalCents))}</td><td colSpan={2} /></tr>}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap gap-2 mt-3! items-center">
        <button type="button" className="muse-btn" onClick={() => ingredients[0] && setLines((ls) => [...ls, lineFromIngredient(ingredients[0]!.name)])}>+ line</button>
        <button type="button" className="muse-btn primary" onClick={submit} disabled={pending || lines.length === 0 || missingReasons > 0 || lines.some((l) => l.onFoodTraceabilityList && !l.lotCode.trim())}>Record receipt</button>
        {onCancel && <button type="button" className="muse-btn" onClick={onCancel} disabled={pending}>Cancel</button>}
        {missingReasons > 0 && <span className="muse-kpi-sub">{missingReasons} line{missingReasons === 1 ? '' : 's'} differ{missingReasons === 1 ? 's' : ''} from the order with no override reason.</span>}
        {missingLots > 0 && <span className="muse-kpi-sub">{missingLots} line{missingLots === 1 ? '' : 's'} without a lot code — recorded as &ldquo;not recorded&rdquo;.</span>}
      </div>
    </div>
  );
}
