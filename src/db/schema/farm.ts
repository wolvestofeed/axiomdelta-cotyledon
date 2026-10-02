import { sql } from 'drizzle-orm';
import {
  bigint,
  bigserial,
  boolean,
  customType,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgSchema,
  primaryKey,
  text,
  timestamp,
  uuid,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';

/**
 * Cotyledon — the isolated `farm` Postgres schema.
 *
 * Deliberately separate from Staffing's `public` schema (docs/farm/CLAUDE.md
 * §8). This is the first `pgSchema` in the repo; Drizzle qualifies every query
 * as `"farm"."<table>"`, so it works regardless of the connection search_path.
 *
 * Migrations, folded into drizzle/0001_farm_init.sql: 0043_farm_scenarios.sql,
 * 0044_farm_sources.sql, 0045_farm_supplier_lca_options.sql,
 * 0046_farm_entity_links.sql, 0047_farm_supplier_catalog_and_pos.sql,
 * 0048_farm_actuals.sql, 0049_farm_grow_plans.sql, 0050_farm_subscribers.sql,
 * 0051_farm_orders.sql, 0052_farm_distribution_handoff.sql, 0053_farm_sowing_crew.sql,
 * 0054_farm_periods.sql, 0055_farm_closure_kinds.sql, 0056_farm_standard_versions.sql,
 * 0057_farm_working_capital.sql, 0058_farm_equipment.sql, 0059_farm_packaging.sql, 0076_farm_facility_footprints.sql,
 * 0060_farm_hr_no_pay.sql, 0061_farm_time_studies.sql, 0064_farm_time_study_basis.sql,
 * 0065_farm_sowing_basis.sql.
 */
export const farmSchema = pgSchema('farm');

/**
 * A workspace is a farm, and a farm is one Clerk organization. Every other table carries
 * `workspace_id`, defaulted from the transaction's `app.workspace_id` setting and policed by
 * row-level security (migration 0002). This table is the only one read outside a scope.
 */
export const farmWorkspaces = farmSchema.table('workspaces', {
  id: uuid('id').primaryKey().defaultRandom(),
  clerkOrgId: text('clerk_org_id').notNull().unique(),
  name: text('name').notNull(),
  slug: text('slug'),
  timeZone: text('time_zone').notNull().default('America/Chicago'),
  stripeCustomerId: text('stripe_customer_id'),
  plan: text('plan').notNull().default('founding'),
  status: text('status').notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
export type FarmWorkspaceRow = typeof farmWorkspaces.$inferSelect;

/** The workspace in scope for the transaction, as the database computes it. */
export const CURRENT_WORKSPACE = sql`farm.current_workspace_id()`;


/**
 * A saved Farm scenario. `config` is a JSONB overlay of edited values over the
 * plan-data defaults (the `FarmScenarioConfig` shape in the Farm `_engine`);
 * every dollar is recomputed from defaults + overlay, never stored. `ownerTier`
 * freezes the creator's tier at save time so a later tier change can't retro-
 * actively reclassify a row.
 */
export const farmScenarios = farmSchema.table(
  'scenarios',
  {
  workspaceId: uuid('workspace_id').notNull().default(CURRENT_WORKSPACE),
    // @classification: Internal
    id: uuid('id').primaryKey().defaultRandom(),
    /** Operator free-text name. */
    // @classification: Confidential
    label: text('label').notNull(),
    /** 'user_built' | 'seed' | 'imported'. */
    // @classification: Internal
    source: text('source').notNull().default('user_built'),
    /** FarmScenarioConfig overlay (sectioned partial of editable inputs). */
    // @classification: Confidential
    config: jsonb('config').notNull().default({}),
    /** Clerk user id of the creator. */
    // @classification: Internal
    ownerUserId: text('owner_user_id').notNull(),
    /** Creator's tier at save time: 'super_admin' | 'user'. */
    // @classification: Internal
    ownerTier: text('owner_tier').notNull(),
    // @classification: Internal
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    // @classification: Internal
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('farm_scenarios_owner_idx').on(t.ownerUserId),
    index('farm_scenarios_created_idx').on(t.createdAt),
  ],
);

/**
 * Singleton (id = 'default'). `activeScenarioId` is THE live master state the
 * platform loads every session. Only a super admin's Apply moves this pointer.
 * Null until the first Apply — the app falls back to plan-data defaults.
 */
export const farmWorkspaceState = farmSchema.table('workspace_state', {
  workspaceId: uuid('workspace_id').notNull().default(CURRENT_WORKSPACE),
  // @classification: Internal
  id: text('id').notNull().default('default'),
  // @classification: Internal
  activeScenarioId: uuid('active_scenario_id').references(
    () => farmScenarios.id,
    { onDelete: 'set null' },
  ),
  // @classification: Internal
  appliedAt: timestamp('applied_at', { withTimezone: true }),
  // @classification: Internal
  appliedBy: text('applied_by'),
}, (t) => [primaryKey({ columns: [t.workspaceId, t.id] })]);

export type FarmScenarioRow = typeof farmScenarios.$inferSelect;
export type FarmScenarioInsert = typeof farmScenarios.$inferInsert;
export type FarmWorkspaceStateRow = typeof farmWorkspaceState.$inferSelect;

// ── Sources registry (Sustainability S2b) ───────────────────────────────────

/** Postgres bytea as a Node Buffer. */
const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return 'bytea';
  },
});

/**
 * A registered document or publication. The file is stored inline so the
 * platform renders it without a third-party store; `fileBytes` is null for
 * URL-only sources. Migration: 0044_farm_sources.sql.
 */
export const farmSources = farmSchema.table(
  'sources',
  {
  workspaceId: uuid('workspace_id').notNull().default(CURRENT_WORKSPACE),
    // @classification: Internal
    id: uuid('id').primaryKey().defaultRandom(),
    /** 'study' | 'lca' | 'dataset' | 'regulation' | 'rate_schedule' | 'supplier_report' | 'other'. */
    // @classification: Internal
    kind: text('kind').notNull().default('other'),
    // @classification: Internal
    title: text('title').notNull(),
    // @classification: Internal
    authors: text('authors'),
    // @classification: Internal
    publisher: text('publisher'),
    // @classification: Internal
    year: integer('year'),
    // @classification: Internal
    citation: text('citation'),
    // @classification: Internal
    sourceUrl: text('source_url'),
    // @classification: Internal
    licenceNote: text('licence_note'),
    /** Provenance status of the document as a whole. */
    // @classification: Internal
    status: text('status').notNull().default('SOURCED'),
    // @classification: Internal
    notes: text('notes'),
    // @classification: Internal
    fileName: text('file_name'),
    // @classification: Internal
    fileMime: text('file_mime'),
    // @classification: Internal
    fileSize: integer('file_size'),
    // @classification: Internal
    sha256: text('sha256'),
    /** The document itself. Select this column only when serving the file. */
    // @classification: Confidential
    fileBytes: bytea('file_bytes'),
    // @classification: Internal
    uploadedBy: text('uploaded_by'),
    // @classification: Internal
    uploadedAt: timestamp('uploaded_at', { withTimezone: true }),
    // @classification: Internal
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    // @classification: Internal
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('farm_sources_kind_idx').on(t.kind)],
);

/**
 * A figure drawn from a source. `provenanceId` is the factor library's stable
 * id, so a cited number resolves to this row and from here to the document.
 */
export const farmSourceFigures = farmSchema.table(
  'source_figures',
  {
  workspaceId: uuid('workspace_id').notNull().default(CURRENT_WORKSPACE),
    // @classification: Internal
    id: uuid('id').primaryKey().defaultRandom(),
    // @classification: Internal
    sourceId: uuid('source_id')
      .notNull()
      .references(() => farmSources.id, { onDelete: 'cascade' }),
    // @classification: Internal
    provenanceId: text('provenance_id'),
    // @classification: Internal
    label: text('label').notNull(),
    // @classification: Internal
    valueText: text('value_text'),
    // @classification: Internal
    unit: text('unit'),
    /** Where in the document: 'slide 19', 'Database sheet, col BM'. */
    // @classification: Internal
    locator: text('locator'),
    // @classification: Internal
    status: text('status').notNull().default('SOURCED'),
    // @classification: Internal
    effectiveFrom: date('effective_from'),
    // @classification: Internal
    version: text('version'),
    // @classification: Internal
    note: text('note'),
    // @classification: Internal
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('farm_source_figures_source_idx').on(t.sourceId)],
);

export type FarmSourceRow = typeof farmSources.$inferSelect;
export type FarmSourceInsert = typeof farmSources.$inferInsert;
export type FarmSourceFigureRow = typeof farmSourceFigures.$inferSelect;
export type FarmSourceFigureInsert = typeof farmSourceFigures.$inferInsert;

// ── Supplier-specific LCA options (Sustainability S4) ───────────────────────

/**
 * A figure a specific supplier supplies for a specific grow plan input, with
 * the supplier's document registered in `farm.sources`. Appears as a
 * "supplier" option in the per-input LCA basis selector.
 */
export const farmSupplierLcaOptions = farmSchema.table(
  'supplier_lca_options',
  {
  workspaceId: uuid('workspace_id').notNull().default(CURRENT_WORKSPACE),
    // @classification: Internal
    id: uuid('id').primaryKey().defaultRandom(),
    /** The supplier's id in `src/data/suppliers.ts`. */
    // @classification: Internal
    supplierId: text('supplier_id').notNull(),
    // @classification: Internal
    supplierName: text('supplier_name').notNull(),
    /** Grow plan input name. */
    // @classification: Internal
    input: text('input').notNull(),
    // @classification: Internal
    label: text('label').notNull(),
    // @classification: Internal
    kgCo2ePerKg: doublePrecision('kg_co2e_per_kg').notNull(),
    // @classification: Internal
    unitNote: text('unit_note'),
    /** 'retail' | 'slaughter_gate' | 'farm_gate'. */
    // @classification: Internal
    boundary: text('boundary').notNull().default('farm_gate'),
    // @classification: Internal
    sourceId: uuid('source_id').references(() => farmSources.id, { onDelete: 'set null' }),
    // @classification: Internal
    status: text('status').notNull().default('STATED'),
    // @classification: Internal
    note: text('note'),
    // @classification: Internal
    createdBy: text('created_by'),
    // @classification: Internal
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    // @classification: Internal
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('farm_supplier_lca_input_idx').on(t.input),
    index('farm_supplier_lca_supplier_idx').on(t.supplierId),
  ],
);

export type FarmSupplierLcaOptionRow = typeof farmSupplierLcaOptions.$inferSelect;
export type FarmSupplierLcaOptionInsert = typeof farmSupplierLcaOptions.$inferInsert;

// ── Entity links — facts of record (0046) ───────────────────────────────────

/**
 * A link between two records that is a FACT, not a forecast input: a lot was
 * received from an operation, a lot shipped to a pickup point, a journal entry is
 * evidenced by an invoice, a role is assigned a course.
 *
 * Links that change a model input are NOT stored here — they live in the
 * `farm.scenarios` overlay, because they belong to a forecast. See
 * `_engine/entity-links.ts` for the rule.
 *
 * Both endpoints are kind-qualified free text: the records they name live in the
 * compiled supplier directory, the compiled prospect list, typed plan-data, and
 * `farm.sources`, so only some pairs could be enforced relationally and none is.
 */
