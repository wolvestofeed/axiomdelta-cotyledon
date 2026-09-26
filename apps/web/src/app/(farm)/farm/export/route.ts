import { getFarmAccess } from '../_lib/access';
import { buildPageWorkbook } from '../_lib/page-export';
import { streamBuffer } from '../_lib/stream';
import { pageExportSchema } from '../_engine/page-export';

export const dynamic = 'force-dynamic';

/** The body a page may send: the schema bounds every table, row and cell; this bounds the whole. */
const MAX_BODY_BYTES = 8 * 1024 * 1024;

/**
 * A module page as a streamed workbook (Roadmap Phase E follow-up). The page posts
 * what it rendered — figures and tables — and the file equals the screen. Operator-
 * gated: the reader already saw these rows, and an admin-only page never rendered
 * for an operator, so nothing here widens what a role can read.
 */
export async function POST(req: Request): Promise<Response> {
  const access = await getFarmAccess();
  if (!access.isOperator) return new Response('Not found', { status: 404 });
  const length = Number(req.headers.get('content-length') ?? 0);
  if (length > MAX_BODY_BYTES) return new Response('Too large', { status: 413 });
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response('The export was not understood.', { status: 400 });
  }
  const parsed = pageExportSchema.safeParse(body);
  if (!parsed.success) return new Response('The export was not understood.', { status: 400 });
  const preparedAt = new Date().toISOString().replace('T', ' ').slice(0, 16);
  const { buffer, fileName } = await buildPageWorkbook(parsed.data, preparedAt);
  return new Response(streamBuffer(buffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Length': String(buffer.byteLength),
      'Content-Disposition': `attachment; filename="${fileName}"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
