import { PortalPending } from '@/app/(muse)/muse/_components/PortalPending';
import { getMuseAccess } from '@/app/(muse)/muse/_lib/access';
import { PageHeader } from '@/app/(muse)/muse/_components/ui';
import { OrderBuilderClient, type OrderBuilderData } from './OrderBuilderClient';
import { getResolvedActiveInputs } from '@/app/(muse)/muse/_lib/scenarios';
import { packageUnitCost } from '@/app/(muse)/muse/_engine/packaging';

export const dynamic = 'force-dynamic';

/**
 * Order Builder (Robert, 2026-09-16) — a corporate or catering client builds an order: date
 * of service, quantities and recipe options, allergies, packaging, delivery specifications
 * and instructions. A basic page while the Customer Portal is developed: it reads the recipe
 * and packaging libraries and prices the order, and submitting is not connected yet.
 */
export default async function OrderBuilderPage({ searchParams }: { searchParams: Promise<{ customer?: string }> }) {
  // Checked on the page as well as `(member)/layout`: a layout gate alone is not enough (CLAUDE.md §10).
  {
    const a = await getMuseAccess();
    if (!a.isOperator) return <PortalPending portal="Customer Portal" email={a.email} />;
  }
  const [{ customer }, { inputs }] = await Promise.all([searchParams, getResolvedActiveInputs()]);
  const data: OrderBuilderData = {
    customers: inputs.customers
      .filter((c) => c.status !== 'inactive' && c.channel !== 1)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((c) => ({ id: c.id, name: c.name, channel: c.channel, pricePerMealCents: c.pricePerMealCents, sites: c.sites.map((s) => ({ id: s.id, name: s.name })) })),
    recipes: inputs.recipes.filter((r) => r.status === 'in_service').map((r) => ({ code: r.code, name: r.name, channels: r.channels ?? [] })),
    channels: inputs.phases.map((p) => ({ phase: p.phase, market: p.market, pricePerMeal: p.pricePerMeal })),
    packages: inputs.packaging.packages.map((p) => ({ id: p.id, name: p.name, channels: p.channels, material: p.material, endOfUse: p.endOfUse, unitCost: packageUnitCost(p, inputs.packaging.supplierItems).cost })),
  };
  return (
    <>
      <PageHeader
        title="Order Builder"
        purpose="Pick a date, choose your meals and quantities, and tell us how to deliver."
        status="designed"
      />
      <OrderBuilderClient initialCustomerId={customer ?? null} data={data} />
    </>
  );
}