export const farmEntityLinks = farmSchema.table(
  'entity_links',
  {
  workspaceId: uuid('workspace_id').notNull().default(CURRENT_WORKSPACE),
    // @classification: Internal
    id: uuid('id').primaryKey().defaultRandom(),
    /** 'lot' | 'ledger_entry' | 'role' | 'supplier' | 'pickup_point' | 'course' | 'source'. */
    // @classification: Internal
    fromKind: text('from_kind').notNull(),
    // @classification: Internal
    fromId: text('from_id').notNull(),
    // @classification: Internal
    toKind: text('to_kind').notNull(),
    // @classification: Internal
    toId: text('to_id').notNull(),
    /** What the link asserts: 'received_from' | 'shipped_to' | 'evidenced_by' | 'assigned' | 'certificate'. */
    // @classification: Internal
    relation: text('relation').notNull(),
    // @classification: Internal
    note: text('note'),
    // @classification: Internal
    createdBy: text('created_by'),
    // @classification: Internal
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    // @classification: Internal
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('farm_entity_links_from_idx').on(t.fromKind, t.fromId),
    index('farm_entity_links_to_idx').on(t.toKind, t.toId),
  ],
);

export type FarmEntityLinkRow = typeof farmEntityLinks.$inferSelect;
export type FarmEntityLinkInsert = typeof farmEntityLinks.$inferInsert;

// ── Supplier catalogs + generated purchase orders (0047) ────────────────────

/**
 * A line in a supplier's seasonal catalog — what this operation sells and on
 * what terms. Imported from the price sheet a grower sends; no public directory
 * carries any of it.
 *
 * Availability is two month numbers so a window can wrap the year end (October
 * through March is start 10, end 3). `certification` is the claim on THIS item,
 * which can be narrower than the operation's overall scope.
 */
export const farmSupplierItems = farmSchema.table(
  'supplier_items',
  {
  workspaceId: uuid('workspace_id').notNull().default(CURRENT_WORKSPACE),
    // @classification: Internal
    id: uuid('id').primaryKey().defaultRandom(),
    /** The supplier's id in `src/data/suppliers.ts`. */
    // @classification: Internal
    supplierId: text('supplier_id').notNull(),
    // @classification: Internal
    item: text('item').notNull(),
    // @classification: Internal
    category: text('category'),
    /** Variety for crops, breed for livestock. */
    // @classification: Internal
    variety: text('variety'),
    // @classification: Internal
    packSize: text('pack_size'),
    // @classification: Internal
    unit: text('unit').notNull().default('lb'),
    /** 'candidate' | 'approved'. Only an approved line prices the plan or a purchase order (0067). */
    // @classification: Internal
    status: text('status').notNull().default('candidate'),
    // @classification: Internal
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    // @classification: Internal
    approvedBy: text('approved_by'),
    // @classification: Internal
    minOrderQty: doublePrecision('min_order_qty'),
    // @classification: Internal
    leadTimeDays: integer('lead_time_days'),
    /** Availability window, month numbers 1-12; may wrap the year end. */
    // @classification: Internal
    availStartMonth: integer('avail_start_month'),
    // @classification: Internal
    availEndMonth: integer('avail_end_month'),
    // @classification: Internal
    certification: text('certification'),
    // @classification: Internal
    origin: text('origin'),
    // @classification: Internal
    sku: text('sku'),
    // @classification: Internal
    notes: text('notes'),
    /** The price sheet this line came from, registered in farm.sources. */
    // @classification: Internal
    sourceId: uuid('source_id').references(() => farmSources.id, { onDelete: 'set null' }),
    // @classification: Internal
    importedAt: timestamp('imported_at', { withTimezone: true }),
    // @classification: Internal
    createdBy: text('created_by'),
    // @classification: Internal
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    // @classification: Internal
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('farm_supplier_items_supplier_idx').on(t.supplierId),
    index('farm_supplier_items_item_idx').on(t.item),
  ],
);

/**
 * A catalog line's price, per effective date (0067).
 *
 * The price IN FORCE on a date is the latest row on or before it — there is no
 * end date to keep in step, and last season's sheet stays readable after this
 * season's lands. One row per item per date: a second figure for the same day
 * is an edit of the first, not a rival to it.
 */
export const farmSupplierItemPrices = farmSchema.table(
  'supplier_item_prices',
  {
  workspaceId: uuid('workspace_id').notNull().default(CURRENT_WORKSPACE),
    // @classification: Internal
    id: uuid('id').primaryKey().defaultRandom(),
    // @classification: Internal
    itemId: uuid('item_id')
      .notNull()
      .references(() => farmSupplierItems.id, { onDelete: 'cascade' }),
    // @classification: Internal
    effectiveFrom: date('effective_from').notNull(),
    /** Dollars; may carry sub-cent precision. */
    // @classification: Confidential
    unitPrice: doublePrecision('unit_price'),
    /** What the price is per: 'lb' | 'case' | 'each' | 'dozen' | 'cwt'. */
    // @classification: Internal
    priceBasis: text('price_basis'),
    /** The price sheet or quote this figure came from, registered in farm.sources. */
    // @classification: Internal
    sourceId: uuid('source_id').references(() => farmSources.id, { onDelete: 'set null' }),
    // @classification: Internal
    note: text('note'),
    // @classification: Internal
    createdBy: text('created_by'),
    // @classification: Internal
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('farm_supplier_item_prices_item_date_idx').on(t.itemId, t.effectiveFrom),
    index('farm_supplier_item_prices_item_idx').on(t.itemId, t.effectiveFrom),
  ],
);

/**
 * A loan (0068). The principal is TYPED, not derived from the capex it
 * finances: a loan may be for less than the schedule, or carry a deposit, and a
 * principal that silently tracked an equipment edit could express neither. The
 * capex total for the same `purpose` is reported beside it so a gap is visible.
 */
export const farmLoans = farmSchema.table(
  'loans',
  {
  workspaceId: uuid('workspace_id').notNull().default(CURRENT_WORKSPACE),
    // @classification: Internal
    id: uuid('id').primaryKey().defaultRandom(),
    /** Stable across a reseed, so a saved forecast's overlay still finds its row. */
    // @classification: Internal
    key: text('key').notNull(),
    // @classification: Internal
    label: text('label').notNull(),
    /** 'equipment' | 'leasehold' | 'other'. */
    // @classification: Internal
    purpose: text('purpose').notNull().default('other'),
    /** 'planned' | 'funded'. */
    // @classification: Internal
    status: text('status').notNull().default('planned'),
    // @classification: Confidential
    principalCents: bigint('principal_cents', { mode: 'number' }).notNull().default(0),
    /** Annual rate as a fraction: 0.09 is 9%. */
    // @classification: Confidential
    apr: doublePrecision('apr').notNull().default(0),
    // @classification: Internal
    termMonths: integer('term_months').notNull().default(0),
    // @classification: Internal
    startDate: date('start_date').notNull(),
    // @classification: Internal
    notes: text('notes'),
    // @classification: Internal
    position: integer('position').notNull().default(0),
    /** 'seed' | 'user_built' */
    // @classification: Internal
    source: text('source').notNull().default('user_built'),
    // @classification: Internal
    createdBy: text('created_by'),
    // @classification: Internal
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    // @classification: Internal
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('farm_loans_key_idx').on(t.workspaceId, t.key), index('farm_loans_position_idx').on(t.position)],
);

/**
 * A monthly fixed cost (0068). `treatment` is the accounting fact and is never
 * inferred from the label: manufacturing overhead absorbs into inventory on
 * normal capacity (ASC 330-10-30-1/-3), G&A is a period cost that
 * ASC 330-10-30-8 keeps out of it.
 */
export const farmFixedCostLines = farmSchema.table(
  'fixed_cost_lines',
  {
  workspaceId: uuid('workspace_id').notNull().default(CURRENT_WORKSPACE),
    // @classification: Internal
    id: uuid('id').primaryKey().defaultRandom(),
    /** Stable across a reseed; a saved forecast's overlay keys on it. */
    // @classification: Internal
    key: text('key').notNull(),
    // @classification: Internal
    label: text('label').notNull(),
    /** The operator's own grouping: 'lease' | 'utilities' | 'admin' | other. */
    // @classification: Internal
    category: text('category').notNull().default('other'),
    /** 'home' | 'commercial' (0010). */
    // @classification: Internal
    setting: text('setting').notNull().default('commercial'),
    /** 'manufacturing_overhead' | 'general_admin'. */
    // @classification: Internal
    treatment: text('treatment').notNull().default('general_admin'),
    /** 'planned' | 'in_force'. */
    // @classification: Internal
    status: text('status').notNull().default('planned'),
    // @classification: Confidential
    monthlyAmountCents: bigint('monthly_amount_cents', { mode: 'number' }).notNull().default(0),
    // @classification: Internal
    startDate: date('start_date'),
    // @classification: Internal
    endDate: date('end_date'),
    // @classification: Internal
    notes: text('notes'),
    // @classification: Internal
    position: integer('position').notNull().default(0),
    /** 'seed' | 'user_built' */
    // @classification: Internal
    source: text('source').notNull().default('user_built'),
    // @classification: Internal
    createdBy: text('created_by'),
    // @classification: Internal
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    // @classification: Internal
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('farm_fixed_cost_lines_key_idx').on(t.workspaceId, t.key), index('farm_fixed_cost_lines_position_idx').on(t.position)],
);

/**
 * A leasehold-improvement line (0069). `extendedCents` is the figure of record;
 * dollars per square foot are derived from it against the facility size.
 *
 * `counted` keeps a line ON RECORD but out of the arithmetic — a scope item the
 * landlord covers, or one deferred to a later fit-out, stays visible with its
 * figure rather than being deleted and forgotten.
 */
export const farmLeaseholdLines = farmSchema.table(
  'leasehold_lines',
  {
  workspaceId: uuid('workspace_id').notNull().default(CURRENT_WORKSPACE),
    // @classification: Internal
    id: uuid('id').primaryKey().defaultRandom(),
    /** Stable across a reseed; a saved forecast's overlay keys on it. */
    // @classification: Internal
    key: text('key').notNull(),
    // @classification: Internal
    item: text('item').notNull(),
    // @classification: Confidential
    extendedCents: bigint('extended_cents', { mode: 'number' }).notNull().default(0),
    /** False = on record, out of the rollup. */
    // @classification: Internal
    counted: boolean('counted').notNull().default(true),
    // @classification: Internal
    notes: text('notes'),
    // @classification: Internal
    position: integer('position').notNull().default(0),
    /** 'seed' | 'user_built' */
    // @classification: Internal
    source: text('source').notNull().default('user_built'),
    // @classification: Internal
    createdBy: text('created_by'),
    // @classification: Internal
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    // @classification: Internal
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('farm_leasehold_lines_key_idx').on(t.workspaceId, t.key),
    index('farm_leasehold_lines_position_idx').on(t.position),
  ],
);

