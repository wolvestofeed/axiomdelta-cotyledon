/**
 * Client-safe CRM helpers for the Sales page — a lean prospect shape for the
 * browser plus pure quote math. No dataset import here, so it can be pulled
 * into client components without bundling the whole compiled file.
 *
 * Read-only v1: the quote is a live what-if calculator (recomputes as inputs
 * change) but nothing here persists. Every figure is derived from stated
 * inputs — no advice, no fabricated numbers.
 */

/** Lean prospect record sent to the client CRM (directory + workspace). */
export interface ClientProspect {
  id: string;
  segment: 'charter' | 'private-tier1' | 'private-tier2';
  segmentLabel: string;
  name: string;
  location: string;
  model: string;
  phone: string;
  email: string;
  website: string;
  pointOfContact: string;
  firstContact: string;
  status: string;
  headcountRaw: string;
  headcount: number | null;
  grades: string;
  currentProgram: string;
  paymentModel: string;
  lat: number | null;
  lng: number | null;
  geoSource: 'address' | 'zip' | null;
}

export interface QuoteInputs {
  headcount: number;
  participation: number; // 0..1
  pricePerUnit: number; // $
  servingDays: number; // per year
}

export interface QuoteResult {
  unitsPerDay: number;
  annualUnits: number;
  annualValue: number;
  monthlyValue: number; // annual / 12
  perUnitValue: number;
}

/** Deterministic quote math from stated inputs. */
export function computeQuote(i: QuoteInputs): QuoteResult {
  const unitsPerDay = Math.round(i.headcount * i.participation);
  const annualUnits = unitsPerDay * i.servingDays;
  const annualValue = annualUnits * i.pricePerUnit;
  return {
    unitsPerDay,
    annualUnits,
    annualValue,
    monthlyValue: annualValue / 12,
    perUnitValue: i.pricePerUnit,
  };
}

/** Pipeline stage → pill colors {bg, fg, border}. */
export function statusColors(status: string): { bg: string; fg: string; border: string } {
  if (status.startsWith('Signed')) return { bg: '#ecf6ef', fg: '#2f7343', border: '#bfe0c8' };
  if (status === 'Negotiating') return { bg: '#fdf1dd', fg: '#8a5a12', border: '#efd9a8' };
  if (status === 'In Talks') return { bg: '#e8eef7', fg: '#2f4f7a', border: '#c4d3ea' };
  return { bg: '#f0efe9', fg: '#6b6f68', border: '#ddd8ca' }; // Lead / other
}
