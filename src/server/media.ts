import 'server-only';
import { db } from '@/lib/db';
import type { LibraryMedium } from '@/engine/media';
import { listMediaWith } from '@/server/media-rows';

/**
 * MicroFarm — the Media library read layer (server-only). The library seeds itself from the code
 * seed on first read; from then on the rows are the source a grow plan's medium line is costed
 * against.
 */
export async function listMedia(): Promise<LibraryMedium[]> {
  return listMediaWith(db);
}
