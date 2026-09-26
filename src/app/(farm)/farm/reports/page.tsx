import { cookies } from 'next/headers';
import { PageHeader } from '@/components/ui';
import { getFarmAccess } from '@/server/access';
import { buildReportLibrary } from '@/server/reports';
import { parseRecent, RECENT_REPORTS_COOKIE } from '@/engine/reports';
import { ReportsClient } from '@/app/(farm)/farm/reports/ReportsClient';
import { withWorkspace } from '@/server/workspace';

export const dynamic = 'force-dynamic';

/**
 * Reports (Roadmap Phase E): the library of managerial report packages, at least one
 * per section of the main menu, in the menu's order. Every row is read from the same
 * engine functions and records the module pages read; the library states the figures
 * and where they came from. Admin-only packages are built for admins alone, so an
 * operator's page never reads or sends a company financial.
 */
export default async function ReportsPage() {
  return withWorkspace(() => ReportsPageInner());
}

async function ReportsPageInner() {
  const [access, jar] = await Promise.all([getFarmAccess(), cookies()]);
  const library = await buildReportLibrary(access);
  const recent = parseRecent(jar.get(RECENT_REPORTS_COOKIE)?.value).filter((id) => library.reports.some((r) => r.def.id === id));

  return (
    <>
      <PageHeader
        title="Reports"
        purpose="Read each section’s management reports at summary level, and export the workbook."
        functions={['Report sections', 'Open detail', 'Most recently viewed', 'Lenses', 'Export']}
        howItWorks={
          <ul>
            <li>Report packages cover every section of the menu, in the menu&rsquo;s order.</li>
            <li>Each report opens at summary level. Its detail rows open on the toggle.</li>
            <li>Figures on the ledger selected in the forecast bar follow it.</li>
            <li>Records-only reports read the recorded documents whatever is selected.</li>
            <li>The module page behind each report carries the full detail.</li>
          </ul>
        }
        right={<span className="farm-kpi-sub">As of {library.today} · {library.worldLabel}</span>}
        status="live"
      />
      <ReportsClient reports={library.reports} recent={recent} isAdmin={access.isSuperAdmin} />
    </>
  );
}