/**
 * A version of a training document (0070). A document is a FAMILY (`docKey`)
 * with numbered versions; a version is never overwritten. `publishedAt` is the
 * moment it became active and `archivedAt` the moment it stopped, so every
 * version is on file timestamped in and out of active status.
 *
 * `requiresRecompletion` records what the publisher chose for THIS version:
 * whether everyone was asked to read it again, or only new hires from then on.
 *
 * The file lives inline, like farm.sources. Select `fileBytes` only when
 * serving the file.
 */
export const farmTrainingDocs = farmSchema.table(
  'training_docs',
  {
  workspaceId: uuid('workspace_id').notNull().default(CURRENT_WORKSPACE),
    // @classification: Internal
    id: uuid('id').primaryKey().defaultRandom(),
    /** Every version of one document shares this key. */
    // @classification: Internal
    docKey: text('doc_key').notNull(),
    // @classification: Internal
    version: integer('version').notNull().default(1),
    // @classification: Internal
    title: text('title').notNull(),
    // @classification: Internal
    summary: text('summary'),
    // @classification: Internal
    requiredAtOrientation: boolean('required_at_orientation').notNull().default(true),
    /** What the publisher chose for this version. */
    // @classification: Internal
    requiresRecompletion: boolean('requires_recompletion').notNull().default(true),
    /** Null = a draft that has never been active. */
    // @classification: Internal
    publishedAt: timestamp('published_at', { withTimezone: true }),
    /** Null on a published row = the active version. */
    // @classification: Internal
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    // @classification: Internal
    supersededBy: uuid('superseded_by'),
    // @classification: Internal
    fileName: text('file_name').notNull(),
    // @classification: Internal
    fileMime: text('file_mime').notNull(),
    // @classification: Internal
    fileSize: integer('file_size').notNull().default(0),
    // @classification: Internal
    sha256: text('sha256'),
    /** The document itself. Select this column only when serving the file. */
    // @classification: Internal
    fileBytes: bytea('file_bytes'),
    // @classification: Internal
    notes: text('notes'),
    // @classification: Internal
    uploadedBy: text('uploaded_by'),
    // @classification: Internal
    publishedBy: text('published_by'),
    // @classification: Internal
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    // @classification: Internal
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('farm_training_docs_key_version_idx').on(t.workspaceId, t.docKey, t.version)],
);

/**
 * One person's assignment to one VERSION of a training document (0070).
 * Completion is recorded against the version, so "read and acknowledged v1"
 * stays true after v2 publishes.
 */
export const farmTrainingAssignments = farmSchema.table(
  'training_assignments',
  {
  workspaceId: uuid('workspace_id').notNull().default(CURRENT_WORKSPACE),
    // @classification: Internal
    id: uuid('id').primaryKey().defaultRandom(),
    // @classification: Internal
    docId: uuid('doc_id')
      .notNull()
      .references(() => farmTrainingDocs.id, { onDelete: 'cascade' }),
    // @classification: Confidential
    staffId: uuid('staff_id')
      .notNull()
      .references(() => farmStaff.id, { onDelete: 'cascade' }),
    // @classification: Internal
    assignedAt: timestamp('assigned_at', { withTimezone: true }).notNull().defaultNow(),
    // @classification: Confidential
    completedAt: timestamp('completed_at', { withTimezone: true }),
    // @classification: Confidential
    note: text('note'),
    // @classification: Internal
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    // @classification: Internal
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('farm_training_assignments_doc_staff_idx').on(t.docId, t.staffId),
    index('farm_training_assignments_staff_idx').on(t.staffId),
  ],
);

export type FarmTrainingDocRow = typeof farmTrainingDocs.$inferSelect;
export type FarmTrainingAssignmentRow = typeof farmTrainingAssignments.$inferSelect;

export type FarmLeaseholdLineRow = typeof farmLeaseholdLines.$inferSelect;
export type FarmLeaseholdLineInsert = typeof farmLeaseholdLines.$inferInsert;

export type FarmLoanRow = typeof farmLoans.$inferSelect;
export type FarmLoanInsert = typeof farmLoans.$inferInsert;
export type FarmFixedCostLineRow = typeof farmFixedCostLines.$inferSelect;
export type FarmFixedCostLineInsert = typeof farmFixedCostLines.$inferInsert;

export type FarmSupplierItemPriceRow = typeof farmSupplierItemPrices.$inferSelect;
export type FarmSupplierItemPriceInsert = typeof farmSupplierItemPrices.$inferInsert;

/**
 * A purchase order we generated. A PO is a DOCUMENT: once issued it states what
 * was ordered at what price and must not change when the model behind it moves.
 * That is why its lines are written down — the deliberate exception to the
 * platform's "every dollar is computed" rule (docs/farm/CLAUDE.md §2 rule 4).
 *
 * `supplierName` is denormalised so an issued order still reads correctly if the
 * supplier record is later changed.
 */
export const farmPurchaseOrders = farmSchema.table(
  'purchase_orders',
  {
  workspaceId: uuid('workspace_id').notNull().default(CURRENT_WORKSPACE),
    // @classification: Internal
    id: uuid('id').primaryKey().defaultRandom(),
    /** AMK-PO-YYYYMMDD-NN. */
    // @classification: Internal
    poNumber: text('po_number').notNull(),
    // @classification: Internal
    supplierId: text('supplier_id').notNull(),
    // @classification: Internal
    supplierName: text('supplier_name').notNull(),
    /** 'draft' | 'issued' | 'received' | 'closed' | 'cancelled'. */
    // @classification: Internal
    status: text('status').notNull().default('draft'),
    /** The production date this order buys for. */
    // @classification: Internal
    orderedFor: date('ordered_for').notNull(),
    // @classification: Confidential
    subtotalCents: integer('subtotal_cents').notNull().default(0),
    // @classification: Internal
    notes: text('notes'),
    // @classification: Internal
    issuedAt: timestamp('issued_at', { withTimezone: true }),
    // @classification: Internal
    receivedAt: timestamp('received_at', { withTimezone: true }),
    // @classification: Internal
    closedAt: timestamp('closed_at', { withTimezone: true }),
    // @classification: Internal
    createdBy: text('created_by'),
    // @classification: Internal
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    // @classification: Internal
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('farm_purchase_orders_supplier_idx').on(t.supplierId),
    index('farm_purchase_orders_status_idx').on(t.status),
    index('farm_purchase_orders_ordered_for_idx').on(t.orderedFor),
  ],
);

/** One ordered line. `input` traces the line back to what drove it. */
export const farmPurchaseOrderLines = farmSchema.table(
  'purchase_order_lines',
  {
  workspaceId: uuid('workspace_id').notNull().default(CURRENT_WORKSPACE),
    // @classification: Internal
    id: uuid('id').primaryKey().defaultRandom(),
    // @classification: Internal
    poId: uuid('po_id')
      .notNull()
      .references(() => farmPurchaseOrders.id, { onDelete: 'cascade' }),
    // @classification: Internal
    input: text('input').notNull(),
    /** The supplier's catalog line, when the input matched one. */
    // @classification: Internal
    supplierItemId: uuid('supplier_item_id').references(() => farmSupplierItems.id, {
      onDelete: 'set null',
    }),
    // @classification: Internal
    item: text('item').notNull(),
    // @classification: Internal
    qty: doublePrecision('qty').notNull(),
    // @classification: Internal
    unit: text('unit').notNull(),
    // @classification: Internal
    packSize: text('pack_size'),
    // @classification: Internal
    cases: integer('cases'),
    // @classification: Confidential
    unitPriceCents: integer('unit_price_cents').notNull().default(0),
    // @classification: Confidential
    extendedCents: integer('extended_cents').notNull().default(0),
    // @classification: Internal
    notes: text('notes'),
    // @classification: Internal
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('farm_purchase_order_lines_po_idx').on(t.poId)],
);

export type FarmSupplierItemRow = typeof farmSupplierItems.$inferSelect;
export type FarmSupplierItemInsert = typeof farmSupplierItems.$inferInsert;
export type FarmPurchaseOrderRow = typeof farmPurchaseOrders.$inferSelect;
export type FarmPurchaseOrderInsert = typeof farmPurchaseOrders.$inferInsert;
export type FarmPurchaseOrderLineRow = typeof farmPurchaseOrderLines.$inferSelect;
export type FarmPurchaseOrderLineInsert = typeof farmPurchaseOrderLines.$inferInsert;

// ── Actuals — the recorded facts that replace forecast lines (0048) ─────────

/**
 * A closed production record: the ISA-95 production performance object the
 * ledger posts from (`SowingExecution` in the Farm engine). The lots per variety — seed
 * issued, harvest, packed, in grams, with the seed lot, the output lot code and scrap with
 * reason codes — are one JSONB document because they are one physical event.
 */
export const farmSowingRecords = farmSchema.table(
  'sowing_records',
  {
  workspaceId: uuid('workspace_id').notNull().default(CURRENT_WORKSPACE),
    // @classification: Internal
    id: uuid('id').primaryKey().defaultRandom(),
    /** Operator-visible sowing id, e.g. B-260914-01. */
    // @classification: Internal
    sowingId: text('sowing_id').notNull(),
    // @classification: Internal
    growPlanCode: text('grow_plan_code').notNull(),
    // @classification: Internal
    productionDate: date('production_date').notNull(),
    /** The grow plan standard in force on the production date. */
    // @classification: Internal
    standardVersion: text('standard_version').notNull(),
    // @classification: Internal
    plannedUnits: doublePrecision('planned_units').notNull(),
    /** Trays that passed the harvest check and were packed. */
    // @classification: Internal
    goodUnits: doublePrecision('good_units').notNull(),
    /** Sowings the record covers: fixed labor is per sowing. */
    // @classification: Internal
    sowingsRun: integer('sowings_run').notNull().default(1),
    /** VarietyLot[] — one lot per variety: seed issued, harvest, packed, in grams, and scrap (0009). */
    // @classification: Internal
    lots: jsonb('lots').notNull().default([]),
    /** SowingIssue[] — the medium and nutrient issued to the trays (0009). */
    // @classification: Internal
    issues: jsonb('issues').notNull().default([]),
    /** CrewHoursLine[] — who worked the sowing and for how long (0053). */
    // @classification: Confidential
    crew: jsonb('crew').notNull().default([]),
    /** The grow-model record (0008): the tray format, trays sown and packed, the grow unit, the packed day and the stage records. */
    // @classification: Internal
    format: text('format'),
    // @classification: Internal
    traysSown: doublePrecision('trays_sown'),
    // @classification: Internal
    traysPacked: doublePrecision('trays_packed'),
    // @classification: Internal
    growUnitKey: text('grow_unit_key'),
    // @classification: Internal
    packedOn: date('packed_on'),
    /** StageRecords: seed treatment, spent-water test, grow-room readings, harvest check. */
    // @classification: Internal
    stageRecords: jsonb('stage_records'),
    // @classification: Confidential
    actualLaborHours: doublePrecision('actual_labor_hours'),
    // @classification: Confidential
    actualLaborRate: doublePrecision('actual_labor_rate'),
    // @classification: Internal
    closedBy: text('closed_by'),
    // @classification: Internal
    closedAt: timestamp('closed_at', { withTimezone: true }),
    // @classification: Internal
    notes: text('notes'),
    /** The experiment the sowing ran (0016); null on a production sowing. */
    // @classification: Internal
    experimentId: uuid('experiment_id'),
    // @classification: Internal
    createdBy: text('created_by'),
    // @classification: Internal
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    // @classification: Internal
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('farm_sowing_records_date_idx').on(t.productionDate)],
);

