'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { EntityPicker } from '@/components/EntityPicker';
import { recordEntityLink, removeEntityLink, setSingleEntityLink } from '@/server/entity-link-actions';
import type { EntityKind, LeanEntity } from '@/engine/entity-links';

/**
 * Link controls for the links that are FACTS OF RECORD — a lot received from an
 * operation, a lot shipped to a pickup point, a journal entry evidenced by an invoice, a
 * role assigned a course. These write a `farm.entity_links` row rather than a
 * scenario edit, because they stay true across every forecast.
 *
 * The records are resolved on the server and handed down already hydrated, so
 * these components never fetch the directory themselves — only the picker's own
 * search does, when it is opened.
 *
 * Writes are super-admin only; `canEdit` hides the controls for everyone else.
 */

interface Edge {
  fromKind: string;
  fromId: string;
  toKind: EntityKind;
  relation: string;
}

/** Many links of one relation: the linked records, plus a control to add another. */
export function RecordedLinkList({
  edge,
  linked,
  canEdit,
  ariaLabel,
  addLabel,
  placeholder,
  emptyText = 'None recorded',
}: {
  edge: Edge;
  linked: LeanEntity[];
  canEdit: boolean;
  ariaLabel: string;
  addLabel: string;
  placeholder?: string;
  emptyText?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const write = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      setErr(null);
      const res = await fn();
      if (res.ok) router.refresh();
      else setErr(res.error ?? 'Could not record that link.');
    });

  return (
    <div className="farm-fs-xs min-w-44">
      {linked.length === 0 ? (
        <span className="farm-c-faint">{emptyText}</span>
      ) : (
        linked.map((e) => (
          <div key={`${e.kind}:${e.id}`} className="flex items-center gap-[0.35rem] mb-[0.15rem]!">
            {e.href ? (
              <Link className="farm-link" href={e.href}>{e.name}</Link>
            ) : (
              <span>{e.name}</span>
            )}
            {canEdit ? (
              <button
                type="button"
                className="farm-btn farm-fs-2xs py-[0.05rem]! px-[0.35rem]!"
                disabled={pending}
                onClick={() => write(() => removeEntityLink({ ...edge, toId: e.id }))}
                aria-label={`Remove the link to ${e.name}`}
              >
                ×
              </button>
            ) : null}
          </div>
        ))
      )}
      {canEdit ? (
        <EntityPicker
          kinds={[edge.toKind]}
          linked={null}
          canEdit
          emptyText=""
          addLabel={addLabel}
          ariaLabel={ariaLabel}
          placeholder={placeholder}
          busyHint={pending}
          onLink={(toId) => {
            if (toId) write(() => recordEntityLink({ ...edge, toId }));
          }}
        />
      ) : null}
      {err ? <div className="farm-kpi-sub farm-c-over">{err}</div> : null}
    </div>
  );
}

/** One link of a relation: setting a new one replaces whatever was there. */
export function RecordedSingleLink({
  edge,
  linked,
  canEdit,
  ariaLabel,
  placeholder,
  emptyText = 'No document linked',
}: {
  edge: Edge;
  linked: LeanEntity | null;
  canEdit: boolean;
  ariaLabel: string;
  placeholder?: string;
  emptyText?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  return (
    <div>
      <EntityPicker
        kinds={[edge.toKind]}
        linked={linked}
        canEdit={canEdit}
        compact
        emptyText={emptyText}
        ariaLabel={ariaLabel}
        placeholder={placeholder}
        busyHint={pending}
        onLink={(toId) =>
          start(async () => {
            setErr(null);
            const res = await setSingleEntityLink({ ...edge, toId: toId ?? '' });
            if (res.ok) router.refresh();
            else setErr(res.error ?? 'Could not record that link.');
          })
        }
      />
      {err ? <div className="farm-kpi-sub farm-c-over">{err}</div> : null}
    </div>
  );
}
