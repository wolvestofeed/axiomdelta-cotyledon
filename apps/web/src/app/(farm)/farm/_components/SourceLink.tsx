'use client';

import { useMemo } from 'react';
import { EntityPicker } from './EntityPicker';
import { useLinkedEntities } from './useLinkedEntities';
import { entityRef, type LeanEntity } from '../_engine/entity-links';
import { useScenario } from '../_state/scenario-store';

/**
 * The document behind one typed figure. Every activity input the platform asks an
 * operator to type comes off a piece of paper — a utility invoice, a lab report, a
 * refrigerant service ticket, an equipment spec sheet — and this links the row to
 * that document in the sources registry.
 *
 * The link is part of the scenario, filed under a stable key (`docKey` in
 * `_engine/entity-links.ts`), so a saved forecast keeps its evidence trail. This
 * is the persistent activity ledger in miniature: a row, and the document it
 * came from.
 */

/**
 * Hydrate every document link on the page in one request. Call once per page and
 * pass the result to each `SourceLink`; a per-row hook would fetch the same set
 * once per row.
 */
export function useDocumentSources(): Record<string, LeanEntity> {
  const { resolved } = useScenario();
  const documents = resolved.sustainability.documents;
  const refs = useMemo(
    () => Object.values(documents).filter(Boolean).map((id) => entityRef('source', id)),
    [documents],
  );
  return useLinkedEntities(refs);
}

export function SourceLink({
  docKey,
  sources,
  hint,
  ariaLabel,
  canEdit = true,
  compact = true,
}: {
  /** Stable key the link is filed under. */
  docKey: string;
  /** Lean records from `useDocumentSources()`. */
  sources: Record<string, LeanEntity>;
  /** What document this row expects, shown until one is linked. */
  hint: string;
  ariaLabel: string;
  canEdit?: boolean;
  compact?: boolean;
}) {
  const { resolved, setDocumentLink } = useScenario();
  const id = resolved.sustainability.documents[docKey];
  const linked = id ? sources[entityRef('source', id)] ?? null : null;

  return (
    <EntityPicker
      kinds={['source']}
      linked={linked}
      canEdit={canEdit}
      compact={compact}
      label="document"
      emptyText={hint}
      addLabel={linked ? 'Change' : 'Link document'}
      ariaLabel={ariaLabel}
      placeholder="Search title, publisher, kind…"
      onLink={(sourceId) => setDocumentLink(docKey, sourceId)}
    />
  );
}
