import { getMuseAccess } from '../../_lib/access';
import { streamBuffer } from '../../_lib/stream';
import { buildTimeStudySheet } from '../../_lib/time-study-sheet';

export const dynamic = 'force-dynamic';

/** The Time Study Sheet as a streamed workbook. Operator-gated; the `recipe` query names the block listed first. */
export async function GET(request: Request): Promise<Response> {
  const access = await getMuseAccess();
  if (!access.isOperator) return new Response('Not found', { status: 404 });
  const wanted = new URL(request.url).searchParams.get('recipe');
  const first = wanted && /^[A-Z0-9-]{1,40}$/.test(wanted) ? wanted : null;
  const asOf = new Date().toISOString().slice(0, 10);
  const { buffer, fileName } = await buildTimeStudySheet(asOf, first);
  return new Response(streamBuffer(buffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Length': String(buffer.byteLength),
      'Content-Disposition': `attachment; filename="${fileName}"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
