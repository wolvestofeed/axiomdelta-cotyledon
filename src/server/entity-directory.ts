import { formatNameOf } from '@/data/grow-plan';
import type { GrowPlanDef } from '@/data/grow-plan';
import 'server-only';
import { supplierOperations } from '@/data/suppliers';
import { prospectRecords } from '@/data/prospects';
import { listGrowPlans } from '@/server/grow-plans';
import { listEquipment } from '@/server/equipment';
import type { EquipmentLine } from '@/data/capex';
import { EQUIPMENT_STATUS_LABELS } from '@/engine/equipment';
import { pickupPoints, trainingCourses } from '@/data/seed-invented';
import { loadActuals } from '@/server/actuals';
import type { SowingRecordDoc } from '@/engine/actuals';
import { queryProspects } from '@/engine/prospects';
import { toLean, leanSuppliersById, searchLeanSuppliers } from '@/server/supplier-links';
import { listSources } from '@/server/sources';
import {
  entityRef,
  groupRefsByKind,
  isEntityKind,
  type EntityKind,
  type LeanEntity,
} from '@/engine/entity-links';
import { pickupPointCoordinates } from '@/data/pickup-point-geo';
import type { LeanSupplier } from '@/engine/supplier-links';

/**
 * MicroFarm — the one server-side directory every picker searches.
 *
 * Each kind resolves to the same lean shape, so one control can link a record of
 * any kind. The full compiled datasets never reach the browser: a search returns
 * at most `LIMIT` lean rows, and hydration returns only the ids asked for.
 *
 * Adding a kind is a `KINDS` entry plus a mapper — nothing else in the platform
 * changes.
 */

const LIMIT = 25;

// ── Per-kind mappers ─────────────────────────────────────────────────────────

export function supplierToEntity(s: LeanSupplier): LeanEntity {
  return {
    kind: 'supplier',
    id: s.id,
    name: s.name,
    subtitle: s.location,
    pills: [
      ...(s.certified ? [{ label: s.certScope || 'Certified', tone: 'ok' as const }] : []),
      ...(s.prospectReady ? [{ label: 'prospect-ready', tone: 'ok' as const }] : []),
    ],
    href: `/farm/suppliers/${s.id}`,
    lat: s.lat,
    lng: s.lng,
    geoSource: s.geoSource,
    rating: s.rating,
  };
}

function prospectToEntity(s: (typeof prospectRecords)[number]): LeanEntity {
  return {
    kind: 'prospect',
    id: s.id,
    name: s.name,
    subtitle: s.location,
    pills: [
      { label: s.status, tone: s.status.startsWith('Signed') ? 'ok' : 'plain' },
      ...(s.headcount ? [{ label: `${s.headcount} headcount`, tone: 'plain' as const }] : []),
    ],
    href: `/farm/sales?q=${encodeURIComponent(s.name)}`,
    lat: s.lat ?? null,
    lng: s.lng ?? null,
    geoSource: s.geoSource ?? null,
  };
}

function growPlanToEntity(r: GrowPlanDef): LeanEntity {
  return {
    kind: 'growPlan',
    id: r.code,
    name: r.name,
    subtitle: `${r.code} · ${formatNameOf(r)}`,
    pills: [{ label: `${r.lines.length} lines`, tone: 'plain' }],
    href: '/farm/grow-plans',
    lat: null,
    lng: null,
    geoSource: null,
  };
}

function equipmentToEntity(e: EquipmentLine): LeanEntity {
  return {
    kind: 'equipment',
    id: e.key,
    name: e.item,
    subtitle: `${e.category} · phase ${e.phase} · ${EQUIPMENT_STATUS_LABELS[e.status]} · ${e.qty} × ${e.newUsed.toLowerCase()}`,
    pills: e.critical ? [{ label: 'Critical', tone: 'plain' }] : [],
    href: '/farm/grow-units',
    lat: null,
    lng: null,
    geoSource: null,
  };
}

function pickupPointToEntity(s: (typeof pickupPoints)[number]): LeanEntity {
  const coords = pickupPointCoordinates(s.county);
  return {
    kind: 'pickupPoint',
    id: s.id,
    name: s.name,
    subtitle: `${s.type} · ${s.county} County · ${s.serviceWindow}`,
    pills: [{ label: `${s.dailyForecastUnits} units / day`, tone: 'plain' }],
    href: '/farm/pickup-points',
    lat: coords?.lat ?? null,
    lng: coords?.lng ?? null,
    geoSource: coords ? 'county' : null,
  };
}

function courseToEntity(c: (typeof trainingCourses)[number]): LeanEntity {
  return {
    kind: 'course',
    id: c.id,
    name: c.title,
    subtitle: `${c.format} · ${c.audience}`,
    pills: [{ label: `${c.lessons} lessons`, tone: 'plain' }],
    href: '/farm/training',
    lat: null,
    lng: null,
    geoSource: null,
  };
}

/** A lot is a closed sowing record (Roadmap N9): keyed by the sowing id, the lot Inventory and the links use. */
function lotToEntity(b: SowingRecordDoc): LeanEntity {
  return {
    kind: 'lot',
    id: b.sowingId,
    name: b.sowingId,
    subtitle: `${b.growPlanCode} · produced ${b.productionDate}`,
    pills: [{ label: `${Math.round(b.goodUnits)} units`, tone: 'plain' }],
    href: '/farm/inventory',
    lat: null,
    lng: null,
    geoSource: null,
  };
}

// ── Source kinds come from the database, so this kind is async ───────────────

