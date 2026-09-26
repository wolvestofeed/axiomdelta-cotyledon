'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useScenario } from './scenario-store';
import { loadLedgerBook, loadLedgerJournal, setLedgerKind } from '../_lib/ledger-actions';
import { periodsOf, type Granularity, type LedgerBookView, type LedgerJournalView, type LedgerKind } from '../_engine/ledger-view';
import type { StatementPeriod } from '../_engine/ledger-statements';
import { resolveSubscriberPickupPoints } from '../_engine/demand';
import { loadSustainabilityBasis } from '../_lib/sustainability-actions';
import type { SustainabilityBasis } from '../_engine/sustainability-basis';
import type { SustainabilityRecords } from '../_engine/sustainability-records';

/**
 * The ledger this person reads — Plan or Actual (Roadmap N6) — and the books behind
 * it. Plan posts the working copy, unsaved edits included, a moment after each edit.
 */

interface LedgerContextValue {
  kind: LedgerKind;
  setKind: (kind: LedgerKind) => void;
  switching: boolean;
}

const LedgerContext = createContext<LedgerContextValue | null>(null);

export function LedgerProvider({ initialKind, children }: { initialKind: LedgerKind; children: React.ReactNode }) {
  const [kind, setLocal] = useState<LedgerKind>(initialKind);
  const [switching, start] = useTransition();
  const router = useRouter();
  const setKind = useCallback(
    (next: LedgerKind) => {
      setLocal(next);
      start(async () => {
        await setLedgerKind(next);
        router.refresh();
      });
    },
    [router],
  );
  const value = useMemo(() => ({ kind, setKind, switching }), [kind, setKind, switching]);
  return <LedgerContext.Provider value={value}>{children}</LedgerContext.Provider>;
}

export function useLedger(): LedgerContextValue {
  const v = useContext(LedgerContext);
  if (!v) throw new Error('useLedger outside LedgerProvider');
  return v;
}

const DEBOUNCE_MS = 350;

