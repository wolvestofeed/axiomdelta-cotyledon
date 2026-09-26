import { PageHeader } from '@/components/ui';
import { getFarmAccess } from '@/server/access';
import { listScenarios } from '@/server/scenarios';
import { listCropPlans } from '@/server/crop-plans';
import { listSubscribers } from '@/server/subscribers';
import { listEquipment } from '@/server/equipment';
import { listPackagingLibrary } from '@/server/packaging';
import { listAllCatalog } from '@/server/supplier-catalog';
import { listLoans, listFixedCostLines, listLeasehold } from '@/server/finance';
import { listSubscriptionCycles } from '@/server/orders';
import { loadCalendar } from '@/server/periods';
import { loadSupplierTerms } from '@/server/working-capital';
import { listTimeStudies } from '@/server/time-studies';
import { leanSuppliersById } from '@/server/supplier-links';
import { CompareClient } from '@/app/(farm)/farm/production-planning/compare/CompareClient';
import { CompareTabs } from '@/app/(farm)/farm/production-planning/compare/CompareTabs';
import { CropPlanCompareClient } from '@/app/(farm)/farm/production-planning/compare/CropPlanCompareClient';
import { withWorkspace } from '@/server/workspace';

export const dynamic = 'force-dynamic';

/** Compare in two modes: Day (scheduler build plan W5) and Crop plan (agentic-assistance build plan R3). */
export default async function ComparePage() {
  return withWorkspace(() => ComparePageInner());
}

async function ComparePageInner() {
  const access = await getFarmAccess();
  // No signed-in user owns no forecast: the page still compares against the plan-data defaults.
  const [scenarios, library, subscribers, calendar, supplierTerms, equipment, packaging, catalog, loans, fixedCostLines, leasehold, cycles, studies] = await Promise.all([
    access.userId ? listScenarios({ userId: access.userId, isSuperAdmin: access.isSuperAdmin }) : Promise.resolve([]),
    listCropPlans(),
    listSubscribers(),
    loadCalendar(),
    loadSupplierTerms(),
    listEquipment(),
    listPackagingLibrary(),
    listAllCatalog(),
    listLoans(),
    listFixedCostLines(),
    listLeasehold(),
    listSubscriptionCycles(),
    listTimeStudies(),
  ]);
  const today = new Date().toISOString().slice(0, 10);
  const supplierNames = Object.fromEntries(Object.entries(leanSuppliersById(Object.keys(catalog))).map(([id, s]) => [id, s.name]));

  return (
    <>
      <PageHeader
        title="Compare"
        purpose="Set one day under two forecasts, or two crop plans side by side."
        functions={['Day', 'Crop plan', 'Findings', 'Proposal']}
        connects={[
          { href: '/farm/production-planning/schedule', dir: 'from' },
          { href: '/farm/crop-plans', dir: 'both' },
        ]}
        howItWorks={
          <ul>
            <li>Day: the same day placed under two forecasts. Each side resolves its own forecast and places the day with the same scheduler.</li>
            <li>The Day table is the difference in units placed, the binding unit, makespan, crew and idle hours, labor minutes per unit, blackout rack use and findings.</li>
            <li>Crop plan, for admins: two crop plans costed under the open forecast, a library crop plan against a variant.</li>
            <li>A variant comes from a typed or dictated instruction, is reviewed on a proposal card before costing, and saved to the library only on click.</li>
            <li>Both tables report. Neither picks.</li>
          </ul>
        }
        status="live"
      />
      <CompareTabs
        day={
          <CompareClient
            today={today}
            scenarios={scenarios.map((s) => ({ id: s.id, label: s.label, config: s.config, isActive: s.isActive, updatedAt: s.updatedAt.toISOString() }))}
            library={library}
            subscribers={subscribers}
            closures={calendar.closures}
            supplierTerms={supplierTerms}
            equipment={equipment}
            catalog={catalog}
            loans={loans}
            fixedCostLines={fixedCostLines}
            leasehold={leasehold}
            packaging={packaging}
            cycles={cycles}
            studies={studies.studies}
          />
        }
        cropPlan={
          access.isSuperAdmin ? (
            <CropPlanCompareClient studies={studies.studies} catalog={catalog} supplierNames={supplierNames} today={today} />
          ) : null
        }
      />
    </>
  );
}
