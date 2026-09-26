import Link from 'next/link';
import type { PostedLedger } from '../../_lib/ledgers';

/**
 * The server pages' month picker (Roadmap N6): the month shown, and every month of
 * the ledger as links. Placed on the second bar through `PageControls`; the ledger and forecast are named on the scenario bar above it.
 */
export function LedgerMonthBar({ selected, period, basePath }: { selected: PostedLedger; period: string; basePath: string }) {
  const months = selected.ledger.months.map((m) => m.label);
  return (
    <span className="farm-fs-xs farm-c-soft inline-flex flex-wrap items-center gap-x-[0.45rem]">
      <span className="farm-kpi-sub">Month</span>
      {months.map((m) => (
        m === period
          ? <strong key={m} className="farm-c-ink">{m}</strong>
          : <Link key={m} className="farm-link" href={`${basePath}?period=${m}`}>{m}</Link>
      ))}
      {selected.kind === 'actual' && selected.empty && <span className="farm-c-faint">nothing on record yet</span>}
    </span>
  );
}

/** The month a server page shows: the one asked for when the ledger has it, else today's month on Actual or the first month on Plan. */
export function pickMonth(selected: PostedLedger, asked: string | undefined, today: string): string {
  const months = selected.ledger.months.map((m) => m.label);
  if (asked && months.includes(asked)) return asked;
  if (selected.kind === 'actual') return months.includes(today.slice(0, 7)) ? today.slice(0, 7) : months.at(-1)!;
  return months[0]!;
}
