import { redirect } from 'next/navigation';
import { getMuseAccess } from '../../../_lib/access';
import { findByProvenance } from '../../../_lib/sources';

/**
 * Resolve a factor-library provenance id. Registered: the source page, anchored
 * on the figure. Not registered: the factor registry row on Inventory & Audit.
 * Client pages link here so they never need the database.
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ provenanceId: string }> },
): Promise<Response> {
  const access = await getMuseAccess();
  if (!access.isOperator) return new Response('Not found', { status: 404 });
  const { provenanceId } = await ctx.params;
  const id = decodeURIComponent(provenanceId).slice(0, 200);
  const hit = await findByProvenance(id);
  if (hit) redirect(`/muse/sources/${hit.sourceId}#fig-${hit.figureId}`);
  redirect(`/muse/sustainability/inventory#${encodeURIComponent(id)}`);
}
