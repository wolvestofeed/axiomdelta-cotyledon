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
import { CompareClient } from '@/app/(farm)/farm/production-planning/compare/CompareClient';
import { withWorkspace } from '@/server/workspace';

export const dynamic = 'force-dynamic';

/**
 * Compare: one day placed under two forecasts (scheduler build plan W5). The Crop plan tab, the agentic
 * variant builder (`CropPlanCompareClient.tsx`, `CompareTabs.tsx`), is off the page until the agent is
 * re-based onto grow plan lines.
 */
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

  return (
    <>
      <PageHeader
        title="Compare"
        purpose="Place one day under two forecasts and read what differs."
        functions={['The day under two forecasts', 'Findings']}
        connects={[
          { href: '/farm/production-planning/schedule', dir: 'from' },
          { href: '/farm/crop-plans', dir: 'both' },
        ]}
        howItWorks={
          <ul>
            <li>The same day placed under two forecasts. Each side resolves its own forecast, rolls its own order book through the grow units and places the day with the same scheduler.</li>
            <li>The table is the difference in trays sown and harvested, the binding unit, makespan, crew and idle hours, labor minutes per tray, the trays on the shelves and their daily stream, and findings.</li>
            <li>Any day of the window can be placed, weekends included.</li>
            <li>The table reports. It does not pick.</li>
          </ul>
        }
        status="live"
      />
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
    </>
  );
}
