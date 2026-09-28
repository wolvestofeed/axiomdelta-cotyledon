/**
 * Cotyledon — what seed, media and nutrients were paid, from their receipts. Pure.
 *
 * An input is received under what its line buys (`purchaseName`): a seed line by the pound under
 * its variety's name, a medium by the gallon or the mat, a nutrient by the ml. A rejected line is
 * left out.
 *
 *   last price paid   the price on the variety's most recent receipt (the pounds received that day
 *                     over what they cost, when more than one line came in). The plan's price for
 *                     the seed line: over the catalog price and the record's opening price, under a
 *                     price typed on a forecast. A purchase order prices at the catalog first
 *                     (`accounting-policy.md` §10).
 *   rolling average   the dollars over the quantity on the accepted lines of the twelve months to a
 *                     date, per input in the unit it is received in. A key figure on seed, media and
 *                     nutrient costs; no price any plan, order or posting uses.
 */

import type { ReceiptDoc } from '@/engine/actuals';
import type { VarietyDef } from '@/data/varieties';
import { tagged, type Tagged } from '@/data/tagged';

export interface RollingCost {
  /** Dollars paid over the quantity received in the window, per unit received. */
  perUnit: number;
  /** The unit the lines were received in: 'lb' for seed, 'each' (the cost card's unit) for the rest. */
  unit: string;
  /** Accepted receipt lines counted, and the quantity they received. */
  receipts: number;
  qty: number;
  /** The first and last receipt dates counted, ISO. */
  from: string;
  to: string;
}

export interface LastPricePaid {
  pricePerLb: number;
  /** The date of the receipt it comes from, ISO. */
  receivedOn: string;
  /** Pounds received that day. */
  lb: number;
}

/** Each variety's last price paid per pound; a variety never received is absent. */
export function lastPricesPaid(receipts: readonly Pick<ReceiptDoc, 'receivedOn' | 'lines'>[], varieties: readonly Pick<VarietyDef, 'key' | 'name'>[]): Record<string, LastPricePaid> {
  const keyByName = new Map(varieties.map((v) => [v.name, v.key]));
  const acc = new Map<string, { on: string; cents: number; lb: number }>();
  for (const r of receipts) {
    for (const l of r.lines) {
      const key = keyByName.get(l.input);
      if (!key || l.unit !== 'lb' || l.condition === 'rejected' || !(l.qty > 0)) continue;
      const a = acc.get(key);
      if (!a || r.receivedOn > a.on) acc.set(key, { on: r.receivedOn, cents: l.qty * l.unitPriceCents, lb: l.qty });
      else if (r.receivedOn === a.on) {
        a.cents += l.qty * l.unitPriceCents;
        a.lb += l.qty;
      }
    }
  }
  const out: Record<string, LastPricePaid> = {};
  for (const [key, a] of acc) out[key] = { pricePerLb: a.cents / 100 / a.lb, receivedOn: a.on, lb: a.lb };
  return out;
}

export function lastPricePaidSource(p: LastPricePaid): string {
  return `Last price paid: ${Math.round(p.lb * 100) / 100} lb received ${p.receivedOn}`;
}

/** The first day of the twelve months to `asOf`: the same date a year earlier (the month's last day when it has no such date), plus a day. */
export function rollingWindowFrom(asOf: string): string {
  const [y, m, d] = asOf.split('-').map(Number) as [number, number, number];
  const lastDay = new Date(Date.UTC(y - 1, m, 0)).getUTCDate();
  const start = new Date(Date.UTC(y - 1, m - 1, Math.min(d, lastDay) + 1));
  return start.toISOString().slice(0, 10);
}

/**
 * Each input's rolling average, by the name it is received under, from the accepted lines dated in
 * the twelve months to `asOf`; an input with none is absent. Lines of an input in another unit than
 * its first are left out, so a pound is never averaged with a mat.
 */
export function rollingCosts(receipts: readonly Pick<ReceiptDoc, 'receivedOn' | 'lines'>[], asOf: string): Record<string, RollingCost> {
  const from = rollingWindowFrom(asOf);
  const acc = new Map<string, { unit: string; cents: number; qty: number; n: number; from: string; to: string }>();
  for (const r of receipts) {
    if (r.receivedOn < from || r.receivedOn > asOf) continue;
    for (const l of r.lines) {
      if (l.condition === 'rejected' || !(l.qty > 0)) continue;
      const a = acc.get(l.input) ?? { unit: l.unit, cents: 0, qty: 0, n: 0, from: r.receivedOn, to: r.receivedOn };
      if (a.unit !== l.unit) continue;
      a.cents += l.qty * l.unitPriceCents;
      a.qty += l.qty;
      a.n += 1;
      if (r.receivedOn < a.from) a.from = r.receivedOn;
      if (r.receivedOn > a.to) a.to = r.receivedOn;
      acc.set(l.input, a);
    }
  }
  const out: Record<string, RollingCost> = {};
  for (const [input, a] of acc) out[input] = { perUnit: a.cents / 100 / a.qty, unit: a.unit, receipts: a.n, qty: a.qty, from: a.from, to: a.to };
  return out;
}

/** The last price paid as a tagged figure: DATED to its receipt. */
export function lastPricePaidTagged(p: LastPricePaid): Tagged {
  return tagged(p.pricePerLb, 'DATED', '$/lb', lastPricePaidSource(p));
}

/** Where a rolling average comes from, in the unit it is shown in. */
export function rollingCostSource(c: RollingCost, unitWord: string): string {
  const qty = Math.round(c.qty * 100) / 100;
  return `Average of ${c.receipts} receipt ${c.receipts === 1 ? 'line' : 'lines'}, ${qty} ${unitWord}, ${c.from === c.to ? c.from : `${c.from} to ${c.to}`} (the last 12 months)`;
}

/** A rolling average as a tagged figure: DERIVED from its receipt lines. */
export function rollingCostTagged(c: RollingCost, unitWord: string): Tagged {
  return tagged(c.perUnit, 'DERIVED', `$/${unitWord}`, rollingCostSource(c, unitWord));
}

/**
 * The unit an input's quantity is received in, as a word: pounds of seed, gallons of loose medium or
 * a mat by the piece (the medium's unit from its library record), ml of a nutrient.
 */
export function receivedUnitWord(input: string, unit: string, mediumUnit: (key: string) => string | undefined): string {
  if (unit === 'lb') return 'lb';
  if (input.startsWith('Nutrient: ')) return 'ml';
  if (input.startsWith('Medium: ')) return mediumUnit(input.slice('Medium: '.length)) === 'gal' ? 'gal' : 'mat';
  return 'each';
}
