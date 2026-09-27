import { PortalPending } from '@/components/PortalPending';
import { getFarmAccess } from '@/server/access';
import { PageHeader } from '@/components/ui';
import { FlatBuilderClient, type FlatBuilderData } from '@/app/(farm)/(subscriber)/farm/subscriber-portal/(member)/flat-builder/FlatBuilderClient';
import { getResolvedActiveInputs } from '@/server/scenarios';
import { packageUnitCost } from '@/engine/packaging';
import { withWorkspace } from '@/server/workspace';
import { NUTRITION_TARGETS } from '@/data/nutrition-targets';
import { planVarieties } from '@/data/grow-plan';

export const dynamic = 'force-dynamic';

/**
 * Flat Builder — a corporate or restaurant client builds an order: date
 * of service, quantities and grow plan options, allergies, packaging, distribution specifications
 * and instructions. A basic page while the Subscriber Portal is developed: it reads the grow plan
 * and packaging libraries and prices the order, and submitting is not connected yet.
 */
export default async function FlatBuilderPage(props: Parameters<typeof FlatBuilderPageInner>[0]) {
  return withWorkspace(() => FlatBuilderPageInner(props));
}

async function FlatBuilderPageInner({ searchParams }: { searchParams: Promise<{ subscriber?: string }> }) {
  // Checked on the page as well as `(member)/layout`: a layout gate alone is not enough (CLAUDE.md §10).
  {
    const a = await getFarmAccess();
    if (!a.isOperator) return <PortalPending portal="Subscriber Portal" email={a.email} />;
  }
  const [{ subscriber }, { inputs }] = await Promise.all([searchParams, getResolvedActiveInputs()]);
  const data: FlatBuilderData = {
    subscribers: inputs.subscribers
      .filter((c) => c.status !== 'inactive')
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((c) => ({ id: c.id, name: c.name, channel: c.channel, pricePerUnitCents: c.pricePerUnitCents, nutritionTargets: c.nutritionTargets ?? [], pickupPoints: c.pickupPoints.map((s) => ({ id: s.id, name: s.name })) })),
    growPlans: inputs.growPlans.filter((r) => r.status === 'in_service').map((r) => ({ code: r.code, name: r.name, channels: r.channels ?? [], varieties: planVarieties(r).map((v) => v.key) })),
    targets: NUTRITION_TARGETS.map((t) => ({ key: t.key, name: t.name, kind: t.kind, varieties: t.varieties })),
    channels: inputs.phases.map((p) => ({ phase: p.phase, market: p.market, pricePerUnit: p.pricePerUnit })),
    packages: inputs.packaging.packages.map((p) => ({ id: p.id, name: p.name, channels: p.channels, material: p.material, endOfUse: p.endOfUse, unitCost: packageUnitCost(p, inputs.packaging.supplierItems).cost })),
  };
  return (
    <>
      <PageHeader
        title="Flat Builder"
        purpose="Pick a date, choose your flats and quantities, and see which of your nutrition targets they carry."
        functions={['Flats and quantities', 'Nutrition targets', 'Packaging', 'Distribution', 'Order summary']}
        status="partial"
      />
      <FlatBuilderClient initialSubscriberId={subscriber ?? null} data={data} />
    </>
  );
}
