import { getFarmAccess } from '../../_lib/access';
import { leanSuppliersById, searchLeanSuppliers } from '../../_lib/supplier-links';
import { withWorkspace } from '@/app/(farm)/farm/_lib/workspace';

/**
 * Lean supplier lookup for the browser: `?q=` searches name, products and
 * type (Central Texas first); `?ids=a,b` hydrates known ids. Operator-gated;
 * returns at most 25 search results and never the full directory.
 */
export async function GET(...args: Parameters<typeof GETInner>): ReturnType<typeof GETInner> {
  return withWorkspace(() => GETInner(...args));
}

async function GETInner(req: Request): Promise<Response> {
  const access = await getFarmAccess();
  if (!access.isOperator) return new Response('Not found', { status: 404 });
  const url = new URL(req.url);
  const q = (url.searchParams.get('q') ?? '').slice(0, 80);
  const ids = (url.searchParams.get('ids') ?? '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, 50);
  return Response.json(
    { results: q ? searchLeanSuppliers(q) : [], byId: ids.length ? leanSuppliersById(ids) : {} },
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
}
