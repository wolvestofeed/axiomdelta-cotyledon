'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { accessRefusal, requireMuseOperator, requireMuseSuperAdmin } from './access';
import { postLedger } from './ledgers';
import type { MuseScenarioConfig } from '../_engine/scenario';
import { linksFrom, onePerFrom } from './entity-links';
import { hydrateEntityRefs } from './entity-directory';
import { entityRef } from '../_engine/entity-links';
import { LEDGER_COOKIE, isLedgerKind, type LedgerBookView, type LedgerJournalView, type LedgerKind } from '../_engine/ledger-view';

/**
 * Impact OS — the ledger selector and the books behind it (Roadmap N6).
 *
 * Plan posts the working copy the browser sends — unsaved edits included
 * (Robert, 2026-09-16) — through the forecast timeline and the Plan ledger.
 * Actual posts the recorded documents. Both read the same definitions and post
 * through the same functions; nothing is written.
 */

type Result<T> = ({ ok: true } & T) | { ok: false; error: string };

function refuse(e: unknown): { ok: false; error: string } {
  const refused = accessRefusal(e);
  if (refused) return refused;
  throw e;
}

/** Choose the ledger this person reads. A cookie: it follows the person, not the workspace. */
export async function setLedgerKind(kind: unknown): Promise<Result<object>> {
  if (!isLedgerKind(kind)) return { ok: false, error: 'Choose Plan or Actual.' };
  try {
    await requireMuseOperator();
  } catch (e) {
    return refuse(e);
  }
  const jar = await cookies();
  jar.set(LEDGER_COOKIE, kind, { path: '/muse', httpOnly: true, sameSite: 'lax', maxAge: 60 * 60 * 24 * 30 });
  revalidatePath('/muse', 'layout');
  return { ok: true };
}

const BookInput = z.object({
  kind: z.enum(['plan', 'actual']),
  /** The working copy's scenario overlay. */
  config: z.record(z.string(), z.unknown()).default({}),
});

/** The statements of the selected ledger, by month, quarter and year. Company financials: super admins. */
export async function loadLedgerBook(input: unknown): Promise<Result<{ book: LedgerBookView }>> {
  const parsed = BookInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'The ledger request was not understood.' };
  try {
    await requireMuseSuperAdmin();
  } catch (e) {
    return refuse(e);
  }
  const started = performance.now();
  const r = await postLedger(parsed.data.kind, parsed.data.config as MuseScenarioConfig);
  const notes = [...new Set(r.ledger.periods.flatMap((p) => p.notes))];
  const book: LedgerBookView = {
    kind: r.kind,
    forecastLabel: r.kind === 'plan' ? r.view.label : null,
    from: r.ledger.from,
    to: r.ledger.to,
    months: r.ledger.months,
    quarters: r.ledger.quarters,
    years: r.ledger.years,
    empty: r.empty,
    balanced: r.ledger.balanced,
    entryCount: r.ledger.entries.length,
    horizonYears: r.timeline?.horizonYears ?? null,
    gaps: r.timeline?.gaps ?? [],
    absorption: r.ledger.absorption,
    notes: notes.slice(0, 60),
    computedMs: Math.round(performance.now() - started),
  };
  return { ok: true, book };
}

const JournalInput = BookInput.extend({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  limit: z.number().int().min(1).max(2000).default(400),
});

/** The journal entries of the selected ledger in a date range, with the trial balance through its end. Super admins. */
export async function loadLedgerJournal(input: unknown): Promise<Result<{ journal: LedgerJournalView }>> {
  const parsed = JournalInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'The journal request was not understood.' };
  try {
    await requireMuseSuperAdmin();
  } catch (e) {
    return refuse(e);
  }
  const { from, to, limit } = parsed.data;
  const r = await postLedger(parsed.data.kind, parsed.data.config as MuseScenarioConfig);
  const sorted = [...r.ledger.entries].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const inRange = sorted.filter((e) => e.date >= from && e.date <= to);
  const net = new Map<string, number>();
  for (const e of sorted) {
    if (e.date > to) continue;
    for (const l of e.lines) net.set(l.accountCode, (net.get(l.accountCode) ?? 0) + l.debitCents - l.creditCents);
  }
  const accountNames = Object.fromEntries(r.ledger.coa.map((a) => [a.code, a.name]));
  const trialBalance = [...net.entries()]
    .filter(([, n]) => n !== 0)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([code, n]) => ({ code, name: accountNames[code] ?? code, debitCents: n > 0 ? n : 0, creditCents: n < 0 ? -n : 0 }));
  const shown = inRange.slice(0, limit);
  const evidence: LedgerJournalView['evidence'] = {};
  if (r.kind === 'actual' && shown.length > 0) {
    const rows = await linksFrom('ledger_entry', shown.map((e) => e.id));
    const one = onePerFrom(rows, 'evidenced_by');
    const byRef = await hydrateEntityRefs(rows.map((x) => entityRef(x.toKind as never, x.toId)));
    for (const e of shown) {
      const l = one[e.id];
      evidence[e.id] = l ? byRef[entityRef(l.toKind as never, l.toId)] ?? null : null;
    }
  }
  return {
    ok: true,
    journal: { kind: r.kind, from, to, entries: shown, truncated: Math.max(0, inRange.length - shown.length), accountNames, trialBalance, evidence },
  };
}
