import { getFarmAccess } from '../../../_lib/access';
import { getTrainingFile } from '../../../_lib/training';
import { withWorkspace } from '@/app/(farm)/farm/_lib/workspace';

/**
 * Serve a training document to a signed-in operator. The bytes live in the
 * database, so this route is the only thing that reads `file_bytes` — the file
 * is never public and never leaves the authenticated boundary.
 */
export async function GET(...args: Parameters<typeof GETInner>): ReturnType<typeof GETInner> {
  return withWorkspace(() => GETInner(...args));
}

async function GETInner(_req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const access = await getFarmAccess();
  if (!access.isOperator) return new Response('Not found', { status: 404 });

  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response('Not found', { status: 404 });

  const file = await getTrainingFile(id);
  if (!file) return new Response('Not found', { status: 404 });

  return new Response(new Uint8Array(file.bytes), {
    headers: {
      'Content-Type': file.fileMime,
      'Content-Disposition': `inline; filename="${file.fileName.replace(/"/g, '')}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
