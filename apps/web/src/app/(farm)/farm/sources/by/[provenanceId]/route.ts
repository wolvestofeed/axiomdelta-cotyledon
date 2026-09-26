import { redirect } from 'next/navigation';
import { getFarmAccess } from '../../../_lib/access';
import { findByProvenance } from '../../../_lib/sources';
import { withWorkspace } from '@/app/(farm)/farm/_lib/workspace';

/**
 * Resolve a factor-library provenance id. Registered: the source page, anchored
 * on the figure. Not registered: the factor registry row on Inventory & Audit.
 * Client pages link here so they never need the database.
 */
export async function GET(...args: Parameters<typeof GETInner>): ReturnType<typeof GETInner> {
  return withWorkspace(() => GETInner(...args));
}

async function GETInner(
  _req: Request,
  ctx: { params: Promise<{ provenanceId: string }> },
): Promise<Response> {
  const access = await getFarmAccess();
  if (!access.isOperator) return new Response('Not found', { status: 404 });
  const { provenanceId } = await ctx.params;
  const id = decodeURIComponent(provenanceId).slice(0, 200);
  const hit = await findByProvenance(id);
  if (hit) redirect(`/farm/sources/${hit.sourceId}#fig-${hit.figureId}`);
  redirect(`/farm/sustainability/inventory#${encodeURIComponent(id)}`);
}
