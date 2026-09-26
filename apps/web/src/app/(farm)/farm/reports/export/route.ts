import { getFarmAccess } from '../../_lib/access';
import { buildReportWorkbook } from '../../_lib/reports-export';
import { streamBuffer } from '../../_lib/stream';

export const dynamic = 'force-dynamic';

/**
 * A report package as a streamed workbook: `?section=` for every report in a section of
 * the menu, `?report=` for one. Operator-gated; admin-only reports are built for admins
 * alone, so an operator's file never carries them.
 */
export async function GET(req: Request): Promise<Response> {
  const access = await getFarmAccess();
  if (!access.isOperator) return new Response('Not found', { status: 404 });
  const url = new URL(req.url);
  const section = url.searchParams.get('section') ?? undefined;
  const report = url.searchParams.get('report') ?? undefined;
  const built = await buildReportWorkbook(access, { section, report });
  if (!built) return new Response('Not found', { status: 404 });
  return new Response(streamBuffer(built.buffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Length': String(built.buffer.byteLength),
      'Content-Disposition': `attachment; filename="${built.fileName}"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
