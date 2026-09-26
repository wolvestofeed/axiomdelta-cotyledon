import { getFarmAccess } from '../../../_lib/access';
import { getSourceFile } from '../../../_lib/sources';
import { isInlineViewable } from '../../../_engine/sources';
import { streamBuffer } from '../../../_lib/stream';

/**
 * Serve a registered document to a signed-in operator or admin. PDFs render inline (the
 * source page frames this route; next.config relaxes frame-ancestors for this
 * path only); everything else downloads. The `(farm)` layout does not wrap
 * route handlers, so the operator gate is enforced here.
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const access = await getFarmAccess();
  if (!access.isOperator) return new Response('Not found', { status: 404 });

  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response('Not found', { status: 404 });

  const file = await getSourceFile(id);
  if (!file) return new Response('Not found', { status: 404 });

  const disposition = isInlineViewable(file.fileMime) ? 'inline' : 'attachment';
  const safeName = file.fileName.replace(/["\r\n]/g, '');
  return new Response(streamBuffer(file.bytes), {
    headers: {
      'Content-Type': file.fileMime,
      'Content-Length': String(file.bytes.byteLength),
      'Content-Disposition': `${disposition}; filename="${safeName}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
