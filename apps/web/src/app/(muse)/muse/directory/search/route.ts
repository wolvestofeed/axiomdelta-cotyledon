import { getMuseAccess } from '../../_lib/access';
import { hydrateEntityRefs, parseKinds, searchEntities } from '../../_lib/entity-directory';
import { ENTITY_KINDS } from '../../_engine/entity-links';

/**
 * The lean directory lookup behind every picker and the top-bar search.
 *
 *   ?q=beef&kinds=supplier,source   — search those directories (order kept)
 *   ?refs=supplier:123,source:abc   — hydrate known refs
 *
 * Operator-gated. Returns at most 25 rows per kind and never the full directory.
 */
export async function GET(req: Request): Promise<Response> {
  const access = await getMuseAccess();
  if (!access.isOperator) return new Response('Not found', { status: 404 });

  const url = new URL(req.url);
  const q = (url.searchParams.get('q') ?? '').slice(0, 80);
  const kinds = parseKinds(url.searchParams.get('kinds'), ENTITY_KINDS);
  const refs = (url.searchParams.get('refs') ?? '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, 60);

  const [results, byRef] = await Promise.all([
    q ? searchEntities(q, kinds) : Promise.resolve([]),
    refs.length ? hydrateEntityRefs(refs) : Promise.resolve({}),
  ]);

  return Response.json(
    { results, byRef },
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
}
