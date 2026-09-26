import { PageHeader } from '@/components/ui';
import { getFarmAccess } from '@/server/access';
import { listNutrients } from '@/server/nutrients';
import { listCropPlans } from '@/server/crop-plans';
import { isGrowPlanCarrier } from '@/engine/grow-plan-bridge';
import { plansNaming } from '@/engine/nutrients';
import { NutrientsClient } from '@/app/(farm)/farm/nutrients/NutrientsClient';
import { withWorkspace } from '@/server/workspace';

export const dynamic = 'force-dynamic';

/** The Nutrients & Supplements library: what a grow plan's nutrient line names and is costed against. */
export default async function NutrientsPage() {
  return withWorkspace(() => NutrientsPageInner());
}

async function NutrientsPageInner() {
  const [access, nutrients, library] = await Promise.all([getFarmAccess(), listNutrients(), listCropPlans()]);
  const plans = library.filter(isGrowPlanCarrier).map((c) => c.plan);
  const namedBy = Object.fromEntries(nutrients.map((n) => [n.key, plansNaming(n.key, plans)]));
  return (
    <>
      <PageHeader
        title="Nutrients & Supplements"
        purpose="Keep the nutrient solutions and supplements a grow plan's nutrient line names: strength, price and what each is meant to elicit."
        functions={['The library', 'Add supplement']}
        connects={[
          { href: '/farm/crop-plans', dir: 'to' },
          { href: '/farm/sources', dir: 'from' },
        ]}
        howItWorks={
          <ul>
            <li>A grow plan&rsquo;s nutrient line names one row here and is costed at its strength in ml per gallon times the gallons the tray takes from the stage the line starts, times the price per ml. A strength typed on the plan&rsquo;s line stands over the row&rsquo;s.</li>
            <li>A price is typed as what was paid for a container and its size in gallons, and kept as dollars per ml. Per gallon of water is the strength times the price per ml.</li>
            <li>A figure typed here is STATED; a seeded figure keeps its tag until it is edited. What a row is meant to elicit cites rows of the science library, registered on Sources.</li>
            <li>A row a grow plan names cannot be deleted, and Water only stays.</li>
          </ul>
        }
        status="live"
      />
      <NutrientsClient nutrients={nutrients} namedBy={namedBy} canEdit={access.isSuperAdmin} />
    </>
  );
}
