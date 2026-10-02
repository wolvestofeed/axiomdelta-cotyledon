import 'server-only';
import { listSubscribers } from '@/server/subscribers';
import type { SubscriberDef } from '@/data/subscribers';
import type { FarmAccess } from '@/server/access';

/**
 * Cotyledon — the Client Portal's subscriber (server-only, Roadmap P5).
 *
 * A client, a sign-in linked to its record, sees that one record and nothing else; the pick is
 * ignored. The farm's staff read the portal as a client will see it: the subscriber is picked with
 * `?subscriber=`, the first one by name when none is named. Forecast Subscribers are invented and
 * never appear; own use does, as the one real subscriber on Actual.
 */
export interface PortalClients {
  /** The records to pick from; one, the client's own, for a client. */
  clients: SubscriberDef[];
  subscriber: SubscriberDef | null;
}

export async function portalClients(subscriberId: string | undefined, access: Pick<FarmAccess, 'subscriberId'>): Promise<PortalClients> {
  const all = await listSubscribers();
  if (access.subscriberId !== null) {
    const own = all.find((c) => c.id === access.subscriberId) ?? null;
    return { clients: own ? [own] : [], subscriber: own };
  }
  const clients = all.filter((c) => c.status !== 'inactive' && c.status !== 'forecast').sort((a, b) => a.name.localeCompare(b.name));
  const subscriber = clients.find((c) => c.id === subscriberId) ?? clients[0] ?? null;
  return { clients, subscriber };
}

/** May this caller open the portal's pages: the farm's staff previewing, or a linked client. */
export const canUsePortal = (a: Pick<FarmAccess, 'isOperator' | 'subscriberId'>): boolean => a.isOperator || a.subscriberId !== null;
