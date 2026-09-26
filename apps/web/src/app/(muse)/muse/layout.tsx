import type { Metadata } from 'next';
import { MUSE_TAB_ICONS } from './_assets/tab-icons';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import './_components/muse.css';
import { museFontVars } from './_components/fonts';
import { MuseSidebar } from './_components/MuseSidebar';
import { ScenarioBar } from './_components/ScenarioBar';
import { OmniSearch } from './_components/OmniSearch';
import { ExportPageButton } from './_components/ExportPageButton';
import { PAGE_CONTROL_GROUPS, pageControlsId } from './_components/page-controls-slot';
import { BRAND_LINE } from './_components/ui';
import { ScenarioProvider } from './_state/scenario-store';
import { LedgerProvider } from './_state/ledger';
import { LEDGER_COOKIE, isLedgerKind } from './_engine/ledger-view';
import { getMuseAccess } from './_lib/access';
import { getScenarioView, listScenarios } from './_lib/scenarios';
import { listRecipes } from './_lib/recipes';
import { listCustomers } from './_lib/customers';
import { listEquipment } from './_lib/equipment';
import { listPackagingLibrary } from './_lib/packaging';
import { listAllCatalog } from './_lib/supplier-catalog';
import { listLoans, listFixedCostLines, listLeasehold } from './_lib/finance';
import { listTimeStudies } from './_lib/time-studies';
import { loadCalendar } from './_lib/periods';

export const metadata: Metadata = {
  title: 'Muse Kitchen Impact OS',
  robots: { index: false, follow: false },
  icons: MUSE_TAB_ICONS,
};

export default async function MuseLayout({ children }: { children: React.ReactNode }) {
  const access = await getMuseAccess();

  if (!access.userId) redirect('/sign-in');

  // Two roles, admin and operator (Roadmap O5); an admin is always an operator.
  if (!access.isOperator) {
    return (
      <div className={`muse-root ${museFontVars}`}>
        <div className="max-w-136 my-[12vh]! mx-auto! py-0 px-6">
          <div className="muse-brand-name muse-c-ink">
            Muse Kitchen Impact OS
          </div>
          <div className="muse-card mt-5!">
            <div className="muse-card-title">Access</div>
            <p className="muse-fs-md muse-c-soft leading-[1.5]">
              This is a private preview. Your account
              {access.email ? ` (${access.email})` : ''} is signed in but holds neither the
              operator nor the admin role for this workspace. Access is granted per named person.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // What this person is looking at: an open forecast, or the plan of record.
  const ledgerCookie = (await cookies()).get(LEDGER_COOKIE)?.value;
  const ledgerKind = isLedgerKind(ledgerCookie) ? ledgerCookie : 'plan';
  const [view, saved, library, customers, calendar, equipment, packaging, catalog, loans, fixedCostLines, leasehold, timeStudies] = await Promise.all([
    getScenarioView(),
    listScenarios({ userId: access.userId, isSuperAdmin: access.isSuperAdmin }),
    listRecipes(),
    listCustomers(),
    loadCalendar(),
    listEquipment(),
    listPackagingLibrary(),
    listAllCatalog(),
    listLoans(),
    listFixedCostLines(),
    listLeasehold(),
    listTimeStudies(),
  ]);

  return (
    <div className={`muse-root ${museFontVars}`}>
      <ScenarioProvider initialConfig={view.config} library={library} customers={customers} closures={calendar.closures} equipment={equipment} packaging={packaging} catalog={catalog} loans={loans} fixedCostLines={fixedCostLines} leasehold={leasehold} timeStudies={timeStudies.studies} isSuperAdmin={access.isSuperAdmin}>
        <LedgerProvider initialKind={ledgerKind}>
        <div className="muse-shell">
          <MuseSidebar isAdmin={access.isSuperAdmin} userName={access.name ?? access.email ?? 'Signed in'} userEmail={access.email} />
          <div className="muse-main">
            {/* The scenario bar is the top bar (Robert, 2026-09-18); the second bar carries the
                page's own controls (`PageControls`), the search and the page export. */}
            <ScenarioBar
              isSuperAdmin={access.isSuperAdmin}
              basis={view.basis}
              openId={view.basis === 'forecast' ? view.id : null}
              openLabel={view.basis === 'forecast' ? view.label : null}
              planLabel={view.planLabel}
              saved={saved.map((s) => ({
                id: s.id,
                label: s.label,
                ownerTier: s.ownerTier,
                isActive: s.isActive,
                config: s.config,
              }))}
            />
            <div className="muse-topbar">
              <div className="muse-page-controls">
                {PAGE_CONTROL_GROUPS.map((g) => <span key={g} id={pageControlsId(g)} className="muse-page-controls-group" />)}
              </div>
              <OmniSearch />
              <ExportPageButton />
            </div>
            <div className="muse-content">{children}</div>
            <footer className="muse-footer">{BRAND_LINE}</footer>
          </div>
        </div>
        </LedgerProvider>
      </ScenarioProvider>
    </div>
  );
}