/** Goods received, with the lot code assigned on receipt and the invoice price. */
export const farmReceipts = farmSchema.table(
  'receipts',
  {
  workspaceId: uuid('workspace_id').notNull().default(CURRENT_WORKSPACE),
    // @classification: Internal
    id: uuid('id').primaryKey().defaultRandom(),
    // @classification: Internal
    poId: uuid('po_id').references(() => farmPurchaseOrders.id, { onDelete: 'set null' }),
    // @classification: Internal
    supplierId: text('supplier_id'),
    // @classification: Internal
    supplierName: text('supplier_name'),
    // @classification: Internal
    receivedOn: date('received_on').notNull(),
    // @classification: Internal
    invoiceNumber: text('invoice_number'),
    // @classification: Confidential
    invoiceTotalCents: integer('invoice_total_cents'),
    /** [{ input, qty, unit, lotCode, unitPriceCents }] */
    // @classification: Confidential
    lines: jsonb('lines').notNull().default([]),
    // @classification: Internal
    receivedBy: text('received_by'),
    // @classification: Internal
    notes: text('notes'),
    // @classification: Internal
    createdBy: text('created_by'),
    // @classification: Internal
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('farm_receipts_date_idx').on(t.receivedOn), index('farm_receipts_po_idx').on(t.poId)],
);

/** Units distributed by channel, pickup point and date at the price charged. */
export const farmDistributions = farmSchema.table(
  'distributions',
  {
  workspaceId: uuid('workspace_id').notNull().default(CURRENT_WORKSPACE),
    // @classification: Internal
    id: uuid('id').primaryKey().defaultRandom(),
    // @classification: Internal
    distributedOn: date('distributed_on').notNull(),
    /** 1 prospect, 2 restaurants, 3 retail and wholesale / retail. */
    // @classification: Internal
    phase: integer('phase').notNull(),
    // @classification: Internal
    pickupPointId: text('pickup_point_id'),
    // @classification: Internal
    pickupPointName: text('pickup_point_name'),
    // @classification: Internal
    units: doublePrecision('units').notNull(),
    // @classification: Confidential
    pricePerUnitCents: integer('price_per_unit_cents').notNull(),
    /** Finished-goods lot codes shipped. */
    // @classification: Internal
    lotCodes: jsonb('lot_codes').notNull().default([]),
    // @classification: Internal
    distributedBy: text('distributed_by'),
    /** Product temperature at hand-off, °F (0052, Roadmap I4). */
    // @classification: Internal
    handoffTempF: doublePrecision('handoff_temp_f'),
    /** Who signed for it at the pickup point (0052). */
    // @classification: Internal
    receivedBy: text('received_by'),
    /** The subscriber the units were distributed to, when recorded against an order (0057). */
    // @classification: Internal
    subscriberId: uuid('subscriber_id').references(() => farmSubscribers.id, { onDelete: 'set null' }),
    /** The monthly invoice the distribution's route was added to (0057). */
    // @classification: Internal
    invoiceId: uuid('invoice_id').references(() => farmInvoices.id, { onDelete: 'set null' }),
    /** When the route carrying this distribution was completed (0057). */
    // @classification: Internal
    routeCompletedAt: timestamp('route_completed_at', { withTimezone: true }),
    // @classification: Internal
    notes: text('notes'),
    // @classification: Internal
    createdBy: text('created_by'),
    // @classification: Internal
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('farm_distributions_date_idx').on(t.distributedOn),
    index('farm_distributions_phase_idx').on(t.phase),
    index('farm_distributions_invoice_idx').on(t.invoiceId),
    index('farm_distributions_subscriber_idx').on(t.subscriberId),
  ],
);

/** Occupancy, utilities, admin and other period costs by month. */
export const farmPeriodBills = farmSchema.table(
  'period_bills',
  {
  workspaceId: uuid('workspace_id').notNull().default(CURRENT_WORKSPACE),
    // @classification: Internal
    id: uuid('id').primaryKey().defaultRandom(),
    /** YYYY-MM */
    // @classification: Internal
    period: text('period').notNull(),
    /** 'lease' | 'utilities' | 'admin' | 'other' */
    // @classification: Internal
    category: text('category').notNull(),
    // @classification: Internal
    accountCode: text('account_code').notNull(),
    // @classification: Confidential
    amountCents: integer('amount_cents').notNull(),
    // @classification: Internal
    vendor: text('vendor'),
    // @classification: Internal
    invoiceNumber: text('invoice_number'),
    // @classification: Internal
    incurredOn: date('incurred_on'),
    // @classification: Internal
    paidOn: date('paid_on'),
    /** PaymentTerms; null on bills recorded before 0057. */
    // @classification: Internal
    paymentTerms: text('payment_terms'),
    // @classification: Internal
    sourceId: uuid('source_id').references(() => farmSources.id, { onDelete: 'set null' }),
    // @classification: Internal
    notes: text('notes'),
    // @classification: Internal
    createdBy: text('created_by'),
    // @classification: Internal
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('farm_period_bills_period_idx').on(t.period)],
);

/**
 * A fiscal period (YYYY-MM; fiscal year = calendar year) that has been locked
 * at least once. No row = open. A locked period refuses postings; a super
 * admin may reopen it; both events are on the posting log (Roadmap J3).
 */
export const farmFiscalPeriods = farmSchema.table('fiscal_periods', {
  workspaceId: uuid('workspace_id').notNull().default(CURRENT_WORKSPACE),
  // @classification: Internal
  period: text('period').notNull(),
  /** 'open' | 'locked' */
  // @classification: Internal
  status: text('status').notNull().default('open'),
  // @classification: Internal
  lockedAt: timestamp('locked_at', { withTimezone: true }),
  // @classification: Internal
  lockedBy: text('locked_by'),
  // @classification: Internal
  reopenedAt: timestamp('reopened_at', { withTimezone: true }),
  // @classification: Internal
  reopenedBy: text('reopened_by'),
  // @classification: Internal
  notes: text('notes'),
  // @classification: Internal
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.workspaceId, t.period] })]);

/** Dated ranges the farm does not produce or distribute: major holidays; the farm runs year-round (Roadmap J1). */
export const farmCalendarClosures = farmSchema.table(
  'calendar_closures',
  {
  workspaceId: uuid('workspace_id').notNull().default(CURRENT_WORKSPACE),
    // @classification: Internal
    id: uuid('id').primaryKey().defaultRandom(),
    // @classification: Internal
    label: text('label').notNull(),
    /** 'holiday' | 'closure' */
    // @classification: Internal
    kind: text('kind').notNull().default('closure'),
    // @classification: Internal
    startDate: date('start_date').notNull(),
    // @classification: Internal
    endDate: date('end_date').notNull(),
    // @classification: Internal
    notes: text('notes'),
    // @classification: Internal
    createdBy: text('created_by'),
    // @classification: Internal
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('farm_calendar_closures_dates_idx').on(t.startDate, t.endDate)],
);

/**
 * The append-only, hash-chained posting trail (Roadmap J4): who posted what
 * from which record, and every period lock and reopen. `hash` is SHA-256 over
 * the previous row's hash and this row's canonical fields; a trigger refuses
 * UPDATE and DELETE.
 */
export const farmPostingLog = farmSchema.table(
  'posting_log',
  {
  workspaceId: uuid('workspace_id').notNull().default(CURRENT_WORKSPACE),
    // @classification: Internal
    seq: bigserial('seq', { mode: 'number' }).primaryKey(),
    // @classification: Internal
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    // @classification: Internal
    actorUserId: text('actor_user_id').notNull(),
    // @classification: Confidential
    actorEmail: text('actor_email'),
    // @classification: Internal
    action: text('action').notNull(),
    // @classification: Internal
    recordKind: text('record_kind').notNull(),
    // @classification: Internal
    recordId: text('record_id').notNull(),
    // @classification: Internal
    period: text('period').notNull(),
    // @classification: Internal
    detail: jsonb('detail').notNull().default({}),
    // @classification: Internal
    prevHash: text('prev_hash').notNull(),
    // @classification: Internal
    hash: text('hash').notNull().unique(),
  },
  (t) => [index('farm_posting_log_period_idx').on(t.period)],
);

/**
 * An approved standard-cost version (Roadmap J5): the grow plan as resolved on
 * the plan of record plus the cost assumptions, frozen with an effective date.
 * The ledger costs a sowing at the version in force on its production date.
 */
export const farmStandardVersions = farmSchema.table(
  'standard_versions',
  {
  workspaceId: uuid('workspace_id').notNull().default(CURRENT_WORKSPACE),
    // @classification: Internal
    id: uuid('id').primaryKey().defaultRandom(),
    // @classification: Internal
    growPlanCode: text('grow_plan_code').notNull(),
    // @classification: Internal
    version: integer('version').notNull(),
    // @classification: Internal
    effectiveFrom: date('effective_from').notNull(),
    // @classification: Internal
    approvedBy: text('approved_by').notNull(),
    // @classification: Internal
    approvedAt: timestamp('approved_at', { withTimezone: true }).notNull().defaultNow(),
    // @classification: Internal
    notes: text('notes'),
    /** StandardSnapshot — { labor standard, variable overhead per tray, overhead rate }; older rows carry the grow plan and assumptions (`readSnapshot`). */
    // @classification: Confidential
    snapshot: jsonb('snapshot').notNull(),
  },
  (t) => [index('farm_standard_versions_code_date_idx').on(t.growPlanCode, t.effectiveFrom)],
);

export type FarmSowingRecordRow = typeof farmSowingRecords.$inferSelect;
export type FarmSowingRecordInsert = typeof farmSowingRecords.$inferInsert;
export type FarmReceiptRow = typeof farmReceipts.$inferSelect;
export type FarmReceiptInsert = typeof farmReceipts.$inferInsert;
export type FarmDistributionRow = typeof farmDistributions.$inferSelect;
export type FarmDistributionInsert = typeof farmDistributions.$inferInsert;
export type FarmPeriodBillRow = typeof farmPeriodBills.$inferSelect;
export type FarmPeriodBillInsert = typeof farmPeriodBills.$inferInsert;

// ── Grow plan library (0049) ───────────────────────────────────────────────────

/**
 * A library grow plan: the item master's finished goods. Status is
 * 'in_service' | 'planned' | 'developing'; `channels` are the expansion phases
 * it serves. The code constant in the web app is the seed row, not the source.
 */
