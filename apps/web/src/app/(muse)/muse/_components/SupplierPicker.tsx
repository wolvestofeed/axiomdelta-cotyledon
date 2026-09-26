'use client';

import type { LeanSupplier } from '../_engine/supplier-links';
import type { LeanEntity } from '../_engine/entity-links';
import { EntityPicker } from './EntityPicker';

/**
 * Link a line to a supplier from the compiled directory — the supplier-shaped
 * face of `EntityPicker`. Callers hold `LeanSupplier` (they need its coordinates
 * and rating for the logistics and coverage math); this adapts that record to the
 * lean entity the shared control renders.
 */
export function leanSupplierAsEntity(s: LeanSupplier): LeanEntity {
  return {
    kind: 'supplier',
    id: s.id,
    name: s.name,
    subtitle: s.location,
    pills: [
      ...(s.certified
        ? [{ label: s.certScope || 'Certified', tone: 'ok' as const }]
        : [{ label: 'No certification on file', tone: 'plain' as const }]),
      ...(s.schoolReady ? [{ label: 'School-ready', tone: 'ok' as const }] : []),
    ],
    href: `/muse/suppliers/${s.id}`,
    lat: s.lat,
    lng: s.lng,
    geoSource: s.geoSource,
    rating: s.rating,
  };
}

export function SupplierPicker({
  ingredient,
  linked,
  canEdit,
  onLink,
}: {
  /** What the link is for, used in the search field's label. */
  ingredient: string;
  linked: LeanSupplier | null;
  canEdit: boolean;
  onLink: (id: string | undefined) => void;
}) {
  return (
    <EntityPicker
      kinds={['supplier']}
      linked={linked ? leanSupplierAsEntity(linked) : null}
      canEdit={canEdit}
      label="supplier"
      ariaLabel={`Search suppliers for ${ingredient}`}
      placeholder="Search name or product…"
      onLink={onLink}
    />
  );
}
