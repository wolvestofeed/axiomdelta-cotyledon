import { getFarmAccess } from '../../_lib/access';
import { catalogsBySupplier } from '../../_lib/supplier-catalog';
import { withWorkspace } from '@/app/(farm)/farm/_lib/workspace';

/**
 * Catalogs for the suppliers a page has in play: `?ids=a,b,c`. Operator-gated, and
 * scoped to the ids asked for — the purchase-flat builder needs the catalogs of
 * the linked suppliers only, never every catalog on file.
 */
export async function GET(...args: Parameters<typeof GETInner>): ReturnType<typeof GETInner> {
  return withWorkspace(() => GETInner(...args));
}

async function GETInner(req: Request): Promise<Response> {
  const access = await getFarmAccess();
  if (!access.isOperator) return new Response('Not found', { status: 404 });

  const ids = (new URL(req.url).searchParams.get('ids') ?? '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, 50);

  return Response.json(
    { catalogs: ids.length ? await catalogsBySupplier(ids) : {} },
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
}
