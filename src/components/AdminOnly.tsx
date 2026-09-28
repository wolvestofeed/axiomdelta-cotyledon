/**
 * Cotyledon — the notice an operator sees in place of an admin-only page
 * (Roadmap O5). The page returns it before loading anything, so none of the
 * page's data is read or sent to an operator's browser.
 */

export function AdminOnlyNotice({ area, note }: { area: string; note?: string }) {
  return (
    <div className="farm-card">
      <div className="farm-card-title">Admins only</div>
      <p className="farm-fs-md farm-c-soft leading-[1.5]">
        {area} is open to admins only. {note ?? 'The company financials — the statements, receivables and payables, capital and financing — are held for the three admins.'}
      </p>
    </div>
  );
}
