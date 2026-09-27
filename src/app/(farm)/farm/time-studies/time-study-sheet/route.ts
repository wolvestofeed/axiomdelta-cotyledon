import { getFarmAccess } from '@/server/access';
import { streamBuffer } from '@/server/stream';
import { buildTimeStudySheet } from '@/server/time-study-sheet';
import { withWorkspace } from '@/server/workspace';

export const dynamic = 'force-dynamic';

/** The Time Study Sheet as a streamed workbook. Operator-gated; the `growPlan` query names the block listed first. */
export async function GET(...args: Parameters<typeof GETInner>): ReturnType<typeof GETInner> {
  return withWorkspace(() => GETInner(...args));
}

async function GETInner(request: Request): Promise<Response> {
  const access = await getFarmAccess();
  if (!access.isOperator) return new Response('Not found', { status: 404 });
  const wanted = new URL(request.url).searchParams.get('growPlan');
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
