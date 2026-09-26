import { Card, PreviewBanner } from '../_components/ui';

/**
 * Impact OS — the CompTable connection, shown on HR to admins
 * (designed, not connected). Decisions recorded 2026-09-14 (Robert): CompTable
 * is where Muse Kitchen's HR runs — roster, wages, burden, benefits, the
 * published schedule and payroll. Muse sends clock times and labor demand and
 * receives labor cost. No pay or confidential employee information is held in
 * Muse.
 */

const OWNERSHIP: { area: string; comptable: string; muse: string }[] = [
  { area: 'Roster, positions, wages and salaries', comptable: 'Source of record', muse: 'Not held' },
  { area: 'Payroll burden, benefits, payroll liabilities', comptable: 'Source of record', muse: 'Receives totals by account' },
  { area: 'Two-week schedule', comptable: 'Adjusted and published to staff', muse: 'Sends staff demand; receives the published schedule' },
  { area: 'Clock times', comptable: 'Receives each punch', muse: 'Taken on the Floor' },
  { area: 'Labor hours the production plan requires', comptable: 'Receives as labor demand', muse: 'Derived from the plan' },
  { area: 'Hours charged to each batch', comptable: '—', muse: 'Batch records' },
  { area: 'Closed payroll periods', comptable: 'Closed there', muse: 'Posted to the Actual ledger' },
];

const FEEDS: { direction: string; feed: string; when: string; carries: string }[] = [
  { direction: 'Muse → CompTable', feed: 'Clock punches', when: 'As each punch is taken on the Floor', carries: 'CompTable employee reference, punch kind (in, break start, break end, out), time and kitchen-local work date; no name' },
  { direction: 'Muse → CompTable', feed: 'Staff demand', when: 'Two weeks out, from the production plans', carries: 'Headcount and hours by task and station per day' },
  { direction: 'Muse → CompTable', feed: 'Labor demand', when: 'Per forecast version', carries: 'Hours required by task and station across the horizon, and the operating day' },
  { direction: 'CompTable → Muse', feed: 'Labor cost', when: 'In answer to a labor demand', carries: 'Wages, payroll taxes, workers’ comp and benefits by period and account, stamped with the Muse forecast version and the CompTable scenario that priced it' },
  { direction: 'CompTable → Muse', feed: 'Published schedule', when: 'Each two-week schedule', carries: 'Shifts by person, position and day, one document per published week; no pay' },
  { direction: 'CompTable → Muse', feed: 'Closed payroll period', when: 'When a pay period closes', carries: 'Totals by account for the kitchen, regular and overtime hours, pay date' },
  { direction: 'CompTable → Muse', feed: 'Staff record (admins)', when: 'Read when an admin opens a person on HR', carries: 'Name, position, employment type, status, dates, base wage, scheduled hours and bonus — shown to the admin, never stored in Muse' },
];

export function CompTableConnection() {
  return (
    <>
      <Card title="CompTable connection (admins)" className="mt-4">
        <PreviewBanner>
          Not connected. Contract version 1 is written — the documents, their fields and the checks each passes. Nothing flows until Muse runs on its own domain and the Muse Kitchen account exists in CompTable.
        </PreviewBanner>
        <div className="muse-scroll-x mt-3">
          <table className="muse-table">
            <thead><tr><th>Area</th><th>CompTable</th><th>Muse</th></tr></thead>
            <tbody>
              {OWNERSHIP.map((r) => (
                <tr key={r.area}>
                  <td className="font-medium!">{r.area}</td>
                  <td className="muse-c-soft">{r.comptable}</td>
                  <td className="muse-c-soft">{r.muse}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="What crosses between them" className="mt-4">
        <div className="muse-scroll-x">
          <table className="muse-table">
            <thead><tr><th>Direction</th><th>Feed</th><th>When</th><th>Carries</th></tr></thead>
            <tbody>
              {FEEDS.map((f) => (
                <tr key={f.feed}>
                  <td className="whitespace-nowrap! muse-c-accent-hi font-semibold!">{f.direction}</td>
                  <td className="font-medium!">{f.feed}</td>
                  <td className="muse-c-soft">{f.when}</td>
                  <td className="muse-c-soft">{f.carries}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muse-kpi-sub mt-2">
          No feed carries an individual’s pay. A notice arrives as a signed webhook naming the event; the record is read through an authenticated, read-only API scoped to the Muse Kitchen account; every event is recorded when handled, so a repeated notice never posts twice. A labor cost is tied to the forecast version it answered and reads as out of date when the forecast changes.
        </p>
      </Card>
    </>
  );
}
