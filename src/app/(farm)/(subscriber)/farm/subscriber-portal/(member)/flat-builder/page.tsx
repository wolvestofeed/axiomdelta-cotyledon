import { PortalPending } from '@/components/PortalPending';
import { getFarmAccess } from '@/server/access';
import { PageHeader } from '@/components/ui';
import { FlatBuilderClient, type FlatBuilderData } from '@/app/(farm)/(subscriber)/farm/subscriber-portal/(member)/flat-builder/FlatBuilderClient';
import { getResolvedActiveInputs } from '@/server/scenarios';
import { packageUnitCost } from '@/engine/packaging';
import { withWorkspace } from '@/server/workspace';

export const dynamic = 'force-dynamic';

/**
 * Flat Builder — a corporate or restaurant client builds an order: date
 * of service, quantities and crop plan options, allergies, packaging, distribution specifications
 * and instructions. A basic page while the Subscriber Portal is developed: it reads the crop plan
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
      .filter((c) => c.status !== 'inactive' && c.channel !== 1)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((c) => ({ id: c.id, name: c.name, channel: c.channel, pricePerUnitCents: c.pricePerUnitCents, pickupPoints: c.pickupPoints.map((s) => ({ id: s.id, name: s.name })) })),
    cropPlans: inputs.cropPlans.filter((r) => r.status === 'in_service').map((r) => ({ code: r.code, name: r.name, channels: r.channels ?? [] })),
    channels: inputs.phases.map((p) => ({ phase: p.phase, market: p.market, pricePerUnit: p.pricePerUnit })),
    packages: inputs.packaging.packages.map((p) => ({ id: p.id, name: p.name, channels: p.channels, material: p.material, endOfUse: p.endOfUse, unitCost: packageUnitCost(p, inputs.packaging.supplierItems).cost })),
  };
  return (
    <>
      <PageHeader
        title="Flat Builder"
        purpose="Pick a date, choose your units and quantities, and tell us how to distribute."
        status="designed"
      />
      <FlatBuilderClient initialSubscriberId={subscriber ?? null} data={data} />
    </>
  );
}