export const farmGrowPlans = farmSchema.table(
  'grow_plans',
  {
  workspaceId: uuid('workspace_id').notNull().default(CURRENT_WORKSPACE),
    // @classification: Internal
    id: uuid('id').primaryKey().defaultRandom(),
    // @classification: Internal
    code: text('code').notNull(),
    // @classification: Internal
    name: text('name').notNull(),
    // @classification: Internal
    status: text('status').notNull().default('developing'),
    /** Expansion phases served, e.g. [1] or [2, 3]. */
    // @classification: Internal
    channels: jsonb('channels').notNull().default([]),
    /** Free text, blank until stated (0014). */
    // @classification: Internal
    allergensPresent: text('allergens_present').notNull().default(''),
    // @classification: Internal
    allergenFreeClaims: text('allergen_free_claims').notNull().default(''),
    /** The grow plan's tray format key (0003). */
    // @classification: Internal
    format: text('format').notNull().default('flat-1020'),
    /** Days per stage when the plan overrides its varieties' (0003); null = the varieties' own. */
    // @classification: Internal
    stageDays: jsonb('stage_days'),
    // @classification: Internal
    note: text('note').notNull().default(''),
    /** 'seed' | 'user_built' */
    // @classification: Internal
    source: text('source').notNull().default('user_built'),
    // @classification: Internal
    version: integer('version').notNull().default(1),
    // @classification: Internal
    effectiveFrom: date('effective_from'),
    // @classification: Internal
    createdBy: text('created_by'),
    // @classification: Internal
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    // @classification: Internal
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('farm_grow_plans_status_idx').on(t.status)],
);

/** One grow plan line; `line` is the typed GrowPlanLine document (seed, medium, nutrient or light). */
export const farmGrowPlanLines = farmSchema.table(
  'grow_plan_lines',
  {
  workspaceId: uuid('workspace_id').notNull().default(CURRENT_WORKSPACE),
    // @classification: Internal
    id: uuid('id').primaryKey().defaultRandom(),
    // @classification: Internal
    growPlanId: uuid('grow_plan_id')
      .notNull()
      .references(() => farmGrowPlans.id, { onDelete: 'cascade' }),
    // @classification: Internal
    position: integer('position').notNull().default(0),
    // @classification: Internal
    name: text('name').notNull(),
    // @classification: Confidential
    line: jsonb('line').notNull(),
    // @classification: Internal
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    // @classification: Internal
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('farm_grow_plan_lines_grow_plan_idx').on(t.growPlanId, t.position)],
);

export type FarmGrowPlanRow = typeof farmGrowPlans.$inferSelect;
export type FarmGrowPlanInsert = typeof farmGrowPlans.$inferInsert;
export type FarmGrowPlanLineRow = typeof farmGrowPlanLines.$inferSelect;
export type FarmGrowPlanLineInsert = typeof farmGrowPlanLines.$inferInsert;

// ── Subscribers and pickup points ──────────────────────────────────────────────

/** A subscriber on one channel: a person, a restaurant or a retail account. */
export const farmSubscribers = farmSchema.table(
  'subscribers',
  {
  workspaceId: uuid('workspace_id').notNull().default(CURRENT_WORKSPACE),
    // @classification: Internal
    id: uuid('id').primaryKey().defaultRandom(),
    // @classification: Confidential
    name: text('name').notNull(),
    // @classification: Internal
    channel: integer('channel').notNull(),
    /** 'prospect' | 'contracted' | 'forecast' | 'inactive' — 'forecast' is a Forecast Subscriber, never on Actual. */
    // @classification: Internal
    status: text('status').notNull().default('prospect'),
    /** Null = the channel's default price. */
    // @classification: Confidential
    pricePerUnitCents: integer('price_per_unit_cents'),
    // @classification: Internal
    contractStart: date('contract_start'),
    // @classification: Internal
    contractEnd: date('contract_end'),
    // @classification: Internal
    prospectId: text('prospect_id'),
    /** 'due_on_receipt' | 'net_15' | 'net_30'; null = not set, no default (0057). */
    // @classification: Internal
    paymentTerms: text('payment_terms'),
    /** Own use (0022): the owner's own trays; a distribution goes to Owner Draws at cost, with no revenue or invoice. */
    // @classification: Internal
    ownUse: boolean('own_use').notNull().default(false),
    // @classification: Internal
    notes: text('notes'),
    /** Named nutrition targets (0007): keys from src/data/nutrition-targets.ts. */
    // @classification: Confidential
    nutritionTargets: jsonb('nutrition_targets').notNull().default([]),
    /** The subscriber's Stripe customer (0024), created when a card is put on file; null = none. */
    // @classification: Confidential
    stripeCustomerId: text('stripe_customer_id'),
    /** The client's sign-in email (0025), lowercased: the Client Portal links the account that signs in with it. */
    // @classification: Confidential
    email: text('email'),
    /** 'seed' | 'user_built' */
    // @classification: Internal
    source: text('source').notNull().default('user_built'),
    // @classification: Internal
    createdBy: text('created_by'),
    // @classification: Internal
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    // @classification: Internal
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('farm_subscribers_channel_idx').on(t.channel)],
);

/** Where a subscriber is served: the house, a shared pickup spot, or their own address on a route. */
export const farmSubscriberPickupPoints = farmSchema.table(
  'subscriber_pickup_points',
  {
  workspaceId: uuid('workspace_id').notNull().default(CURRENT_WORKSPACE),
    // @classification: Internal
    id: uuid('id').primaryKey().defaultRandom(),
    // @classification: Internal
    subscriberId: uuid('subscriber_id')
      .notNull()
      .references(() => farmSubscribers.id, { onDelete: 'cascade' }),
    /** Distribution pickup point id (Pickup Points & Routes) when linked. */
    // @classification: Internal
    pickupPointId: text('pickup_point_id'),
    // @classification: Confidential
    name: text('name').notNull(),
    /** 'active' | 'planned' | 'inactive' */
    // @classification: Internal
    status: text('status').notNull().default('active'),
    // @classification: Internal
    notes: text('notes'),
    // @classification: Internal
    createdBy: text('created_by'),
    // @classification: Internal
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    // @classification: Internal
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('farm_subscriber_pickup_points_subscriber_idx').on(t.subscriberId), index('farm_subscriber_pickup_points_pickup_point_idx').on(t.pickupPointId)],
);

export type FarmSubscriberRow = typeof farmSubscribers.$inferSelect;
export type FarmSubscriberInsert = typeof farmSubscribers.$inferInsert;
export type FarmSubscriberPickupPointRow = typeof farmSubscriberPickupPoints.$inferSelect;
export type FarmSubscriberPickupPointInsert = typeof farmSubscriberPickupPoints.$inferInsert;

// ── Orders ───────────────────────────────────────────

/**
 * A stored order: a typed forecast, a confirmed count, or a distributed order
 * naming its distribution record. One row per date, pickup point, subscription and grow plan;
 * it replaces the derived forecast order with the same key.
 */
export const farmOrders = farmSchema.table(
  'orders',
  {
  workspaceId: uuid('workspace_id').notNull().default(CURRENT_WORKSPACE),
    // @classification: Internal
    id: uuid('id').primaryKey().defaultRandom(),
    // @classification: Internal
    orderDate: date('order_date').notNull(),
    // @classification: Internal
    subscriberId: uuid('subscriber_id')
      .notNull()
      .references(() => farmSubscribers.id, { onDelete: 'cascade' }),
    // @classification: Internal
    subscriberPickupPointId: uuid('subscriber_pickup_point_id')
      .notNull()
      .references(() => farmSubscriberPickupPoints.id, { onDelete: 'cascade' }),
    // @classification: Internal
    channel: integer('channel').notNull(),
    // @classification: Internal
    growPlanCode: text('grow_plan_code').notNull(),
    // @classification: Confidential
    units: doublePrecision('units').notNull(),
    /** 'forecast' | 'confirmed' | 'distributed' */
    // @classification: Internal
    status: text('status').notNull().default('forecast'),
    /** Null = the subscriber's contracted price, else the channel default. */
    // @classification: Confidential
    pricePerUnitCents: integer('price_per_unit_cents'),
    // @classification: Internal
    distributionId: uuid('distribution_id').references(() => farmDistributions.id, { onDelete: 'set null' }),
    /** The subscription the order is a distribution of; null on a typed order. */
    // @classification: Internal
    subscriptionId: uuid('subscription_id'),
    /** 'typed' | 'subscription' | 'sales' | 'portal' */
    // @classification: Internal
    source: text('source').notNull().default('typed'),
    // @classification: Internal
    notes: text('notes'),
    // @classification: Internal
    createdBy: text('created_by'),
    // @classification: Internal
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    // @classification: Internal
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('farm_orders_date_idx').on(t.orderDate),
    index('farm_orders_subscriber_idx').on(t.subscriberId, t.orderDate),
    index('farm_orders_pickup_point_idx').on(t.subscriberPickupPointId),
    index('farm_orders_distribution_idx').on(t.distributionId),
  ],
);

export type FarmOrderRow = typeof farmOrders.$inferSelect;
export type FarmOrderInsert = typeof farmOrders.$inferInsert;

// ── Working capital and invoicing (0057, Roadmap Phase K) ───────────────────

/** Payment terms per supplier. Suppliers are a typed record, not a table, so terms key on its id. */
export const farmSupplierTerms = farmSchema.table('supplier_terms', {
  workspaceId: uuid('workspace_id').notNull().default(CURRENT_WORKSPACE),
  // @classification: Internal
  supplierId: text('supplier_id').notNull(),
  // @classification: Internal
  supplierName: text('supplier_name'),
  /** 'due_on_receipt' | 'net_15' | 'net_30' | 'net_60' | 'net_90' */
  // @classification: Internal
  paymentTerms: text('payment_terms').notNull(),
  // @classification: Internal
  updatedBy: text('updated_by'),
  // @classification: Internal
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.workspaceId, t.supplierId] })]);

/**
 * A subscriber invoice: one a month per subscriber, open while completed routes
 * are added to it, issued with the subscriber's terms and a due date. What it
 * bills is the distributions that name it; no total is stored.
 */
export const farmInvoices = farmSchema.table(
  'invoices',
  {
  workspaceId: uuid('workspace_id').notNull().default(CURRENT_WORKSPACE),
    // @classification: Internal
    id: uuid('id').primaryKey().defaultRandom(),
    /** AMK-INV-YYYYMMDD-NN */
    // @classification: Internal
    invoiceNumber: text('invoice_number').notNull(),
    // @classification: Internal
    subscriberId: uuid('subscriber_id')
      .notNull()
      .references(() => farmSubscribers.id, { onDelete: 'restrict' }),
    // @classification: Confidential
    subscriberName: text('subscriber_name').notNull(),
    /** YYYY-MM */
    // @classification: Internal
    period: text('period').notNull(),
    /** 'open' | 'issued' */
    // @classification: Internal
    status: text('status').notNull().default('open'),
    // @classification: Internal
    openedOn: date('opened_on').notNull(),
    // @classification: Internal
    paymentTerms: text('payment_terms'),
    // @classification: Internal
    issuedOn: date('issued_on'),
    // @classification: Internal
    dueOn: date('due_on'),
    // @classification: Internal
    issuedBy: text('issued_by'),
    // @classification: Internal
    notes: text('notes'),
    // @classification: Internal
    createdBy: text('created_by'),
    // @classification: Internal
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    // @classification: Internal
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('farm_invoices_subscriber_idx').on(t.subscriberId, t.period)],
);