/** Run a server call keyed on the ledger and the working copy, keeping the last answer while the next one posts. */
function usePosted<T>(key: string, call: () => Promise<{ ok: true; value: T } | { ok: false; error: string }>) {
  const [result, setResult] = useState<{ key: string; value: T | null; error: string | null } | null>(null);
  const callRef = useRef(call);
  useEffect(() => {
    callRef.current = call;
  });
  useEffect(() => {
    let live = true;
    const t = setTimeout(async () => {
      try {
        const res = await callRef.current();
        if (!live) return;
        setResult((prev) => (res.ok ? { key, value: res.value, error: null } : { key, value: prev?.value ?? null, error: res.error }));
      } catch (e) {
        if (live) setResult((prev) => ({ key, value: prev?.value ?? null, error: e instanceof Error ? e.message : 'The ledger could not be posted.' }));
      }
    }, DEBOUNCE_MS);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [key]);
  return { value: result?.value ?? null, error: result?.error ?? null, pending: result?.key !== key };
}

export function useLedgerBook() {
  const { kind } = useLedger();
  const { config } = useScenario();
  const key = `${kind}|${JSON.stringify(config)}`;
  const { value, error, pending } = usePosted<LedgerBookView>(key, async () => {
    const r = await loadLedgerBook({ kind, config });
    return r.ok ? { ok: true, value: r.book } : r;
  });
  return { book: value, error, pending, kind };
}

/** The sustainability volume on the selected ledger (Roadmap N6 slice 4): Plan the working copy's first year, Actual the reporting year. */
export function useSustainabilityBasis() {
  const { kind } = useLedger();
  const { config } = useScenario();
  // Bumped after a record is entered or removed, so Actual re-reads.
  const [nonce, setNonce] = useState(0);
  const key = `${kind}|${nonce}|${JSON.stringify(config)}`;
  const { value, error, pending } = usePosted<{ basis: SustainabilityBasis; records: SustainabilityRecords | null }>(key, async () => {
    const r = await loadSustainabilityBasis({ kind, config });
    return r.ok ? { ok: true, value: { basis: r.basis, records: r.records } } : r;
  });
  return { basis: value?.basis ?? null, records: value?.records ?? null, error, pending, kind, reload: () => setNonce((n) => n + 1) };
}

export function useLedgerJournal(from: string | null, to: string | null) {
  const { kind } = useLedger();
  const { config } = useScenario();
  const key = `${kind}|${from}|${to}|${JSON.stringify(config)}`;
  const { value, error, pending } = usePosted<LedgerJournalView | null>(key, async () => {
    if (!from || !to) return { ok: true, value: null };
    const r = await loadLedgerJournal({ kind, config, from, to });
    return r.ok ? { ok: true, value: r.journal } : r;
  });
  return { journal: value, error, pending };
}

/**
 * The period a statement page shows: a granularity and a label. Plan opens on its
 * first year; Actual on its latest month. A label the book no longer has falls
 * back to that default.
 */
export function useStatementPeriod(book: LedgerBookView | null) {
  const [choice, setChoice] = useState<{ granularity: Granularity; label: string | null }>({ granularity: 'year', label: null });
  const [forKind, setForKind] = useState<LedgerKind | null>(null);
  if (book && book.kind !== forKind) {
    setForKind(book.kind);
    setChoice({ granularity: book.kind === 'plan' ? 'year' : 'month', label: null });
  }
  let period: StatementPeriod | null = null;
  if (book) {
    const list = periodsOf(book, choice.granularity);
    period = list.find((p) => p.label === choice.label) ?? (book.kind === 'plan' ? list[0] : list.at(-1)) ?? null;
  }
  return {
    granularity: choice.granularity,
    period,
    setGranularity: (granularity: Granularity) => setChoice({ granularity, label: null }),
    setLabel: (label: string) => setChoice((c) => ({ ...c, label })),
  };
}

/**
 * The world an operations page runs in.
 *
 *   Plan    the open forecast's own run: its pickup points, services and flat plans with the
 *           forecast's edits, no stored order, no recorded stock, receipt or purchase
 *           order — what it makes is what its own sowings make. Nothing is recorded.
 *   Actual  the real farm: the subscriber records' services and flat plans with no
 *           forecast edit, the confirmed and distributed orders on file, and recorded
 *           stock, receipts and purchase orders. Recording is live.
 */
export function useOperationsWorld<R extends { orders?: readonly unknown[]; sowings?: readonly unknown[]; distributions?: readonly unknown[]; receipts?: readonly unknown[]; rawSowings?: readonly unknown[]; purchaseOrders?: readonly unknown[] }>(recorded: R) {
  const { kind } = useLedger();
  const { resolved } = useScenario();
  const isPlan = kind === 'plan';
  const recordPickupPoints = useMemo(() => resolveSubscriberPickupPoints(resolved.subscribers, {}, { closures: resolved.closures }), [resolved.subscribers, resolved.closures]);
  const world = useMemo(() => {
    const empty = <T,>(v: T | undefined): T | undefined => (v === undefined ? undefined : ([] as unknown as T));
    const pick = <K extends keyof R>(k: K): R[K] => (isPlan ? (empty(recorded[k]) as R[K]) : recorded[k]);
    return {
      orders: pick('orders'),
      sowings: pick('sowings'),
      distributions: pick('distributions'),
      receipts: pick('receipts'),
      rawSowings: pick('rawSowings'),
      purchaseOrders: pick('purchaseOrders'),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlan, recorded.orders, recorded.sowings, recorded.distributions, recorded.receipts, recorded.rawSowings, recorded.purchaseOrders]);
  return {
    kind,
    isPlan,
    /** Pickup points for the order book: the forecast's on Plan, the records' on Actual. */
    pickupPoints: isPlan ? resolved.demand.pickupPoints : recordPickupPoints,
    ...world,
    /** Recording controls show on Actual only. */
    recording: !isPlan,
    /** Forecast edits show on Plan only. */
    forecastEditing: isPlan,
  } as { kind: LedgerKind; isPlan: boolean; pickupPoints: typeof recordPickupPoints; recording: boolean; forecastEditing: boolean } & { [K in keyof R]: R[K] };
}
