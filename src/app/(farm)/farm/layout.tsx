import type { Metadata } from 'next';
import { FARM_TAB_ICONS } from '@/assets/tab-icons';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import '@/components/farm.css';
import { farmFontVars } from '@/components/fonts';
import { FarmSidebar } from '@/components/FarmSidebar';
import { ScenarioBar } from '@/components/ScenarioBar';
import { OmniSearch } from '@/components/OmniSearch';
import { ExportPageButton } from '@/components/ExportPageButton';
import { PAGE_CONTROL_GROUPS, pageControlsId } from '@/components/page-controls-slot';
import { BRAND_LINE } from '@/components/ui';
import { ScenarioProvider } from '@/state/scenario-store';
import { LedgerProvider } from '@/state/ledger';
import { LEDGER_COOKIE, isLedgerKind } from '@/engine/ledger-view';
import { getFarmAccess } from '@/server/access';
import { getScenarioView, listScenarios } from '@/server/scenarios';
import { listGrowPlans } from '@/server/grow-plans';
import { listNutrients } from '@/server/nutrients';
import { listMedia } from '@/server/media';
import { listSubscribers } from '@/server/subscribers';
import { listEquipment } from '@/server/equipment';
import { listPackagingLibrary } from '@/server/packaging';
import { listAllCatalog } from '@/server/supplier-catalog';
import { listLoans, listFixedCostLines, listLeasehold } from '@/server/finance';
import { listTimeStudies } from '@/server/time-studies';
import { loadCalendar } from '@/server/periods';
import { withWorkspace } from '@/server/workspace';

/** Every page under this layout reads the workspace at request time; nothing here is prerendered at build. */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Cotyledon',
  robots: { index: false, follow: false },
  icons: FARM_TAB_ICONS,
};

export default async function FarmLayout(props: Parameters<typeof FarmLayoutInner>[0]) {
  return withWorkspace(() => FarmLayoutInner(props));
}

async function FarmLayoutInner({ children }: { children: React.ReactNode }) {
  const access = await getFarmAccess();

  if (!access.userId) redirect('/sign-in');

  // Two roles, admin and operator (Roadmap O5); an admin is always an operator.
  if (!access.isOperator) {
    return (
      <div className={`farm-root ${farmFontVars}`}>
        <div className="max-w-136 my-[12vh]! mx-auto! py-0 px-6">
          <div className="farm-brand-name farm-c-ink">
            Cotyledon
          </div>
          <div className="farm-card mt-5!">
            <div className="farm-card-title">Access</div>
            <p className="farm-fs-md farm-c-soft leading-[1.5]">
              Your account{access.email ? ` (${access.email})` : ''} is signed in but is not a member of a farm&rsquo;s
              organization. An admin of the farm can add you, or you can <a className="farm-link" href="/farm/enter">choose or create a farm</a>.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // What this person is looking at: an open forecast, or the plan of record.
  const ledgerCookie = (await cookies()).get(LEDGER_COOKIE)?.value;
  const ledgerKind = isLedgerKind(ledgerCookie) ? ledgerCookie : 'plan';
  const [view, saved, library, subscribers, calendar, equipment, packaging, catalog, loans, fixedCostLines, leasehold, timeStudies, nutrients, media] = await Promise.all([
    getScenarioView(),
    listScenarios({ userId: access.userId, isSuperAdmin: access.isSuperAdmin }),
    listGrowPlans(),
    listSubscribers(),
    loadCalendar(),
    listEquipment(),
    listPackagingLibrary(),
    listAllCatalog(),
    listLoans(),
    listFixedCostLines(),
    listLeasehold(),
    listTimeStudies(),
    listNutrients(),
    listMedia(),
  ]);

  return (
    <div className={`farm-root ${farmFontVars}`}>
      <ScenarioProvider initialConfig={view.config} library={library} subscribers={subscribers} closures={calendar.closures} equipment={equipment} packaging={packaging} catalog={catalog} loans={loans} fixedCostLines={fixedCostLines} leasehold={leasehold} timeStudies={timeStudies.studies} nutrients={nutrients} media={media} isSuperAdmin={access.isSuperAdmin}>
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