/** Cash received from a subscriber, applied to invoices. */
export const farmSubscriberPayments = farmSchema.table(
  'subscriber_payments',
  {
  workspaceId: uuid('workspace_id').notNull().default(CURRENT_WORKSPACE),
    // @classification: Internal
    id: uuid('id').primaryKey().defaultRandom(),
    // @classification: Internal
    subscriberId: uuid('subscriber_id')
      .notNull()
      .references(() => farmSubscribers.id, { onDelete: 'restrict' }),
    // @classification: Confidential
    subscriberName: text('subscriber_name').notNull(),
    // @classification: Internal
    receivedOn: date('received_on').notNull(),
    // @classification: Confidential
    amountCents: integer('amount_cents').notNull(),
    // @classification: Internal
    method: text('method'),
    // @classification: Confidential
    reference: text('reference'),
    /** [{ documentId, amountCents }] — documentId is the invoice. */
    // @classification: Confidential
    applications: jsonb('applications').notNull().default([]),
    // @classification: Internal
    notes: text('notes'),
    // @classification: Internal
    createdBy: text('created_by'),
    // @classification: Internal
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('farm_subscriber_payments_date_idx').on(t.receivedOn)],
);

/** A supplier's bill, recorded against the receipts it covers (three-way match). */
export const farmSupplierBills = farmSchema.table(
  'supplier_bills',
  {
  workspaceId: uuid('workspace_id').notNull().default(CURRENT_WORKSPACE),
    // @classification: Internal
    id: uuid('id').primaryKey().defaultRandom(),
    // @classification: Internal
    supplierId: text('supplier_id'),
    // @classification: Internal
    supplierName: text('supplier_name').notNull(),
    // @classification: Internal
    billNumber: text('bill_number').notNull(),
    // @classification: Internal
    billDate: date('bill_date').notNull(),
    // @classification: Internal
    paymentTerms: text('payment_terms').notNull(),
    /** string[] of receipt ids. */
    // @classification: Internal
    receiptIds: jsonb('receipt_ids').notNull().default([]),
    /** [{ input, qty, unit, unitPriceCents }] */
    // @classification: Confidential
    lines: jsonb('lines').notNull().default([]),
    // @classification: Internal
    notes: text('notes'),
    // @classification: Internal
    createdBy: text('created_by'),
    // @classification: Internal
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    // @classification: Internal
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('farm_supplier_bills_date_idx').on(t.billDate)],
);

/** Cash paid to a supplier, applied to bills. */
export const farmSupplierPayments = farmSchema.table(
  'supplier_payments',
  {
  workspaceId: uuid('workspace_id').notNull().default(CURRENT_WORKSPACE),
    // @classification: Internal
    id: uuid('id').primaryKey().defaultRandom(),
    // @classification: Internal
    supplierId: text('supplier_id'),
    // @classification: Internal
    supplierName: text('supplier_name').notNull(),
    // @classification: Internal
    paidOn: date('paid_on').notNull(),
    // @classification: Confidential
    amountCents: integer('amount_cents').notNull(),
    // @classification: Internal
    method: text('method'),
    // @classification: Confidential
    reference: text('reference'),
    /** [{ documentId, amountCents }] — documentId is the bill. */
    // @classification: Confidential
    applications: jsonb('applications').notNull().default([]),
    // @classification: Internal
    notes: text('notes'),
    // @classification: Internal
    createdBy: text('created_by'),
    // @classification: Internal
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('farm_supplier_payments_date_idx').on(t.paidOn)],
);

