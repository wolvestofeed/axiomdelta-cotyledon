import 'server-only';
import { listSubscribers } from '@/server/subscribers';
import type { SubscriberDef } from '@/data/subscribers';

/**
 * Cotyledon — the Client Portal's subscriber (server-only).
 *
 * Until an external account is linked to its subscriber record (Roadmap P5), the portal's pages are
 * read by the farm's staff as a client will see them: the subscriber is picked with `?subscriber=`,
 * the first one by name when none is named. Forecast Subscribers are invented and never appear;
 * own use does, as the one real subscriber on Actual.
 */
export interface PortalClients {
  clients: SubscriberDef[];
  subscriber: SubscriberDef | null;
}

export async function portalClients(subscriberId: string | undefined): Promise<PortalClients> {
  const all = await listSubscribers();
  const clients = all.filter((c) => c.status !== 'inactive' && c.status !== 'forecast').sort((a, b) => a.name.localeCompare(b.name));
  const subscriber = clients.find((c) => c.id === subscriberId) ?? clients[0] ?? null;
  return { clients, subscriber };
}