interface SourceLite {
  id: string;
  title: string;
  kind: string;
  publisher: string | null;
  year: number | null;
  fileName: string | null;
  status: string;
}

function sourceToEntity(s: SourceLite): LeanEntity {
  return {
    kind: 'source',
    id: s.id,
    name: s.title,
    subtitle: [s.publisher, s.year ? String(s.year) : null].filter(Boolean).join(' · ') || s.kind,
    pills: [
      { label: s.kind.replace(/_/g, ' '), tone: 'plain' },
      ...(s.fileName ? [{ label: 'Document on file', tone: 'ok' as const }] : []),
    ],
    href: `/farm/sources/${s.id}`,
    lat: null,
    lng: null,
    geoSource: null,
  };
}

// ── Search and hydrate ───────────────────────────────────────────────────────

function matches(hay: string, q: string): boolean {
  return hay.toLowerCase().includes(q);
}

async function searchKind(kind: EntityKind, q: string): Promise<LeanEntity[]> {
  const needle = q.toLowerCase();
  switch (kind) {
    case 'supplier':
      return searchLeanSuppliers(q, LIMIT).map(supplierToEntity);
    case 'prospect':
      return queryProspects(prospectRecords, { segment: 'all', status: 'all', q })
        .slice(0, LIMIT)
        .map(prospectToEntity);
    case 'source': {
      const rows = await listSources();
      return rows
        .filter((s) =>
          matches(
            [s.title, s.publisher ?? '', s.authors ?? '', s.kind, s.year ?? ''].join(' '),
            needle,
          ),
        )
        .slice(0, LIMIT)
        .map(sourceToEntity);
    }
    case 'growPlan':
      return (await listGrowPlans())
        .filter((r) => matches([r.name, r.code, formatNameOf(r)].join(' '), needle))
        .slice(0, LIMIT)
        .map(growPlanToEntity);
    case 'equipment':
      return (await listEquipment())
        .filter((e) => matches([e.item, e.key, e.category, e.note ?? ''].join(' '), needle))
        .slice(0, LIMIT)
        .map(equipmentToEntity);
    case 'pickupPoint':
      return pickupPoints
        .filter((s) => matches([s.name, s.type, s.county, s.serviceWindow].join(' '), needle))
        .slice(0, LIMIT)
        .map(pickupPointToEntity);
    case 'course':
      return trainingCourses
        .filter((c) => matches([c.title, c.format, c.audience].join(' '), needle))
        .slice(0, LIMIT)
        .map(courseToEntity);
    case 'lot':
      return (await loadActuals()).sowings
        .filter((b) => matches([b.sowingId, b.growPlanCode, b.productionDate, ...b.lots.map((l) => l.outputLotCode)].join(' '), needle))
        .slice(0, LIMIT)
        .map(lotToEntity);
  }
}

async function hydrateKind(kind: EntityKind, ids: string[]): Promise<LeanEntity[]> {
  if (ids.length === 0) return [];
  const want = new Set(ids);
  switch (kind) {
    case 'supplier': {
      const byId = leanSuppliersById(ids);
      return ids.flatMap((id) => (byId[id] ? [supplierToEntity(byId[id])] : []));
    }
    case 'prospect':
      return prospectRecords.filter((s) => want.has(s.id)).map(prospectToEntity);
    case 'source': {
      const rows = await listSources();
      return rows.filter((s) => want.has(s.id)).map(sourceToEntity);
    }
    case 'growPlan':
      return (await listGrowPlans()).filter((r) => want.has(r.code)).map(growPlanToEntity);
    case 'equipment':
      return (await listEquipment()).filter((e) => want.has(e.key)).map(equipmentToEntity);
    case 'pickupPoint':
      return pickupPoints.filter((s) => want.has(s.id)).map(pickupPointToEntity);
    case 'course':
      return trainingCourses.filter((c) => want.has(c.id)).map(courseToEntity);
    case 'lot':
      return (await loadActuals()).sowings.filter((b) => want.has(b.sowingId)).map(lotToEntity);
  }
}

/** Parse a comma-separated `kinds=` parameter; empty or unknown falls back to all. */
export function parseKinds(raw: string | null, fallback: EntityKind[]): EntityKind[] {
  const asked = (raw ?? '')
    .split(',')
    .map((k) => k.trim())
    .filter(isEntityKind);
  return asked.length > 0 ? asked : fallback;
}

/**
 * Search several directories at once. Results keep the order of `kinds`, so a
 * caller that leads with the kind it is linking sees those hits first.
 */
export async function searchEntities(q: string, kinds: EntityKind[]): Promise<LeanEntity[]> {
  const query = q.trim();
  if (query.length < 2) return [];
  const perKind = await Promise.all(kinds.map((k) => searchKind(k, query)));
  return perKind.flat();
}

/** Hydrate `kind:id` refs to lean records, keyed by ref. */
export async function hydrateEntityRefs(refs: string[]): Promise<Record<string, LeanEntity>> {
  const grouped = groupRefsByKind(refs);
  const kinds = Object.keys(grouped) as EntityKind[];
  const results = await Promise.all(kinds.map((k) => hydrateKind(k, grouped[k] ?? [])));
  const out: Record<string, LeanEntity> = {};
  for (const list of results) {
    for (const e of list) out[entityRef(e.kind, e.id)] = e;
  }
  return out;
}

/** One record by kind and id, or null when the directory does not hold it. */
export async function getEntity(kind: EntityKind, id: string): Promise<LeanEntity | null> {
  const [found] = await hydrateKind(kind, [id]);
  return found ?? null;
}