/** The opening balance sheet of the actuals: owners' equity, the fit-out and its financing. */
export const farmOpeningBalances = farmSchema.table('opening_balances', {
  workspaceId: uuid('workspace_id').notNull().default(CURRENT_WORKSPACE),
  // @classification: Internal
  id: uuid('id').primaryKey().defaultRandom(),
  // @classification: Internal
  asOf: date('as_of').notNull(),
  // @classification: Confidential
  ownerEquityCents: integer('owner_equity_cents').notNull(),
  // @classification: Confidential
  fixedAssetsCents: integer('fixed_assets_cents').notNull().default(0),
  // @classification: Confidential
  longTermDebtCents: integer('long_term_debt_cents').notNull().default(0),
  // @classification: Internal
  notes: text('notes'),
  // @classification: Internal
  createdBy: text('created_by'),
  // @classification: Internal
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** The people on the time clock. */
export const farmStaff = farmSchema.table('staff', {
  workspaceId: uuid('workspace_id').notNull().default(CURRENT_WORKSPACE),
  // @classification: Internal
  id: uuid('id').primaryKey().defaultRandom(),
  // @classification: Confidential
  name: text('name').notNull(),
  // @classification: Internal
  role: text('role'),
  /**
   * The person's employee reference in Staffing (0060). No pay is held in Farm
   * (Roadmap O1); the pay columns were dropped in 0062.
   */
  // @classification: Internal
  employeeRef: text('staffing_employee_ref'),
  /**
   * Sign-in email (0063), lowercased, one person per email. An active person whose
   * email is their sign-in holds the operator role and sees their own record (Roadmap O5).
   */
  // @classification: Confidential
  email: text('email'),
  /** Work roles the person may clock in under: 'operator' | 'sales' (0074, Roadmap P2). */
  // @classification: Internal
  roles: text('roles').array().notNull().default(sql`'{operator}'::text[]`),
  /** 'active' | 'inactive' */
  // @classification: Internal
  status: text('status').notNull().default('active'),
  // @classification: Internal
  startedOn: date('started_on'),
  // @classification: Confidential
  notes: text('notes'),
  // @classification: Internal
  createdBy: text('created_by'),
  // @classification: Internal
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  // @classification: Internal
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** One punch on the time clock: in, break start, break end, out. */
export const farmTimePunches = farmSchema.table(
  'time_punches',
  {
  workspaceId: uuid('workspace_id').notNull().default(CURRENT_WORKSPACE),
    // @classification: Internal
    id: uuid('id').primaryKey().defaultRandom(),
    // @classification: Internal
    staffId: uuid('staff_id')
      .notNull()
      .references(() => farmStaff.id, { onDelete: 'restrict' }),
    /** 'in' | 'break_start' | 'break_end' | 'out' */
    // @classification: Internal
    kind: text('kind').notNull(),
    // @classification: Confidential
    punchedAt: timestamp('punched_at', { withTimezone: true }).notNull(),
    /** The role of the shift this punch belongs to, taken at clock-in (0074, Roadmap P2); null = before roles. */
    // @classification: Internal
    role: text('role'),
    /** 'clock' | 'manual' */
    // @classification: Internal
    source: text('source').notNull().default('clock'),
    // @classification: Confidential
    reason: text('reason'),
    // @classification: Internal
    recordedBy: text('recorded_by'),
    // @classification: Internal
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('farm_time_punches_staff_idx').on(t.staffId, t.punchedAt), index('farm_time_punches_at_idx').on(t.punchedAt)],
);

export type FarmInvoiceRow = typeof farmInvoices.$inferSelect;
export type FarmSupplierBillRow = typeof farmSupplierBills.$inferSelect;
export type FarmStaffRow = typeof farmStaff.$inferSelect;
export type FarmTimePunchRow = typeof farmTimePunches.$inferSelect;

/**
 * The equipment library (Roadmap N1, 0058): every unit in service, planned for a
 * build-out phase, not selected, or on the list and not needed. `key` is the
 * stable reference the Sustainability attributes and entity links use.
 */
export const farmEquipment = farmSchema.table(
  'equipment',
  {
  workspaceId: uuid('workspace_id').notNull().default(CURRENT_WORKSPACE),
    // @classification: Internal
    id: uuid('id').primaryKey().defaultRandom(),
    // @classification: Internal
    key: text('key').notNull(),
    // @classification: Internal
    position: integer('position').notNull().default(0),
    // @classification: Internal
    item: text('item').notNull(),
    // @classification: Internal
    category: text('category').notNull(),
    /** 'home' | 'commercial': the home grow room, or a rented commercial facility (0010). */
    // @classification: Internal
    setting: text('setting').notNull().default('commercial'),
    /** Build-out phase, 1–3. */
    // @classification: Internal
    buildPhase: integer('build_phase').notNull().default(1),
    /** 'in_service' | 'planned' | 'no' | 'unset' */
    // @classification: Internal
    status: text('status').notNull().default('unset'),
    /** Null = TBD. */
    // @classification: Internal
    inServiceDate: date('in_service_date'),
    /** 'New' | 'Used' */
    // @classification: Internal
    newUsed: text('new_used').notNull().default('New'),
    // @classification: Internal
    qty: doublePrecision('qty').notNull().default(0),
    // @classification: Confidential
    unitCostCents: integer('unit_cost_cents').notNull().default(0),
    // @classification: Internal
    critical: boolean('critical').notNull().default(false),
    // @classification: Internal
    notes: text('notes'),
    /** A grow unit's shelves, shelf width in inches and fixture key (0003); null on equipment no tray sits on. */
    // @classification: Internal
    shelves: integer('shelves'),
    // @classification: Internal
    shelfWidthIn: doublePrecision('shelf_width_in'),
    // @classification: Internal
    fixtureKey: text('fixture_key'),
    /** A dark rack (0020): it holds tray sowings only through germination and blackout. */
    // @classification: Internal
    darkStagesOnly: boolean('dark_stages_only').notNull().default(false),
    /** Each shelf's lights, top to bottom, where they differ from the fixture at its count a shelf (0021): [{ fixtureKey, count }]. */
    // @classification: Internal
    shelfLights: jsonb('shelf_lights'),
    /** Pounds one unit takes in one run (0065); null on equipment a sowing does not pass through. */
    // @classification: Internal
    sowingCapacityLb: doublePrecision('sowing_capacity_lb'),
    /** 'estimated' | 'stated' | 'observed' (0065) */
    // @classification: Internal
    sowingCapacityBasis: text('sowing_capacity_basis').notNull().default('estimated'),
    /** Sowings one unit holds at once (0066); null on equipment no sowing runs on. */
    // @classification: Internal
    concurrentSowings: integer('concurrent_sowings'),
    /** Minutes the unit is unavailable between sowings beyond the study's lines (0066). */
    // @classification: Internal
    changeoverMinutes: doublePrecision('changeover_minutes'),
    /** Crew is needed for the whole run (0066). */
    // @classification: Internal
    attendedRun: boolean('attended_run'),
    /** The unit may run with the building empty (0066). */
    // @classification: Internal
    mayRunUnattended: boolean('may_run_unattended'),
    /** 'estimated' | 'stated' | 'observed' — the basis of the four resource attributes (0066). */
    // @classification: Internal
    resourceBasis: text('resource_basis').notNull().default('estimated'),
    /** Plan footprint, inches (0076): null on a row with no incremental floor. */
    // @classification: Internal
    footprintWidthIn: doublePrecision('footprint_width_in'),
    // @classification: Internal
    footprintDepthIn: doublePrecision('footprint_depth_in'),
    /** Published installation clearances, inches (0076); null where the zone factor applies. */
    // @classification: Internal
    clearanceFrontIn: doublePrecision('clearance_front_in'),
    // @classification: Internal
    clearanceRearIn: doublePrecision('clearance_rear_in'),
    // @classification: Internal
    clearanceSideIn: doublePrecision('clearance_side_in'),
    /** 'sourced' | 'estimated' | 'stated' | 'observed' (0076) */
    // @classification: Internal
    footprintBasis: text('footprint_basis').notNull().default('estimated'),
    /** The facility zone the unit works in (0076); null where it has no floor. */
    // @classification: Internal
    zone: text('zone'),
    /** Sits under a Type I hood (0076). */
    // @classification: Internal
    underHood: boolean('under_hood').notNull().default(false),
    /** Where the dimensions came from, or why the row carries no floor (0076). */
    // @classification: Internal
    footprintSource: text('footprint_source'),
    /** The representative model and its spec sheet (0079). */
    // @classification: Internal
    manufacturer: text('manufacturer'),
    // @classification: Internal
    model: text('model'),
    // @classification: Internal
    specSheetUrl: text('spec_sheet_url'),
    /** 'seed' | 'user_built' */
    // @classification: Internal
    source: text('source').notNull().default('user_built'),
    // @classification: Internal
    createdBy: text('created_by'),
    // @classification: Internal
    updatedBy: text('updated_by'),
    // @classification: Internal
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    // @classification: Internal
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('farm_equipment_status_idx').on(t.status, t.buildPhase)],
);

export type FarmEquipmentRow = typeof farmEquipment.$inferSelect;

/**
 * The floor layout (Roadmap Q6, 0077): a drawing per scenario and build phase,
 * versions never overwritten. A drawing, not a ledger entry.
 */
export const farmFacilityLayouts = farmSchema.table(
  'facility_layouts',
  {
  workspaceId: uuid('workspace_id').notNull().default(CURRENT_WORKSPACE),
    // @classification: Internal
    id: uuid('id').primaryKey().defaultRandom(),
    /** The scenario id, or 'plan-data' when no plan of record is set. */
    // @classification: Internal
    scenarioKey: text('scenario_key').notNull(),
    // @classification: Internal
    buildPhase: integer('build_phase').notNull(),
    // @classification: Internal
    version: integer('version').notNull().default(1),
    // @classification: Internal
    label: text('label').notNull().default(''),
    // @classification: Internal
    shellWidthFt: doublePrecision('shell_width_ft').notNull(),
    // @classification: Internal
    shellDepthFt: doublePrecision('shell_depth_ft').notNull(),
    /** { rooms, units } — see the web app's `_engine/facility-layout.ts`. */
    // @classification: Internal
    layout: jsonb('layout').notNull().default({}),
    // @classification: Internal
    createdBy: text('created_by'),
    // @classification: Internal
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('farm_facility_layouts_key_idx').on(t.scenarioKey, t.buildPhase, t.version)],
);

export type FarmFacilityLayoutRow = typeof farmFacilityLayouts.$inferSelect;

/**
 * The packaging library (Roadmap N1, 0059): what a unit leaves the farm in —
 * containers, lids, labels — each a unit cost on the unit. Not packaging
 * equipment, which is capital in `farmEquipment`.
 */
export const farmPackages = farmSchema.table(
  'packages',
  {
  workspaceId: uuid('workspace_id').notNull().default(CURRENT_WORKSPACE),
    // @classification: Internal
    id: uuid('id').primaryKey().defaultRandom(),
    // @classification: Internal
    name: text('name').notNull(),
    /** Channel numbers the package is used on. */
    // @classification: Internal
    channels: jsonb('channels').$type<number[]>().notNull().default([]),
    /** 'hot' | 'cold'; null = not set. */
    // @classification: Internal
    temperature: text('temperature'),
    // @classification: Internal
    material: text('material'),
    // @classification: Internal
    sizeValue: doublePrecision('size_value'),
    // @classification: Internal
    sizeUnit: text('size_unit'),
    // @classification: Internal
    endOfUse: text('end_of_use'),
    /** 1 is first; null = not ranked. */
    // @classification: Internal
    endOfUseRank: integer('end_of_use_rank'),
    /** Dollars per unit. */
    // @classification: Confidential
    manualUnitCost: doublePrecision('manual_unit_cost'),
    // @classification: Internal
    supplierItemId: uuid('supplier_item_id').references(() => farmSupplierItems.id, { onDelete: 'set null' }),
    // @classification: Internal
    supplierUnitsPerPack: doublePrecision('supplier_units_per_pack').notNull().default(1),
    // @classification: Internal
    notes: text('notes'),
    /** 'seed' | 'user_built' */
    // @classification: Internal
    source: text('source').notNull().default('user_built'),
    // @classification: Internal
    createdBy: text('created_by'),
    // @classification: Internal
    updatedBy: text('updated_by'),
    // @classification: Internal
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    // @classification: Internal
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('farm_packages_supplier_item_idx').on(t.supplierItemId)],
);

/** The packages a grow plan picks and how many per unit (Roadmap N1, 0059). */
export const farmGrowPlanPackages = farmSchema.table(
  'grow_plan_packages',
  {
  workspaceId: uuid('workspace_id').notNull().default(CURRENT_WORKSPACE),
    // @classification: Internal
    id: uuid('id').primaryKey().defaultRandom(),
    // @classification: Internal
    growPlanId: uuid('grow_plan_id')
      .notNull()
      .references(() => farmGrowPlans.id, { onDelete: 'cascade' }),
    // @classification: Internal
    packageId: uuid('package_id')
      .notNull()
      .references(() => farmPackages.id, { onDelete: 'restrict' }),
    // @classification: Internal
    qtyPerUnit: doublePrecision('qty_per_unit').notNull().default(1),
    // @classification: Internal
    createdBy: text('created_by'),
    // @classification: Internal
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('farm_grow_plan_packages_unique').on(t.growPlanId, t.packageId), index('farm_grow_plan_packages_package_idx').on(t.packageId)],
);

/**
 * Pay periods closed in Staffing (Roadmap O1, 0060): totals by account and
 * hours, never an individual's pay. The actuals ledger accrues and pays payroll
 * from these.
 */
export const farmPayrollPeriods = farmSchema.table(
  'payroll_periods',
  {
  workspaceId: uuid('workspace_id').notNull().default(CURRENT_WORKSPACE),
    // @classification: Internal
    id: uuid('id').primaryKey().defaultRandom(),
    // @classification: Internal
    staffingRef: text('staffing_ref').notNull(),
    // @classification: Internal
    periodStart: date('period_start').notNull(),
    // @classification: Internal
    periodEnd: date('period_end').notNull(),
    // @classification: Internal
    payDate: date('pay_date').notNull(),
    // @classification: Confidential
    wagesCents: integer('wages_cents').notNull(),
    // @classification: Confidential
    payrollTaxesCents: integer('payroll_taxes_cents').notNull(),
    // @classification: Confidential
    workersCompCents: integer('workers_comp_cents').notNull(),
    // @classification: Confidential
    benefitsCents: integer('benefits_cents').notNull(),
    // @classification: Internal
    regularHours: doublePrecision('regular_hours').notNull().default(0),
    // @classification: Internal
    overtimeHours: doublePrecision('overtime_hours').notNull().default(0),
    // @classification: Internal
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('farm_payroll_periods_pay_date_idx').on(t.payDate)],
);

export type FarmPayrollPeriodRow = typeof farmPayrollPeriods.$inferSelect;

/**
 * Time studies per grow plan (Roadmap O2, 0061): one sowing's tasks timed, with a
 * quality result. The average of the approved studies is the grow plan's labor standard. No wage.
 */
export const farmTimeStudies = farmSchema.table(
  'time_studies',
  {
  workspaceId: uuid('workspace_id').notNull().default(CURRENT_WORKSPACE),
    // @classification: Internal
    id: uuid('id').primaryKey().defaultRandom(),
    // @classification: Internal
    growPlanId: uuid('grow_plan_id')
      .notNull()
      .references(() => farmGrowPlans.id, { onDelete: 'cascade' }),
    /** Null only on a study recorded without a date (the seeded estimate). */
    // @classification: Internal
    studiedOn: date('studied_on'),
    // @classification: Internal
    sowingSize: integer('sowing_size').notNull(),
    /** Days a tray of the sowing studied was on its grow unit (0004): what the daily lines multiply by. */
    // @classification: Internal
    cycleDays: integer('cycle_days').notNull().default(0),
    // @classification: Internal
    observer: text('observer'),
    /** 'pass' | 'hold' | 'fail'; null = not recorded. */
    // @classification: Internal
    qualityResult: text('quality_result'),
    // @classification: Internal
    qualityNotes: text('quality_notes'),
    /** When the study was approved; every approved study averages into the plan's standard (0013). */
    // @classification: Internal
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    // @classification: Internal
    approvedBy: text('approved_by'),
    /** The water and supplements applied to the studied sowing (0013): { water: [...], supplements: [...] }. */
    // @classification: Internal
    consumption: jsonb('consumption').notNull().default({ water: [], supplements: [] }),
    /** 'seed' | 'user_built' */
    // @classification: Internal
    source: text('source').notNull().default('user_built'),
    /** 'estimated' | 'observed' (0064). Estimated rows stand in until the grow plan's first observed study. */
    // @classification: Internal
    basis: text('basis').notNull().default('observed'),
    // @classification: Internal
    createdBy: text('created_by'),
    // @classification: Internal
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('farm_time_studies_grow_plan_idx').on(t.growPlanId, t.studiedOn)],
);

/** The task lines of a time study (Roadmap O2, 0061). */
export const farmTimeStudyLines = farmSchema.table(
  'time_study_lines',
  {
  workspaceId: uuid('workspace_id').notNull().default(CURRENT_WORKSPACE),
    // @classification: Internal
    id: uuid('id').primaryKey().defaultRandom(),
    // @classification: Internal
    studyId: uuid('study_id')
      .notNull()
      .references(() => farmTimeStudies.id, { onDelete: 'cascade' }),
    // @classification: Internal
    position: integer('position').notNull().default(0),
    // @classification: Internal
    task: text('task').notNull(),
    // @classification: Internal
    station: text('station'),
    // @classification: Internal
    staff: integer('staff').notNull().default(1),
    // @classification: Internal
    elapsedMinutes: doublePrecision('elapsed_minutes').notNull().default(0),
    // @classification: Internal
    laborMinutes: doublePrecision('labor_minutes').notNull().default(0),
    /** 'fixed' | 'variable' */
    // @classification: Internal
    scalesWith: text('scales_with').notNull(),
    /** 'sowing' | 'daily' | 'harvest' (0004): per sowing on the sow day, per tray per day on the shelf, per unit on the distribution day. */
    // @classification: Internal
    stream: text('stream').notNull().default('sowing'),
  },
  (t) => [index('farm_time_study_lines_study_idx').on(t.studyId, t.position)],
);

/** The re-study interval per grow plan, in days (Roadmap O2, 0061). */
export const farmTimeStudyIntervals = farmSchema.table('time_study_intervals', {
  workspaceId: uuid('workspace_id').notNull().default(CURRENT_WORKSPACE),
  // @classification: Internal
  growPlanId: uuid('grow_plan_id')
    .primaryKey()
    .references(() => farmGrowPlans.id, { onDelete: 'cascade' }),
  // @classification: Internal
  intervalDays: integer('interval_days').notNull(),
  // @classification: Internal
  updatedBy: text('updated_by'),
  // @classification: Internal
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type FarmTimeStudyRow = typeof farmTimeStudies.$inferSelect;
export type FarmPackageRow = typeof farmPackages.$inferSelect;
export type FarmGrowPlanPackageRow = typeof farmGrowPlanPackages.$inferSelect;

/**
 * Sustainability records (Roadmap N6 slice 4, 0072): one row per utility bill, lab
 * sample or grease-trap inspection. Actual reads these for the reporting year; Plan
 * runs the scenario's typed quantities.
 */
export const farmSustainabilityReadings = farmSchema.table(
  'sustainability_readings',
  {
  workspaceId: uuid('workspace_id').notNull().default(CURRENT_WORKSPACE),
    // @classification: Internal
    id: uuid('id').primaryKey().defaultRandom(),
    // @classification: Internal
    metric: text('metric').notNull(),
    // @classification: Internal
    periodStart: date('period_start'),
    // @classification: Internal
    readOn: date('read_on').notNull(),
    // @classification: Internal
    quantity: doublePrecision('quantity'),
    // @classification: Internal
    sourceId: uuid('source_id').references(() => farmSources.id, { onDelete: 'set null' }),
    // @classification: Internal
    notes: text('notes'),
    // @classification: Internal
    recordedBy: text('recorded_by'),
    // @classification: Internal
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('farm_sustainability_readings_metric_idx').on(t.metric, t.readOn)],
);

/** Refrigerant added at service (0072), keyed by the equipment library's `key`. A fact: Actual only. */
export const farmRefrigerantService = farmSchema.table(
  'refrigerant_service',
  {
  workspaceId: uuid('workspace_id').notNull().default(CURRENT_WORKSPACE),
    // @classification: Internal
    id: uuid('id').primaryKey().defaultRandom(),
    // @classification: Internal
    equipmentKey: text('equipment_key').notNull(),
    // @classification: Internal
    servicedOn: date('serviced_on').notNull(),
    // @classification: Internal
    lbAdded: doublePrecision('lb_added').notNull(),
    // @classification: Internal
    sourceId: uuid('source_id').references(() => farmSources.id, { onDelete: 'set null' }),
    // @classification: Internal
    technician: text('technician'),
    // @classification: Internal
    notes: text('notes'),
    // @classification: Internal
    recordedBy: text('recorded_by'),
    // @classification: Internal
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('farm_refrigerant_service_key_idx').on(t.equipmentKey, t.servicedOn)],
);

export type FarmSustainabilityReadingRow = typeof farmSustainabilityReadings.$inferSelect;
export type FarmRefrigerantServiceRow = typeof farmRefrigerantService.$inferSelect;

/** The Nutrients & Supplements library (0012): what a grow plan's nutrient line names, each figure a tagged document. */
export const farmNutrients = farmSchema.table(
  'nutrients',
  {
  workspaceId: uuid('workspace_id').notNull().default(CURRENT_WORKSPACE),
    // @classification: Internal
    id: uuid('id').primaryKey().defaultRandom(),
    /** The key a nutrient line names; unique in the workspace. */
    // @classification: Internal
    key: text('key').notNull(),
    // @classification: Internal
    position: integer('position').notNull().default(0),
    // @classification: Internal
    name: text('name').notNull(),
    /** Tagged: ml of concentrate per gallon of water at the default strength. */
    // @classification: Internal
    mlPerGal: jsonb('ml_per_gal').notNull(),
    /** Tagged: dollars per ml. */
    // @classification: Confidential
    costPerMl: jsonb('cost_per_ml').notNull(),
    /** Tagged, or null where the solution is not managed to a target. */
    // @classification: Internal
    ecTarget: jsonb('ec_target'),
    // @classification: Internal
    phTarget: jsonb('ph_target'),
    /** { effect, rows } or null. */
    // @classification: Internal
    elicits: jsonb('elicits'),
    // @classification: Internal
    note: text('note').notNull().default(''),
    /** 'seed' | 'user_built' */
    // @classification: Internal
    source: text('source').notNull().default('user_built'),
    // @classification: Internal
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    // @classification: Internal
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('farm_nutrients_unique_key').on(t.workspaceId, t.key)],
);

export type FarmNutrientRow = typeof farmNutrients.$inferSelect;

/** The Media library (migration 0015): one row per growing medium a grow plan's medium line names. */
export const farmMedia = farmSchema.table(
  'media',
  {
  workspaceId: uuid('workspace_id').notNull().default(CURRENT_WORKSPACE),
    // @classification: Internal
    id: uuid('id').primaryKey().defaultRandom(),
    /** The key a medium line names; unique in the workspace. */
    // @classification: Internal
    key: text('key').notNull(),
    // @classification: Internal
    position: integer('position').notNull().default(0),
    // @classification: Internal
    name: text('name').notNull(),
    /** 'loose' | 'mat' | 'none' */
    // @classification: Internal
    form: text('form').notNull(),
    /** 'gal' | 'each' | 'none' */
    // @classification: Internal
    unit: text('unit').notNull(),
    /** Tagged: how much one 1020 tray takes, in the unit. */
    // @classification: Internal
    qtyPer1020: jsonb('qty_per_1020').notNull(),
    /** Tagged: dollars per unit. */
    // @classification: Confidential
    costPerUnit: jsonb('cost_per_unit').notNull(),
    /** { ph?, porosity?, note } */
    // @classification: Internal
    traits: jsonb('traits').notNull().default({}),
    /** Science library rows behind the traits. */
    // @classification: Internal
    rows: jsonb('rows').notNull().default([]),
    /** 'seed' | 'user_built' */
    // @classification: Internal
    source: text('source').notNull().default('user_built'),
    // @classification: Internal
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    // @classification: Internal
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('farm_media_unique_key').on(t.workspaceId, t.key)],
);

export type FarmMediumRow = typeof farmMedia.$inferSelect;

/** Experiments in R&D (migration 0016): a titled run of a developing grow plan, closed when a sowing record names it. */
export const farmExperiments = farmSchema.table(
  'experiments',
  {
  workspaceId: uuid('workspace_id').notNull().default(CURRENT_WORKSPACE),
    // @classification: Internal
    id: uuid('id').primaryKey().defaultRandom(),
    // @classification: Internal
    title: text('title').notNull(),
    // @classification: Internal
    growPlanCode: text('grow_plan_code').notNull(),
    // @classification: Internal
    sowDate: date('sow_date').notNull(),
    // @classification: Internal
    trays: doublePrecision('trays').notNull(),
    // @classification: Internal
    note: text('note'),
    // @classification: Internal
    createdBy: text('created_by'),
    // @classification: Internal
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    // @classification: Internal
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('farm_experiments_plan_idx').on(t.growPlanCode)],
);

export type FarmExperimentRow = typeof farmExperiments.$inferSelect;

/** Subscriptions (migration 0019): a subscriber's standing order at one pickup point, on a cadence, with a dated flat plan. */
export const farmSubscriptions = farmSchema.table(
  'subscriptions',
  {
  workspaceId: uuid('workspace_id').notNull().default(CURRENT_WORKSPACE),
    // @classification: Internal
    id: uuid('id').primaryKey().defaultRandom(),
    // @classification: Internal
    subscriberId: uuid('subscriber_id').notNull(),
    // @classification: Internal
    subscriberPickupPointId: uuid('subscriber_pickup_point_id').notNull(),
    /** 'weekly' | 'biweekly' | 'monthly' */
    // @classification: Internal
    cadence: text('cadence').notNull(),
    /** The first distribution: its weekday, and for a monthly subscription its week of the month, are the cadence's. */
    // @classification: Internal
    startDate: date('start_date').notNull(),
    // @classification: Internal
    endDate: date('end_date'),
    /** FlatPlanVersion[]: what each distribution carries, from a distribution date on. */
    // @classification: Internal
    flatPlan: jsonb('flat_plan').notNull().default([]),
    /** Distribution dates skipped. */
    // @classification: Internal
    skips: jsonb('skips').notNull().default([]),
    /** Paused from this distribution date until resumed; null = running. */
    // @classification: Internal
    pausedFrom: date('paused_from'),
    // @classification: Internal
    notes: text('notes'),
    // @classification: Internal
    createdBy: text('created_by'),
    // @classification: Internal
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    // @classification: Internal
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('farm_subscriptions_subscriber_idx').on(t.subscriberId)],
);

export type FarmSubscriptionRow = typeof farmSubscriptions.$inferSelect;

/**
 * The Client Portal's sign-in index (0025): one email, one subscriber record, across every farm. Kept by
 * a trigger on subscribers; read at sign-in before any workspace is in scope, so it carries no policy
 * and holds ids and the email only.
 */
export const farmPortalEmails = farmSchema.table('portal_emails', {
  // @classification: Confidential
  email: text('email').primaryKey(),
  // @classification: Internal
  workspaceId: uuid('workspace_id').notNull(),
  // @classification: Internal
  subscriberId: uuid('subscriber_id').notNull().unique(),
});

/** An external sign-in linked to its subscriber record (0025): one sign-in per account, one account per record. No policy: read before a scope exists. */
export const farmPortalAccounts = farmSchema.table('portal_accounts', {
  // @classification: Internal
  clerkUserId: text('clerk_user_id').primaryKey(),
  // @classification: Internal
  workspaceId: uuid('workspace_id').notNull(),
  // @classification: Internal
  subscriberId: uuid('subscriber_id').notNull().unique(),
  // @classification: Confidential
  email: text('email').notNull(),
  // @classification: Internal
  linkedAt: timestamp('linked_at', { withTimezone: true }).notNull().defaultNow(),
});
export type FarmPortalAccountRow = typeof farmPortalAccounts.$inferSelect;

/** A flat plan change a client asks for (0025), reviewed by staff; approval applies it from the first distribution not yet sown. */
export const farmFlatPlanRequests = farmSchema.table(
  'flat_plan_requests',
  {
  workspaceId: uuid('workspace_id').notNull().default(CURRENT_WORKSPACE),
    // @classification: Internal
    id: uuid('id').primaryKey().defaultRandom(),
    // @classification: Internal
    subscriptionId: uuid('subscription_id').notNull(),
    // @classification: Internal
    subscriberId: uuid('subscriber_id').notNull(),
    /** FlatPlanLine[]: what the client asks each distribution to carry. */
    // @classification: Internal
    lines: jsonb('lines').notNull().default([]),
    // @classification: Internal
    note: text('note'),
    /** 'pending' | 'approved' | 'declined' | 'withdrawn' */
    // @classification: Internal
    status: text('status').notNull().default('pending'),
    // @classification: Internal
    requestedBy: text('requested_by'),
    // @classification: Internal
    requestedAt: timestamp('requested_at', { withTimezone: true }).notNull().defaultNow(),
    // @classification: Internal
    decidedBy: text('decided_by'),
    // @classification: Internal
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    // @classification: Internal
    decisionNote: text('decision_note'),
    /** Set on approval: the first distribution the new lines are sown for. */
    // @classification: Internal
    effectiveFrom: date('effective_from'),
  },
  (t) => [index('farm_flat_plan_requests_status_idx').on(t.status, t.requestedAt)],
);
export type FarmFlatPlanRequestRow = typeof farmFlatPlanRequests.$inferSelect;
