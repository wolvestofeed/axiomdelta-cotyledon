import { getMuseAccess } from '../../../_lib/access';
import { buildEvidencePack } from '../../../_lib/evidence-pack';
import { getLedgerKind } from '../../../_lib/ledgers';
import { streamBuffer } from '../../../_lib/stream';

export const dynamic = 'force-dynamic';

/** The evidence pack as a streamed ZIP, on the selected ledger. Operator-gated. */
export async function GET(): Promise<Response> {
  const access = await getMuseAccess();
  if (!access.isOperator) return new Response('Not found', { status: 404 });
  const asOf = new Date().toISOString().slice(0, 10);
  const { buffer, fileName } = await buildEvidencePack(asOf, await getLedgerKind());
  return new Response(streamBuffer(buffer), {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Length': String(buffer.byteLength),
      'Content-Disposition': `attachment; filename="${fileName}"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
