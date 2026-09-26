import type { Metadata } from 'next';
import { FARM_TAB_ICONS } from './_assets/tab-icons';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import './_components/farm.css';
import { farmFontVars } from './_components/fonts';
import { FarmSidebar } from './_components/FarmSidebar';
import { ScenarioBar } from './_components/ScenarioBar';
import { OmniSearch } from './_components/OmniSearch';
import { ExportPageButton } from './_components/ExportPageButton';
import { PAGE_CONTROL_GROUPS, pageControlsId } from './_components/page-controls-slot';
import { BRAND_LINE } from './_components/ui';
import { ScenarioProvider } from './_state/scenario-store';
import { LedgerProvider } from './_state/ledger';
import { LEDGER_COOKIE, isLedgerKind } from './_engine/ledger-view';
import { getFarmAccess } from './_lib/access';
import { getScenarioView, listScenarios } from './_lib/scenarios';
import { listCropPlans } from './_lib/crop-plans';
import { listSubscribers } from './_lib/subscribers';
import { listEquipment } from './_lib/equipment';
import { listPackagingLibrary } from './_lib/packaging';
import { listAllCatalog } from './_lib/supplier-catalog';
import { listLoans, listFixedCostLines, listLeasehold } from './_lib/finance';
import { listTimeStudies } from './_lib/time-studies';
import { loadCalendar } from './_lib/periods';

export const metadata: Metadata = {
  title: 'MicroFarm',
  robots: { index: false, follow: false },
  icons: FARM_TAB_ICONS,
};

export default async function FarmLayout({ children }: { children: React.ReactNode }) {
  const access = await getFarmAccess();

  if (!access.userId) redirect('/sign-in');

  // Two roles, admin and operator (Roadmap O5); an admin is always an operator.
  if (!access.isOperator) {
    return (
      <div className={`farm-root ${farmFontVars}`}>
        <div className="max-w-136 my-[12vh]! mx-auto! py-0 px-6">
          <div className="farm-brand-name farm-c-ink">
            MicroFarm
          </div>
          <div className="farm-card mt-5!">
            <div className="farm-card-title">Access</div>
            <p className="farm-fs-md farm-c-soft leading-[1.5]">
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
  const [view, saved, library, subscribers, calendar, equipment, packaging, catalog, loans, fixedCostLines, leasehold, timeStudies] = await Promise.all([
    getScenarioView(),
    listScenarios({ userId: access.userId, isSuperAdmin: access.isSuperAdmin }),
    listCropPlans(),
    listSubscribers(),
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
    <div className={`farm-root ${farmFontVars}`}>
      <ScenarioProvider initialConfig={view.config} library={library} subscribers={subscribers} closures={calendar.closures} equipment={equipment} packaging={packaging} catalog={catalog} loans={loans} fixedCostLines={fixedCostLines} leasehold={leasehold} timeStudies={timeStudies.studies} isSuperAdmin={access.isSuperAdmin}>
        <LedgerProvider initialKind={ledgerKind}>
        <div className="farm-shell">
          <FarmSidebar isAdmin={access.isSuperAdmin} userName={access.name ?? access.email ?? 'Signed in'} userEmail={access.email} />
          <div className="farm-main">
            {/* The scenario bar is the top bar; the second bar carries the
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
            <div className="farm-topbar">
              <div className="farm-page-controls">
                {PAGE_CONTROL_GROUPS.map((g) => <span key={g} id={pageControlsId(g)} className="farm-page-controls-group" />)}
              </div>
              <OmniSearch />
              <ExportPageButton />
            </div>
            <div className="farm-content">{children}</div>
            <footer className="farm-footer">{BRAND_LINE}</footer>
          </div>
        </div>
        </LedgerProvider>
      </ScenarioProvider>
    </div>
  );
}
