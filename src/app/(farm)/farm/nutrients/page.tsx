import { PageHeader } from '@/components/ui';
import { getFarmAccess } from '@/server/access';
import { listNutrients } from '@/server/nutrients';
import { listGrowPlans } from '@/server/grow-plans';
import { plansNaming } from '@/engine/nutrients';
import { nutrientPurchaseName } from '@/data/grow-plan';
import { WATER_ONLY_KEY } from '@/data/inputs-catalog';
import { db } from '@/lib/db';
import { rollingCostsWith } from '@/server/grow-plan-rows';
import { RollingAverageCard } from '@/components/RollingAverageCard';
import { NutrientsClient } from '@/app/(farm)/farm/nutrients/NutrientsClient';
import { withWorkspace } from '@/server/workspace';

export const dynamic = 'force-dynamic';

/** The Nutrients & Supplements library: what a grow plan's nutrient line names and is costed against. */
export default async function NutrientsPage() {
  return withWorkspace(() => NutrientsPageInner());
}

async function NutrientsPageInner() {
  const today = new Date().toISOString().slice(0, 10);
  const [access, nutrients, library, rolling] = await Promise.all([getFarmAccess(), listNutrients(), listGrowPlans(), rollingCostsWith(db, today)]);
  const plans = library;
  const namedBy = Object.fromEntries(nutrients.map((n) => [n.key, plansNaming(n.key, plans)]));
  return (
    <>
      <PageHeader
        title="Nutrients & Supplements"
        purpose="Keep the nutrient solutions and supplements a grow plan's nutrient line names: strength, price and what each is meant to elicit."
        functions={['The library', 'Add supplement', 'Rolling 12-month average']}
        connects={[
          { href: '/farm/grow-plans', dir: 'to' },
          { href: '/farm/sources', dir: 'from' },
        ]}
        howItWorks={
          <ul>
            <li>A grow plan&rsquo;s nutrient line names one row here and is costed at its strength in ml per gallon times the gallons the tray takes from the stage the line starts, times the price per ml. A strength typed on the plan&rsquo;s line stands over the row&rsquo;s.</li>
            <li>A price is typed as what was paid for a container and its size in gallons, and kept as dollars per ml. Per gallon of water is the strength times the price per ml.</li>
            <li>A figure typed here is STATED; a seeded figure keeps its tag until it is edited. What a row is meant to elicit cites rows of the science library, registered on Sources.</li>
            <li>A row a grow plan names cannot be deleted, and Water only stays.</li>
            <li>The rolling 12-month average is the dollars over the ml on the accepted receipts of the last twelve months, per solution or supplement: a key figure beside the price, which no plan, order or posting uses.</li>
          </ul>
        }
        status="live"
      />
      <NutrientsClient nutrients={nutrients} namedBy={namedBy} canEdit={access.isSuperAdmin} />
      <RollingAverageCard what="nutrients or supplements" asOf={today} items={nutrients.filter((n) => n.key !== WATER_ONLY_KEY).map((n) => ({ name: n.name, unitWord: 'ml', cost: rolling[nutrientPurchaseName(n.key)] }))} />
    </>
  );
}
