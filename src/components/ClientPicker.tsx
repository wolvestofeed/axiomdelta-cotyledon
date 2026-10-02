import Link from 'next/link';
import { Card } from '@/components/ui';
import type { SubscriberDef } from '@/data/subscribers';

/**
 * The Client Portal's subscriber, picked by the farm's staff while the portal is read as a client
 * will see it (`server/client-portal.ts`). Each page keeps its own address in the links.
 */
export function ClientPicker({ clients, subscriber, path }: { clients: SubscriberDef[]; subscriber: SubscriberDef | null; path: string }) {
  return (
    <Card title="Client">
      {clients.length === 0 ? (
        <p className="farm-kpi-sub">No subscriber is on file yet. <Link className="farm-link" href="/farm/client-portal/sign-up">Create an account</Link>.</p>
      ) : (
        <div className="farm-kpi-sub flex! flex-wrap! gap-y-[0.4rem]! gap-x-[0.9rem]!">
          {clients.map((c) => (
            c.id === subscriber?.id
              ? <strong key={c.id} className="farm-c-ink">{c.name}</strong>
              : <Link key={c.id} className="farm-link" href={`${path}?subscriber=${c.id}`}>{c.name}</Link>
          ))}
        </div>
      )}
    </Card>
  );
}
