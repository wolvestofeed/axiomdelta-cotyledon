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
  text,
  timestamp,
  uuid,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';

/**
 * Impact OS — the isolated `muse` Postgres schema.
 *
 * Deliberately separate from CompTable's `public` schema (docs/muse/CLAUDE.md
 * §8). This is the first `pgSchema` in the repo; Drizzle qualifies every query
 * as `"muse"."<table>"`, so it works regardless of the connection search_path.
 *
 * Migrations: packages/db/drizzle/0043_muse_scenarios.sql,
 * 0044_muse_sources.sql, 0045_muse_supplier_lca_options.sql,
 * 0046_muse_entity_links.sql, 0047_muse_supplier_catalog_and_pos.sql,
 * 0048_muse_actuals.sql, 0049_muse_recipes.sql, 0050_muse_customers.sql,
 * 0051_muse_orders.sql, 0052_muse_delivery_handoff.sql, 0053_muse_batch_crew.sql,
 * 0054_muse_periods.sql, 0055_muse_closure_kinds.sql, 0056_muse_standard_versions.sql,
 * 0057_muse_working_capital.sql, 0058_muse_equipment.sql, 0059_muse_packaging.sql, 0076_muse_facility_footprints.sql,
 * 0060_muse_hr_no_pay.sql, 0061_muse_time_studies.sql, 0064_muse_time_study_basis.sql,
 * 0065_muse_batch_basis.sql.
 */
export const museSchema = pgSchema('muse');

/**
 * A saved Muse scenario. `config` is a JSONB overlay of edited values over the
 * plan-data defaults (the `MuseScenarioConfig` shape in the Muse `_engine`);
 * every dollar is recomputed from defaults + overlay, never stored. `ownerTier`
 * freezes the creator's tier at save time so a later tier change can't retro-
 * actively reclassify a row.
 */
export const museScenarios = museSchema.table(
  'scenarios',
  {
    // @classification: Internal
    id: uuid('id').primaryKey().defaultRandom(),
    /** Operator free-text name. */
    // @classification: Confidential
    label: text('label').notNull(),
    /** 'user_built' | 'seed' | 'imported'. */
    // @classification: Internal
    source: text('source').notNull().default('user_built'),
    /** MuseScenarioConfig overlay (sectioned partial of editable inputs). */
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
    index('muse_scenarios_owner_idx').on(t.ownerUserId),
    index('muse_scenarios_created_idx').on(t.createdAt),
  ],
);

/**
 * Singleton (id = 'default'). `activeScenarioId` is THE live master state the
 * platform loads every session. Only a super admin's Apply moves this pointer.
 * Null until the first Apply — the app falls back to plan-data defaults.
 */
export const museWorkspaceState = museSchema.table('workspace_state', {
  // @classification: Internal
  id: text('id').primaryKey().default('default'),
  // @classification: Internal
  activeScenarioId: uuid('active_scenario_id').references(
    () => museScenarios.id,
    { onDelete: 'set null' },
  ),
  // @classification: Internal
  appliedAt: timestamp('applied_at', { withTimezone: true }),
  // @classification: Internal
  appliedBy: text('applied_by'),
});

export type MuseScenarioRow = typeof museScenarios.$inferSelect;
export type MuseScenarioInsert = typeof museScenarios.$inferInsert;
export type MuseWorkspaceStateRow = typeof museWorkspaceState.$inferSelect;

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
 * URL-only sources. Migration: 0044_muse_sources.sql.
 */
