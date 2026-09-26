import { PageHeader } from '../../_components/ui';
import { getMuseAccess } from '../../_lib/access';
import { listScenarios } from '../../_lib/scenarios';
import { listRecipes } from '../../_lib/recipes';
import { listCustomers } from '../../_lib/customers';
import { listEquipment } from '../../_lib/equipment';
import { listPackagingLibrary } from '../../_lib/packaging';
import { listAllCatalog } from '../../_lib/supplier-catalog';
import { listLoans, listFixedCostLines, listLeasehold } from '../../_lib/finance';
import { listMenuCycles } from '../../_lib/orders';
import { loadCalendar } from '../../_lib/periods';
import { loadSupplierTerms } from '../../_lib/working-capital';
import { listTimeStudies } from '../../_lib/time-studies';
import { leanSuppliersById } from '../../_lib/supplier-links';
import { CompareClient } from './CompareClient';
import { CompareTabs } from './CompareTabs';
import { RecipeCompareClient } from './RecipeCompareClient';

export const dynamic = 'force-dynamic';

/** Compare in two modes: Day (scheduler build plan W5) and Recipe (agentic-assistance build plan R3). */
export default async function ComparePage() {
  const access = await getMuseAccess();
  // No signed-in user owns no forecast: the page still compares against the plan-data defaults.
  const [scenarios, library, customers, calendar, supplierTerms, equipment, packaging, catalog, loans, fixedCostLines, leasehold, cycles, studies] = await Promise.all([
    access.userId ? listScenarios({ userId: access.userId, isSuperAdmin: access.isSuperAdmin }) : Promise.resolve([]),
    listRecipes(),
    listCustomers(),
    loadCalendar(),
    loadSupplierTerms(),
    listEquipment(),
    listPackagingLibrary(),
    listAllCatalog(),
    listLoans(),
    listFixedCostLines(),
    listLeasehold(),
    listMenuCycles(),
    listTimeStudies(),
  ]);
  const today = new Date().toISOString().slice(0, 10);
  const supplierNames = Object.fromEntries(Object.entries(leanSuppliersById(Object.keys(catalog))).map(([id, s]) => [id, s.name]));

  return (
    <>
      <PageHeader
        title="Compare"
        purpose="Set one day under two forecasts, or two recipes side by side."
        functions={['Day', 'Recipe', 'Findings', 'Proposal']}
        connects={[
          { href: '/muse/production-planning/schedule', dir: 'from' },
          { href: '/muse/recipes', dir: 'both' },
        ]}
        howItWorks={
          <ul>
            <li>Day: the same day placed under two forecasts. Each side resolves its own forecast and places the day with the same scheduler.</li>
            <li>The Day table is the difference in portions placed, the binding unit, makespan, crew and idle hours, labor minutes per portion, chiller use and findings.</li>
            <li>Recipe, for admins: two recipes costed under the open forecast, a library recipe against a variant.</li>
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
            customers={customers}
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
        recipe={
          access.isSuperAdmin ? (
            <RecipeCompareClient studies={studies.studies} catalog={catalog} supplierNames={supplierNames} today={today} />
          ) : null
        }
      />
    </>
  );
}