export const museSources = museSchema.table(
  'sources',
  {
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
  (t) => [index('muse_sources_kind_idx').on(t.kind)],
);

/**
 * A figure drawn from a source. `provenanceId` is the factor library's stable
 * id, so a cited number resolves to this row and from here to the document.
 */
export const museSourceFigures = museSchema.table(
  'source_figures',
  {
    // @classification: Internal
    id: uuid('id').primaryKey().defaultRandom(),
    // @classification: Internal
    sourceId: uuid('source_id')
      .notNull()
      .references(() => museSources.id, { onDelete: 'cascade' }),
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
  (t) => [index('muse_source_figures_source_idx').on(t.sourceId)],
);

export type MuseSourceRow = typeof museSources.$inferSelect;
export type MuseSourceInsert = typeof museSources.$inferInsert;
export type MuseSourceFigureRow = typeof museSourceFigures.$inferSelect;
export type MuseSourceFigureInsert = typeof museSourceFigures.$inferInsert;

// ── Supplier-specific LCA options (Sustainability S4) ───────────────────────

/**
 * A figure a specific supplier supplies for a specific recipe ingredient, with
 * the supplier's document registered in `muse.sources`. Appears as a
 * "supplier" option in the per-ingredient LCA basis selector.
 */
export const museSupplierLcaOptions = museSchema.table(
  'supplier_lca_options',
  {
    // @classification: Internal
    id: uuid('id').primaryKey().defaultRandom(),
    /** Compiled directory operation id. */
    // @classification: Internal
    supplierId: text('supplier_id').notNull(),
    // @classification: Internal
    supplierName: text('supplier_name').notNull(),
    /** Recipe ingredient name. */
    // @classification: Internal
    ingredient: text('ingredient').notNull(),
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
    sourceId: uuid('source_id').references(() => museSources.id, { onDelete: 'set null' }),
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
    index('muse_supplier_lca_ingredient_idx').on(t.ingredient),
    index('muse_supplier_lca_supplier_idx').on(t.supplierId),
  ],
);

export type MuseSupplierLcaOptionRow = typeof museSupplierLcaOptions.$inferSelect;
export type MuseSupplierLcaOptionInsert = typeof museSupplierLcaOptions.$inferInsert;

// ── Entity links — facts of record (0046) ───────────────────────────────────

/**
 * A link between two records that is a FACT, not a forecast input: a lot was
 * received from an operation, a lot shipped to a site, a journal entry is
 * evidenced by an invoice, a role is assigned a course.
 *
 * Links that change a model input are NOT stored here — they live in the
 * `muse.scenarios` overlay, because they belong to a forecast. See
 * `_engine/entity-links.ts` for the rule.
 *
 * Both endpoints are kind-qualified free text: the records they name live in the
 * compiled supplier directory, the compiled school list, typed plan-data, and
 * `muse.sources`, so only some pairs could be enforced relationally and none is.
 */
export const museEntityLinks = museSchema.table(
  'entity_links',
  {
    // @classification: Internal
    id: uuid('id').primaryKey().defaultRandom(),
    /** 'lot' | 'ledger_entry' | 'role' | 'supplier' | 'site' | 'course' | 'source'. */
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
    index('muse_entity_links_from_idx').on(t.fromKind, t.fromId),
    index('muse_entity_links_to_idx').on(t.toKind, t.toId),
  ],
);

export type MuseEntityLinkRow = typeof museEntityLinks.$inferSelect;
export type MuseEntityLinkInsert = typeof museEntityLinks.$inferInsert;

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
export const museSupplierItems = museSchema.table(
  'supplier_items',
  {
    // @classification: Internal
    id: uuid('id').primaryKey().defaultRandom(),
    /** Compiled directory operation id. */
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
    /** The price sheet this line came from, registered in muse.sources. */
    // @classification: Internal
    sourceId: uuid('source_id').references(() => museSources.id, { onDelete: 'set null' }),
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
    index('muse_supplier_items_supplier_idx').on(t.supplierId),
    index('muse_supplier_items_item_idx').on(t.item),
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
export const museSupplierItemPrices = museSchema.table(
  'supplier_item_prices',
  {
    // @classification: Internal
    id: uuid('id').primaryKey().defaultRandom(),
    // @classification: Internal
    itemId: uuid('item_id')
      .notNull()
      .references(() => museSupplierItems.id, { onDelete: 'cascade' }),
    // @classification: Internal
    effectiveFrom: date('effective_from').notNull(),
    /** Dollars; may carry sub-cent precision. */
    // @classification: Confidential
    unitPrice: doublePrecision('unit_price'),
    /** What the price is per: 'lb' | 'case' | 'each' | 'dozen' | 'cwt'. */
    // @classification: Internal
    priceBasis: text('price_basis'),
    /** The price sheet or quote this figure came from, registered in muse.sources. */
    // @classification: Internal
    sourceId: uuid('source_id').references(() => museSources.id, { onDelete: 'set null' }),
    // @classification: Internal
    note: text('note'),
    // @classification: Internal
    createdBy: text('created_by'),
    // @classification: Internal
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('muse_supplier_item_prices_item_date_idx').on(t.itemId, t.effectiveFrom),
    index('muse_supplier_item_prices_item_idx').on(t.itemId, t.effectiveFrom),
  ],
);

/**
 * A loan (0068). The principal is TYPED, not derived from the capex it
 * finances: a loan may be for less than the schedule, or carry a deposit, and a
 * principal that silently tracked an equipment edit could express neither. The
 * capex total for the same `purpose` is reported beside it so a gap is visible.
 */
export const museLoans = museSchema.table(
  'loans',
  {
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
  (t) => [uniqueIndex('muse_loans_key_idx').on(t.key), index('muse_loans_position_idx').on(t.position)],
);

/**
 * A monthly fixed cost (0068). `treatment` is the accounting fact and is never
 * inferred from the label: manufacturing overhead absorbs into inventory on
 * normal capacity (ASC 330-10-30-1/-3), G&A is a period cost that
 * ASC 330-10-30-8 keeps out of it.
 */
export const museFixedCostLines = museSchema.table(
  'fixed_cost_lines',
  {
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
  (t) => [uniqueIndex('muse_fixed_cost_lines_key_idx').on(t.key), index('muse_fixed_cost_lines_position_idx').on(t.position)],
);

/**
 * A leasehold-improvement line (0069). `extendedCents` is the figure of record;
 * dollars per square foot are derived from it against the facility size.
 *
 * `counted` keeps a line ON RECORD but out of the arithmetic — a scope item the
 * landlord covers, or one deferred to a later fit-out, stays visible with its
 * figure rather than being deleted and forgotten.
 */
export const museLeaseholdLines = museSchema.table(
  'leasehold_lines',
  {
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
    uniqueIndex('muse_leasehold_lines_key_idx').on(t.key),
    index('muse_leasehold_lines_position_idx').on(t.position),
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
 * The file lives inline, like muse.sources. Select `fileBytes` only when
 * serving the file.
 */
export const museTrainingDocs = museSchema.table(
  'training_docs',
  {
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
  (t) => [uniqueIndex('muse_training_docs_key_version_idx').on(t.docKey, t.version)],
);

/**
 * One person's assignment to one VERSION of a training document (0070).
 * Completion is recorded against the version, so "read and acknowledged v1"
 * stays true after v2 publishes.
 */
export const museTrainingAssignments = museSchema.table(
  'training_assignments',
  {
    // @classification: Internal
    id: uuid('id').primaryKey().defaultRandom(),
    // @classification: Internal
    docId: uuid('doc_id')
      .notNull()
      .references(() => museTrainingDocs.id, { onDelete: 'cascade' }),
    // @classification: Confidential
    staffId: uuid('staff_id')
      .notNull()
      .references(() => museStaff.id, { onDelete: 'cascade' }),
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
    uniqueIndex('muse_training_assignments_doc_staff_idx').on(t.docId, t.staffId),
    index('muse_training_assignments_staff_idx').on(t.staffId),
  ],
);

export type MuseTrainingDocRow = typeof museTrainingDocs.$inferSelect;
export type MuseTrainingAssignmentRow = typeof museTrainingAssignments.$inferSelect;

export type MuseLeaseholdLineRow = typeof museLeaseholdLines.$inferSelect;
export type MuseLeaseholdLineInsert = typeof museLeaseholdLines.$inferInsert;

export type MuseLoanRow = typeof museLoans.$inferSelect;
export type MuseLoanInsert = typeof museLoans.$inferInsert;
export type MuseFixedCostLineRow = typeof museFixedCostLines.$inferSelect;
export type MuseFixedCostLineInsert = typeof museFixedCostLines.$inferInsert;

export type MuseSupplierItemPriceRow = typeof museSupplierItemPrices.$inferSelect;
export type MuseSupplierItemPriceInsert = typeof museSupplierItemPrices.$inferInsert;

/**
 * A purchase order we generated. A PO is a DOCUMENT: once issued it states what
 * was ordered at what price and must not change when the model behind it moves.
 * That is why its lines are written down — the deliberate exception to the
 * platform's "every dollar is computed" rule (docs/muse/CLAUDE.md §2 rule 4).
 *
 * `supplierName` is denormalised so an issued order still reads correctly if the
 * compiled directory is later refreshed.
 */
export const musePurchaseOrders = museSchema.table(
  'purchase_orders',
  {
    // @classification: Internal
    id: uuid('id').primaryKey().defaultRandom(),
    /** AMK-PO-YYYYMMDD-NN. */
    // @classification: Internal
    poNumber: text('po_number').notNull().unique(),
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
    index('muse_purchase_orders_supplier_idx').on(t.supplierId),
    index('muse_purchase_orders_status_idx').on(t.status),
    index('muse_purchase_orders_ordered_for_idx').on(t.orderedFor),
  ],
);

/** One ordered line. `ingredient` traces the line back to what drove it. */
export const musePurchaseOrderLines = museSchema.table(
  'purchase_order_lines',
  {
    // @classification: Internal
    id: uuid('id').primaryKey().defaultRandom(),
    // @classification: Internal
    poId: uuid('po_id')
      .notNull()
      .references(() => musePurchaseOrders.id, { onDelete: 'cascade' }),
    // @classification: Internal
    ingredient: text('ingredient').notNull(),
    /** The supplier's catalog line, when the ingredient matched one. */
    // @classification: Internal
    supplierItemId: uuid('supplier_item_id').references(() => museSupplierItems.id, {
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
  (t) => [index('muse_purchase_order_lines_po_idx').on(t.poId)],
);

export type MuseSupplierItemRow = typeof museSupplierItems.$inferSelect;
export type MuseSupplierItemInsert = typeof museSupplierItems.$inferInsert;
export type MusePurchaseOrderRow = typeof musePurchaseOrders.$inferSelect;
export type MusePurchaseOrderInsert = typeof musePurchaseOrders.$inferInsert;
export type MusePurchaseOrderLineRow = typeof musePurchaseOrderLines.$inferSelect;
export type MusePurchaseOrderLineInsert = typeof musePurchaseOrderLines.$inferInsert;

// ── Actuals — the recorded facts that replace forecast lines (0048) ─────────

/**
 * A closed production record: the ISA-95 production performance object the
 * ledger posts from (`BatchExecution` in the Muse engine). Weights, scrap with
 * reason codes, input lot codes and the CCP-2 cooling record are one JSONB
 * document because they are one physical event.
 */
export const museBatchRecords = museSchema.table(
  'batch_records',
  {
    // @classification: Internal
    id: uuid('id').primaryKey().defaultRandom(),
    /** Operator-visible batch id, e.g. B-260914-01. */
    // @classification: Internal
    batchId: text('batch_id').notNull().unique(),
    // @classification: Internal
    recipeCode: text('recipe_code').notNull(),
    // @classification: Internal
    productionDate: date('production_date').notNull(),
    /** The recipe standard in force on the production date. */
    // @classification: Internal
    standardVersion: text('standard_version').notNull(),
    // @classification: Internal
    plannedPortions: doublePrecision('planned_portions').notNull(),
    /** Base-portion equivalents that passed and were packed. */
    // @classification: Internal
    goodPortions: doublePrecision('good_portions').notNull(),
    /** Chiller batches the record covers. */
    // @classification: Internal
    batchesRun: integer('batches_run').notNull().default(1),
    /** Meals the portions became; null = one meal per portion. */
    // @classification: Internal
    mealsProduced: doublePrecision('meals_produced'),
    /** ComponentExecution[] — consumed lots, stage weights, scrap, cooling. */
    // @classification: Internal
    components: jsonb('components').notNull().default([]),
    /** CrewHoursLine[] — who worked the batch and for how long (0053). */
    // @classification: Confidential
    crew: jsonb('crew').notNull().default([]),
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
    // @classification: Internal
    createdBy: text('created_by'),
    // @classification: Internal
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    // @classification: Internal
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('muse_batch_records_date_idx').on(t.productionDate)],
);

/** Goods received, with the lot code assigned on receipt and the invoice price. */
export const museReceipts = museSchema.table(
  'receipts',
  {
    // @classification: Internal
    id: uuid('id').primaryKey().defaultRandom(),
    // @classification: Internal
    poId: uuid('po_id').references(() => musePurchaseOrders.id, { onDelete: 'set null' }),
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
    /** [{ ingredient, qty, unit, lotCode, unitPriceCents }] */
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
  (t) => [index('muse_receipts_date_idx').on(t.receivedOn), index('muse_receipts_po_idx').on(t.poId)],
);

/** Meals delivered by channel, site and date at the price charged. */
export const museDeliveries = museSchema.table(
  'deliveries',
  {
    // @classification: Internal
    id: uuid('id').primaryKey().defaultRandom(),
    // @classification: Internal
    deliveredOn: date('delivered_on').notNull(),
    /** 1 school, 2 corporate catering, 3 ghost kitchen / retail. */
    // @classification: Internal
    phase: integer('phase').notNull(),
    // @classification: Internal
    siteId: text('site_id'),
    // @classification: Internal
    siteName: text('site_name'),
    // @classification: Internal
    meals: doublePrecision('meals').notNull(),
    // @classification: Confidential
    pricePerMealCents: integer('price_per_meal_cents').notNull(),
    /** Finished-goods lot codes shipped. */
    // @classification: Internal
    lotCodes: jsonb('lot_codes').notNull().default([]),
    // @classification: Internal
    deliveredBy: text('delivered_by'),
    /** Product temperature at hand-off, °F (0052, Roadmap I4). */
    // @classification: Internal
    handoffTempF: doublePrecision('handoff_temp_f'),
    /** Who signed for it at the site (0052). */
    // @classification: Internal
    receivedBy: text('received_by'),
    /** The customer the meals were delivered to, when recorded against an order (0057). */
    // @classification: Internal
    customerId: uuid('customer_id').references(() => museCustomers.id, { onDelete: 'set null' }),
    /** The monthly invoice the delivery's route was added to (0057). */
    // @classification: Internal
    invoiceId: uuid('invoice_id').references(() => museInvoices.id, { onDelete: 'set null' }),
    /** When the route carrying this delivery was completed (0057). */
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
    index('muse_deliveries_date_idx').on(t.deliveredOn),
    index('muse_deliveries_phase_idx').on(t.phase),
    index('muse_deliveries_invoice_idx').on(t.invoiceId),
    index('muse_deliveries_customer_idx').on(t.customerId),
  ],
);

/** Occupancy, utilities, admin and other period costs by month. */
export const musePeriodBills = museSchema.table(
  'period_bills',
  {
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
    sourceId: uuid('source_id').references(() => museSources.id, { onDelete: 'set null' }),
    // @classification: Internal
    notes: text('notes'),
    // @classification: Internal
    createdBy: text('created_by'),
    // @classification: Internal
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('muse_period_bills_period_idx').on(t.period)],
);

/**
 * A fiscal period (YYYY-MM; fiscal year = calendar year) that has been locked
 * at least once. No row = open. A locked period refuses postings; a super
 * admin may reopen it; both events are on the posting log (Roadmap J3).
 */
export const museFiscalPeriods = museSchema.table('fiscal_periods', {
  // @classification: Internal
  period: text('period').primaryKey(),
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
});

/** Dated ranges the kitchen does not produce or deliver: major holidays; the kitchen runs year-round (Roadmap J1). */
export const museCalendarClosures = museSchema.table(
  'calendar_closures',
  {
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
  (t) => [index('muse_calendar_closures_dates_idx').on(t.startDate, t.endDate)],
);

/**
 * The append-only, hash-chained posting trail (Roadmap J4): who posted what
 * from which record, and every period lock and reopen. `hash` is SHA-256 over
 * the previous row's hash and this row's canonical fields; a trigger refuses
 * UPDATE and DELETE.
 */
export const musePostingLog = museSchema.table(
  'posting_log',
  {
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
  (t) => [index('muse_posting_log_period_idx').on(t.period)],
);

/**
 * An approved standard-cost version (Roadmap J5): the recipe as resolved on
 * the plan of record plus the cost assumptions, frozen with an effective date.
 * The ledger costs a batch at the version in force on its production date.
 */
export const museStandardVersions = museSchema.table(
  'standard_versions',
  {
    // @classification: Internal
    id: uuid('id').primaryKey().defaultRandom(),
    // @classification: Internal
    recipeCode: text('recipe_code').notNull(),
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
    /** StandardSnapshot — { recipe: RecipeDef, assumptions }. */
    // @classification: Confidential
    snapshot: jsonb('snapshot').notNull(),
  },
  (t) => [index('muse_standard_versions_code_date_idx').on(t.recipeCode, t.effectiveFrom)],
);

export type MuseBatchRecordRow = typeof museBatchRecords.$inferSelect;
export type MuseBatchRecordInsert = typeof museBatchRecords.$inferInsert;
export type MuseReceiptRow = typeof museReceipts.$inferSelect;
export type MuseReceiptInsert = typeof museReceipts.$inferInsert;
export type MuseDeliveryRow = typeof museDeliveries.$inferSelect;
export type MuseDeliveryInsert = typeof museDeliveries.$inferInsert;
export type MusePeriodBillRow = typeof musePeriodBills.$inferSelect;
export type MusePeriodBillInsert = typeof musePeriodBills.$inferInsert;

// ── Recipe library (0049) ───────────────────────────────────────────────────

/**
 * A library recipe: the item master's finished goods. Status is
 * 'in_service' | 'planned' | 'developing'; `channels` are the expansion phases
 * it serves. The code constant in the web app is the seed row, not the source.
 */
export const museRecipes = museSchema.table(
  'recipes',
  {
    // @classification: Internal
    id: uuid('id').primaryKey().defaultRandom(),
    // @classification: Internal
    code: text('code').notNull().unique(),
    // @classification: Internal
    name: text('name').notNull(),
    // @classification: Internal
    category: text('category').notNull().default(''),
    // @classification: Internal
    status: text('status').notNull().default('developing'),
    /** Expansion phases served, e.g. [1] or [2, 3]. */
    // @classification: Internal
    channels: jsonb('channels').notNull().default([]),
    // @classification: Internal
    components: text('components').notNull().default(''),
    // @classification: Internal
    productionMethod: text('production_method').notNull().default(''),
    // @classification: Internal
    allergensPresent: text('allergens_present').notNull().default(''),
    // @classification: Internal
    allergenFreeClaims: text('allergen_free_claims').notNull().default(''),
    /** The portions the ingredient quantities are written for (0065). The production batch is derived. */
    // @classification: Internal
    batchPortions: integer('batch_portions').notNull().default(100),
    /** The portion spec block, tagged values, as the engine reads it. */
    // @classification: Internal
    spec: jsonb('spec').notNull().default({}),
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
  (t) => [index('muse_recipes_status_idx').on(t.status)],
);

/** One ingredient line; `line` is the engine's IngredientLine document. */
export const museRecipeLines = museSchema.table(
  'recipe_lines',
  {
    // @classification: Internal
    id: uuid('id').primaryKey().defaultRandom(),
    // @classification: Internal
    recipeId: uuid('recipe_id')
      .notNull()
      .references(() => museRecipes.id, { onDelete: 'cascade' }),
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
  (t) => [index('muse_recipe_lines_recipe_idx').on(t.recipeId, t.position)],
);

export type MuseRecipeRow = typeof museRecipes.$inferSelect;
export type MuseRecipeInsert = typeof museRecipes.$inferInsert;
export type MuseRecipeLineRow = typeof museRecipeLines.$inferSelect;
export type MuseRecipeLineInsert = typeof museRecipeLines.$inferInsert;

// ── Customers and sites (0050) ──────────────────────────────────────────────

/** A district, company or marketplace on one expansion phase. */
export const museCustomers = museSchema.table(
  'customers',
  {
    // @classification: Internal
    id: uuid('id').primaryKey().defaultRandom(),
    // @classification: Confidential
    name: text('name').notNull(),
    /** 'district' | 'company' | 'marketplace' | 'other' */
    // @classification: Internal
    kind: text('kind').notNull().default('other'),
    // @classification: Internal
    channel: integer('channel').notNull(),
    /** 'prospect' | 'contracted' | 'forecast' | 'inactive' — 'forecast' is a Forecast Customer, never on Actual (0071). */
    // @classification: Internal
    status: text('status').notNull().default('prospect'),
    /** Null = the channel's default price. */
    // @classification: Confidential
    pricePerMealCents: integer('price_per_meal_cents'),
    // @classification: Internal
    contractStart: date('contract_start'),
    // @classification: Internal
    contractEnd: date('contract_end'),
    // @classification: Internal
    schoolId: text('school_id'),
    /** 'due_on_receipt' | 'net_15' | 'net_30'; null = not set, no default (0057). */
    // @classification: Internal
    paymentTerms: text('payment_terms'),
    /** ERRA rating Muse Kitchen assigns (0073): 'rated' | 'in_review' | 'not_rated'; null = not rated. */
    // @classification: Internal
    erraStatus: text('erra_status'),
    // @classification: Internal
    erraStars: integer('erra_stars'),
    // @classification: Internal
    erraRatedOn: date('erra_rated_on'),
    // @classification: Internal
    notes: text('notes'),
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
  (t) => [index('muse_customers_channel_idx').on(t.channel)],
);

/** Where a customer is served, with the site's own participation forecast. */
export const museCustomerSites = museSchema.table(
  'customer_sites',
  {
    // @classification: Internal
    id: uuid('id').primaryKey().defaultRandom(),
    // @classification: Internal
    customerId: uuid('customer_id')
      .notNull()
      .references(() => museCustomers.id, { onDelete: 'cascade' }),
    /** Delivery site id (Sites & Delivery) when linked. */
    // @classification: Internal
    siteId: text('site_id'),
    // @classification: Confidential
    name: text('name').notNull(),
    // @classification: Internal
    gradeGroups: jsonb('grade_groups').notNull().default([]),
    // @classification: Internal
    serviceDaysPerYear: integer('service_days_per_year').notNull().default(180),
    // @classification: Confidential
    enrollment: integer('enrollment'),
    // @classification: Confidential
    participationRate: doublePrecision('participation_rate'),
    // @classification: Confidential
    expectedMealsPerDay: doublePrecision('expected_meals_per_day'),
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
  (t) => [index('muse_customer_sites_customer_idx').on(t.customerId), index('muse_customer_sites_site_idx').on(t.siteId)],
);

/**
 * One service at a site: one loading and dispatch/delivery of an order (0071,
 * Roadmap N4a). Two services in a day are two orders.
 */
export const museCustomerServices = museSchema.table(
  'customer_services',
  {
    // @classification: Internal
    id: uuid('id').primaryKey().defaultRandom(),
    // @classification: Internal
    customerSiteId: uuid('customer_site_id')
      .notNull()
      .references(() => museCustomerSites.id, { onDelete: 'cascade' }),
    // @classification: Internal
    name: text('name').notNull(),
    /** e.g. [1,2,3,4,5]; 0 = Sunday. */
    // @classification: Internal
    weekdays: jsonb('weekdays').notNull().default([1, 2, 3, 4, 5]),
    /** 'active' | 'inactive' */
    // @classification: Internal
    status: text('status').notNull().default('active'),
    // @classification: Internal
    position: integer('position').notNull().default(0),
    // @classification: Internal
    notes: text('notes'),
    // @classification: Internal
    createdBy: text('created_by'),
    // @classification: Internal
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    // @classification: Internal
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('muse_customer_services_site_idx').on(t.customerSiteId)],
);

/** Meals per service from a date, carrying forward until the next pick (0071). */
export const museServiceVolumePicks = museSchema.table(
  'service_volume_picks',
  {
    // @classification: Internal
    id: uuid('id').primaryKey().defaultRandom(),
    // @classification: Internal
    serviceId: uuid('service_id')
      .notNull()
      .references(() => museCustomerServices.id, { onDelete: 'cascade' }),
    // @classification: Internal
    effectiveDate: date('effective_date').notNull(),
    // @classification: Confidential
    meals: doublePrecision('meals').notNull(),
    // @classification: Internal
    notes: text('notes'),
    // @classification: Internal
    createdBy: text('created_by'),
    // @classification: Internal
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    // @classification: Internal
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('service_volume_picks_service_id_effective_date_key').on(t.serviceId, t.effectiveDate)],
);

/** A site's service calendar: terms it takes meals in and breaks inside them (0071). */
export const museSiteCalendarRanges = museSchema.table(
  'site_calendar_ranges',
  {
    // @classification: Internal
    id: uuid('id').primaryKey().defaultRandom(),
    // @classification: Internal
    customerSiteId: uuid('customer_site_id')
      .notNull()
      .references(() => museCustomerSites.id, { onDelete: 'cascade' }),
    /** 'term' | 'break' */
    // @classification: Internal
    kind: text('kind').notNull(),
    // @classification: Internal
    label: text('label'),
    // @classification: Internal
    startDate: date('start_date').notNull(),
    // @classification: Internal
    endDate: date('end_date').notNull(),
    // @classification: Internal
    createdBy: text('created_by'),
    // @classification: Internal
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('muse_site_calendar_ranges_site_idx').on(t.customerSiteId, t.startDate)],
);

export type MuseCustomerServiceRow = typeof museCustomerServices.$inferSelect;
export type MuseServiceVolumePickRow = typeof museServiceVolumePicks.$inferSelect;
export type MuseSiteCalendarRangeRow = typeof museSiteCalendarRanges.$inferSelect;

export type MuseCustomerRow = typeof museCustomers.$inferSelect;
export type MuseCustomerInsert = typeof museCustomers.$inferInsert;
export type MuseCustomerSiteRow = typeof museCustomerSites.$inferSelect;
export type MuseCustomerSiteInsert = typeof museCustomerSites.$inferInsert;

// ── Menu cycles and orders (0051) ───────────────────────────────────────────

/**
 * A repeating recipe sequence: day N of the cycle serves one recipe.
 * `startDate` anchors day 1; `weekdays` are the service days it advances on.
 * With `customerId` NULL the row is a saved menu cycle on the shared list; with
 * it set, the row is that customer's meal plan (0071, Roadmap N4a) — copied
 * from `fromCycleId` or programmed for the customer alone. A forecast order
 * generated from a meal plan is derived, never stored.
 */
export const museMenuCycles = museSchema.table(
  'menu_cycles',
  {
    // @classification: Internal
    id: uuid('id').primaryKey().defaultRandom(),
    /** @deprecated 0071: cycles are not assigned to channels. Null on every row; dropped in N9. */
    // @classification: Internal
    channel: integer('channel'),
    /** Null = a saved menu cycle; set = this customer's meal plan (0071). */
    // @classification: Internal
    customerId: uuid('customer_id').references((): AnyPgColumn => museCustomers.id, { onDelete: 'cascade' }),
    /** Set = the plan for this one service, winning over the customer's all-services plan (0071). */
    // @classification: Internal
    customerServiceId: uuid('customer_service_id').references((): AnyPgColumn => museCustomerServices.id, { onDelete: 'cascade' }),
    /** The saved cycle a meal plan was copied from (0071). */
    // @classification: Internal
    fromCycleId: uuid('from_cycle_id').references((): AnyPgColumn => museMenuCycles.id, { onDelete: 'set null' }),
    /** Null = open-ended (0071). */
    // @classification: Internal
    endDate: date('end_date'),
    // @classification: Internal
    name: text('name').notNull(),
    // @classification: Internal
    startDate: date('start_date').notNull(),
    // @classification: Internal
    lengthDays: integer('length_days').notNull().default(5),
    /** e.g. [1,2,3,4,5]; 0 = Sunday. */
    // @classification: Internal
    weekdays: jsonb('weekdays').notNull().default([1, 2, 3, 4, 5]),
    /** 'active' | 'inactive' */
    // @classification: Internal
    status: text('status').notNull().default('active'),
    // @classification: Internal
    notes: text('notes'),
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
    index('muse_menu_cycles_channel_idx').on(t.channel),
    index('muse_menu_cycles_customer_idx').on(t.customerId, t.startDate),
    index('muse_menu_cycles_from_idx').on(t.fromCycleId),
  ],
);

/** One day of a menu cycle and the recipe served; null = no service. */
export const museMenuCycleDays = museSchema.table(
  'menu_cycle_days',
  {
    // @classification: Internal
    id: uuid('id').primaryKey().defaultRandom(),
    // @classification: Internal
    cycleId: uuid('cycle_id')
      .notNull()
      .references(() => museMenuCycles.id, { onDelete: 'cascade' }),
    // @classification: Internal
    day: integer('day').notNull(),
    // @classification: Internal
    recipeCode: text('recipe_code'),
    // @classification: Internal
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('muse_menu_cycle_days_cycle_idx').on(t.cycleId, t.day)],
);

/**
 * A stored order: a typed forecast, a confirmed count, or a delivered order
 * naming its delivery record. One row per date, site and recipe; it replaces
 * the derived forecast order with the same key.
 */
export const museOrders = museSchema.table(
  'orders',
  {
    // @classification: Internal
    id: uuid('id').primaryKey().defaultRandom(),
    // @classification: Internal
    orderDate: date('order_date').notNull(),
    // @classification: Internal
    customerId: uuid('customer_id')
      .notNull()
      .references(() => museCustomers.id, { onDelete: 'cascade' }),
    // @classification: Internal
    customerSiteId: uuid('customer_site_id')
      .notNull()
      .references(() => museCustomerSites.id, { onDelete: 'cascade' }),
    // @classification: Internal
    channel: integer('channel').notNull(),
    // @classification: Internal
    recipeCode: text('recipe_code').notNull(),
    // @classification: Confidential
    meals: doublePrecision('meals').notNull(),
    /** 'forecast' | 'confirmed' | 'delivered' */
    // @classification: Internal
    status: text('status').notNull().default('forecast'),
    /** Null = the customer's contracted price, else the channel default. */
    // @classification: Confidential
    pricePerMealCents: integer('price_per_meal_cents'),
    // @classification: Internal
    deliveryId: uuid('delivery_id').references(() => museDeliveries.id, { onDelete: 'set null' }),
    // @classification: Internal
    menuCycleId: uuid('menu_cycle_id').references(() => museMenuCycles.id, { onDelete: 'set null' }),
    /** The service the order is for (0071). Null on rows typed before services existed. */
    // @classification: Internal
    customerServiceId: uuid('customer_service_id').references(() => museCustomerServices.id, { onDelete: 'set null' }),
    /** 'typed' | 'cycle' | 'sales' | 'portal' */
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
    index('muse_orders_date_idx').on(t.orderDate),
    index('muse_orders_customer_idx').on(t.customerId, t.orderDate),
    index('muse_orders_site_idx').on(t.customerSiteId),
    index('muse_orders_delivery_idx').on(t.deliveryId),
    index('muse_orders_service_idx').on(t.customerServiceId),
  ],
);

export type MuseMenuCycleRow = typeof museMenuCycles.$inferSelect;
export type MuseMenuCycleInsert = typeof museMenuCycles.$inferInsert;
export type MuseMenuCycleDayRow = typeof museMenuCycleDays.$inferSelect;
export type MuseOrderRow = typeof museOrders.$inferSelect;
export type MuseOrderInsert = typeof museOrders.$inferInsert;

// ── Working capital and invoicing (0057, Roadmap Phase K) ───────────────────

/** Payment terms per supplier. Suppliers are a compiled directory, not a table, so terms key on its id. */
export const museSupplierTerms = museSchema.table('supplier_terms', {
  // @classification: Internal
  supplierId: text('supplier_id').primaryKey(),
  // @classification: Internal
  supplierName: text('supplier_name'),
  /** 'due_on_receipt' | 'net_15' | 'net_30' | 'net_60' | 'net_90' */
  // @classification: Internal
  paymentTerms: text('payment_terms').notNull(),
  // @classification: Internal
  updatedBy: text('updated_by'),
  // @classification: Internal
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * A customer invoice: one a month per customer, open while completed routes
 * are added to it, issued with the customer's terms and a due date. What it
 * bills is the deliveries that name it; no total is stored.
 */
export const museInvoices = museSchema.table(
  'invoices',
  {
    // @classification: Internal
    id: uuid('id').primaryKey().defaultRandom(),
    /** AMK-INV-YYYYMMDD-NN */
    // @classification: Internal
    invoiceNumber: text('invoice_number').notNull().unique(),
    // @classification: Internal
    customerId: uuid('customer_id')
      .notNull()
      .references(() => museCustomers.id, { onDelete: 'restrict' }),
    // @classification: Confidential
    customerName: text('customer_name').notNull(),
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
  (t) => [index('muse_invoices_customer_idx').on(t.customerId, t.period)],
);

/** Cash received from a customer, applied to invoices. */
export const museCustomerPayments = museSchema.table(
  'customer_payments',
  {
    // @classification: Internal
    id: uuid('id').primaryKey().defaultRandom(),
    // @classification: Internal
    customerId: uuid('customer_id')
      .notNull()
      .references(() => museCustomers.id, { onDelete: 'restrict' }),
    // @classification: Confidential
    customerName: text('customer_name').notNull(),
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
  (t) => [index('muse_customer_payments_date_idx').on(t.receivedOn)],
);

/** A supplier's bill, recorded against the receipts it covers (three-way match). */
export const museSupplierBills = museSchema.table(
  'supplier_bills',
  {
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
    /** [{ ingredient, qty, unit, unitPriceCents }] */
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
  (t) => [index('muse_supplier_bills_date_idx').on(t.billDate)],
);

/** Cash paid to a supplier, applied to bills. */
export const museSupplierPayments = museSchema.table(
  'supplier_payments',
  {
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
  (t) => [index('muse_supplier_payments_date_idx').on(t.paidOn)],
);

/** The opening balance sheet of the actuals: owners' equity, the fit-out and its financing. */
export const museOpeningBalances = museSchema.table('opening_balances', {
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
export const museStaff = museSchema.table('staff', {
  // @classification: Internal
  id: uuid('id').primaryKey().defaultRandom(),
  // @classification: Confidential
  name: text('name').notNull(),
  // @classification: Internal
  role: text('role'),
  /**
   * The person's employee reference in CompTable (0060). No pay is held in Muse
   * (Roadmap O1); the pay columns were dropped in 0062.
   */
  // @classification: Internal
  employeeRef: text('comptable_employee_ref'),
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
export const museTimePunches = museSchema.table(
  'time_punches',
  {
    // @classification: Internal
    id: uuid('id').primaryKey().defaultRandom(),
    // @classification: Internal
    staffId: uuid('staff_id')
      .notNull()
      .references(() => museStaff.id, { onDelete: 'restrict' }),
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
  (t) => [index('muse_time_punches_staff_idx').on(t.staffId, t.punchedAt), index('muse_time_punches_at_idx').on(t.punchedAt)],
);

export type MuseInvoiceRow = typeof museInvoices.$inferSelect;
export type MuseSupplierBillRow = typeof museSupplierBills.$inferSelect;
export type MuseStaffRow = typeof museStaff.$inferSelect;
export type MuseTimePunchRow = typeof museTimePunches.$inferSelect;

/**
 * The equipment library (Roadmap N1, 0058): every unit in service, planned for a
 * build-out phase, not selected, or on the list and not needed. `key` is the
 * stable reference the Sustainability attributes and entity links use.
 */
export const museEquipment = museSchema.table(
  'equipment',
  {
    // @classification: Internal
    id: uuid('id').primaryKey().defaultRandom(),
    // @classification: Internal
    key: text('key').notNull().unique(),
    // @classification: Internal
    position: integer('position').notNull().default(0),
    // @classification: Internal
    item: text('item').notNull(),
    // @classification: Internal
    category: text('category').notNull(),
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
    /** Pounds one unit takes in one run (0065); null on equipment a batch does not pass through. */
    // @classification: Internal
    batchCapacityLb: doublePrecision('batch_capacity_lb'),
    /** 'estimated' | 'stated' | 'observed' (0065) */
    // @classification: Internal
    batchCapacityBasis: text('batch_capacity_basis').notNull().default('estimated'),
    /** Batches one unit holds at once (0066); null on equipment no batch runs on. */
    // @classification: Internal
    concurrentBatches: integer('concurrent_batches'),
    /** Minutes the unit is unavailable between batches beyond the study's lines (0066). */
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
  (t) => [index('muse_equipment_status_idx').on(t.status, t.buildPhase)],
);

export type MuseEquipmentRow = typeof museEquipment.$inferSelect;

/**
 * The floor layout (Roadmap Q6, 0077): a drawing per scenario and build phase,
 * versions never overwritten. A drawing, not a ledger entry.
 */
export const museFacilityLayouts = museSchema.table(
  'facility_layouts',
  {
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
  (t) => [index('muse_facility_layouts_key_idx').on(t.scenarioKey, t.buildPhase, t.version)],
);

export type MuseFacilityLayoutRow = typeof museFacilityLayouts.$inferSelect;

/**
 * The packaging library (Roadmap N1, 0059): what a meal leaves the kitchen in —
 * containers, lids, labels — each a unit cost on the meal. Not packaging
 * equipment, which is capital in `museEquipment`.
 */
export const musePackages = museSchema.table(
  'packages',
  {
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
    supplierItemId: uuid('supplier_item_id').references(() => museSupplierItems.id, { onDelete: 'set null' }),
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
  (t) => [index('muse_packages_supplier_item_idx').on(t.supplierItemId)],
);

/** The packages a recipe picks and how many per meal (Roadmap N1, 0059). */
export const museRecipePackages = museSchema.table(
  'recipe_packages',
  {
    // @classification: Internal
    id: uuid('id').primaryKey().defaultRandom(),
    // @classification: Internal
    recipeId: uuid('recipe_id')
      .notNull()
      .references(() => museRecipes.id, { onDelete: 'cascade' }),
    // @classification: Internal
    packageId: uuid('package_id')
      .notNull()
      .references(() => musePackages.id, { onDelete: 'restrict' }),
    // @classification: Internal
    qtyPerMeal: doublePrecision('qty_per_meal').notNull().default(1),
    // @classification: Internal
    createdBy: text('created_by'),
    // @classification: Internal
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('muse_recipe_packages_unique').on(t.recipeId, t.packageId), index('muse_recipe_packages_package_idx').on(t.packageId)],
);

/**
 * Pay periods closed in CompTable (Roadmap O1, 0060): totals by account and
 * hours, never an individual's pay. The actuals ledger accrues and pays payroll
 * from these.
 */
export const musePayrollPeriods = museSchema.table(
  'payroll_periods',
  {
    // @classification: Internal
    id: uuid('id').primaryKey().defaultRandom(),
    // @classification: Internal
    comptableRef: text('comptable_ref').notNull().unique(),
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
  (t) => [index('muse_payroll_periods_pay_date_idx').on(t.payDate)],
);

export type MusePayrollPeriodRow = typeof musePayrollPeriods.$inferSelect;

/**
 * Time studies per recipe (Roadmap O2, 0061): one batch's tasks timed, with a
 * quality result. The latest adoption is the recipe's labor standard. No wage.
 */
export const museTimeStudies = museSchema.table(
  'time_studies',
  {
    // @classification: Internal
    id: uuid('id').primaryKey().defaultRandom(),
    // @classification: Internal
    recipeId: uuid('recipe_id')
      .notNull()
      .references(() => museRecipes.id, { onDelete: 'cascade' }),
    /** Null only on a study recorded without a date (the seeded estimate). */
    // @classification: Internal
    studiedOn: date('studied_on'),
    // @classification: Internal
    batchSize: integer('batch_size').notNull(),
    // @classification: Internal
    observer: text('observer'),
    /** 'pass' | 'hold' | 'fail'; null = not recorded. */
    // @classification: Internal
    qualityResult: text('quality_result'),
    // @classification: Internal
    qualityNotes: text('quality_notes'),
    // @classification: Internal
    adoptedAt: timestamp('adopted_at', { withTimezone: true }),
    // @classification: Internal
    adoptedBy: text('adopted_by'),
    /** 'seed' | 'user_built' */
    // @classification: Internal
    source: text('source').notNull().default('user_built'),
    /** 'estimated' | 'observed' (0064). Estimated rows stand in until the recipe's first observed study. */
    // @classification: Internal
    basis: text('basis').notNull().default('observed'),
    // @classification: Internal
    createdBy: text('created_by'),
    // @classification: Internal
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('muse_time_studies_recipe_idx').on(t.recipeId, t.studiedOn)],
);

/** The task lines of a time study (Roadmap O2, 0061). */
export const museTimeStudyLines = museSchema.table(
  'time_study_lines',
  {
    // @classification: Internal
    id: uuid('id').primaryKey().defaultRandom(),
    // @classification: Internal
    studyId: uuid('study_id')
      .notNull()
      .references(() => museTimeStudies.id, { onDelete: 'cascade' }),
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
    /** 'batch' | 'dispatch' (0066): batch lines per batch cooked, dispatch lines per portion shipped that day. */
    // @classification: Internal
    stream: text('stream').notNull().default('batch'),
  },
  (t) => [index('muse_time_study_lines_study_idx').on(t.studyId, t.position)],
);

/** The re-study interval per recipe, in days (Roadmap O2, 0061). */
export const museTimeStudyIntervals = museSchema.table('time_study_intervals', {
  // @classification: Internal
  recipeId: uuid('recipe_id')
    .primaryKey()
    .references(() => museRecipes.id, { onDelete: 'cascade' }),
  // @classification: Internal
  intervalDays: integer('interval_days').notNull(),
  // @classification: Internal
  updatedBy: text('updated_by'),
  // @classification: Internal
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type MuseTimeStudyRow = typeof museTimeStudies.$inferSelect;
export type MusePackageRow = typeof musePackages.$inferSelect;
export type MuseRecipePackageRow = typeof museRecipePackages.$inferSelect;

/**
 * Sustainability records (Roadmap N6 slice 4, 0072): one row per utility bill, lab
 * sample or grease-trap inspection. Actual reads these for the reporting year; Plan
 * runs the scenario's typed quantities.
 */
export const museSustainabilityReadings = museSchema.table(
  'sustainability_readings',
  {
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
    sourceId: uuid('source_id').references(() => museSources.id, { onDelete: 'set null' }),
    // @classification: Internal
    notes: text('notes'),
    // @classification: Internal
    recordedBy: text('recorded_by'),
    // @classification: Internal
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('muse_sustainability_readings_metric_idx').on(t.metric, t.readOn)],
);

/** Refrigerant added at service (0072), keyed by the equipment library's `key`. A fact: Actual only. */
export const museRefrigerantService = museSchema.table(
  'refrigerant_service',
  {
    // @classification: Internal
    id: uuid('id').primaryKey().defaultRandom(),
    // @classification: Internal
    equipmentKey: text('equipment_key').notNull(),
    // @classification: Internal
    servicedOn: date('serviced_on').notNull(),
    // @classification: Internal
    lbAdded: doublePrecision('lb_added').notNull(),
    // @classification: Internal
    sourceId: uuid('source_id').references(() => museSources.id, { onDelete: 'set null' }),
    // @classification: Internal
    technician: text('technician'),
    // @classification: Internal
    notes: text('notes'),
    // @classification: Internal
    recordedBy: text('recorded_by'),
    // @classification: Internal
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('muse_refrigerant_service_key_idx').on(t.equipmentKey, t.servicedOn)],
);

export type MuseSustainabilityReadingRow = typeof museSustainabilityReadings.$inferSelect;
export type MuseRefrigerantServiceRow = typeof museRefrigerantService.$inferSelect;
