/**
 * MicroFarm — supplier catalogs and purchase orders (pure).
 *
 * Three jobs, none of which touch a database or a dataset:
 *   1. Seasonality — is a catalog line available on a given date, given a window
 *      that may wrap the year end.
 *   2. Import — turn a pasted or uploaded price sheet into typed catalog lines,
 *      reporting what it could not read rather than silently dropping it.
 *   3. Purchase orders — group the day's requirement by supplier, price each
 *      line off the supplier's own catalog where it matches, and total it.
 *
 * A PO is the one place the platform writes a dollar down instead of computing
 * it: once issued, the document states what was ordered at what price and must
 * not move when the model does. Everything here produces that document; nothing
 * here reads one back.
 */

// ── Seasonality ─────────────────────────────────────────────────────────────

export const MONTH_LABEL = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const;

export function monthLabel(m: number | null): string {
  return m === null || m < 1 || m > 12 ? '—' : MONTH_LABEL[m - 1];
}

/** "Oct–Mar", "Jun", "Year-round" when no window is recorded. */
export function availabilityLabel(start: number | null, end: number | null): string {
  if (start === null && end === null) return 'Year-round';
  if (start === null || end === null) return `${monthLabel(start)}${monthLabel(end)}`;
  if (start === end) return monthLabel(start);
  return `${monthLabel(start)}–${monthLabel(end)}`;
}

/**
 * Whether a window covers a month. A window whose end month is before its start
 * wraps the year end, so October–March covers November and February but not May.
 * No window recorded means no seasonal restriction on file — treated as
 * available, and labelled year-round so the absence is visible.
 */
export function isAvailableInMonth(
  start: number | null,
  end: number | null,
  month: number,
): boolean {
  if (start === null || end === null) return true;
  if (start <= end) return month >= start && month <= end;
  return month >= start || month <= end;
}

export function isAvailableOn(
  start: number | null,
  end: number | null,
  date: Date,
): boolean {
  return isAvailableInMonth(start, end, date.getMonth() + 1);
}

// ── Catalog lines ───────────────────────────────────────────────────────────

export const CATALOG_STATUSES = ['candidate', 'approved'] as const;
export type CatalogStatus = (typeof CATALOG_STATUSES)[number];

export const CATALOG_STATUS_LABEL: Record<CatalogStatus, string> = {
  candidate: 'Candidate',
  approved: 'Approved',
};

/**
 * A price on a catalog line, in force from `effectiveFrom` until a later row
 * supersedes it. There is no end date: the price in force on any date is the
 * latest row on or before it, so no two rows can drift out of step.
 */
export interface CatalogPrice {
  effectiveFrom: string;
  unitPrice: number | null;
  priceBasis: string | null;
  sourceId: string | null;
  note: string | null;
}

/** A supplier's catalog line, in the shape the browser and engine share. */
export interface CatalogLine {
  id: string;
  supplierId: string;
  item: string;
  category: string | null;
  variety: string | null;
  packSize: string | null;
  unit: string;
  /** Only an approved line prices the plan or a purchase order (Roadmap N1). */
  status: CatalogStatus;
  /** Every price on file, oldest first. */
  prices: CatalogPrice[];
  minOrderQty: number | null;
  leadTimeDays: number | null;
  availStartMonth: number | null;
  availEndMonth: number | null;
  certification: string | null;
  origin: string | null;
  sku: string | null;
  notes: string | null;
  sourceId: string | null;
}

export const PRICE_BASES = ['lb', 'case', 'each', 'dozen', 'cwt'] as const;
export type PriceBasis = (typeof PRICE_BASES)[number];

/**
 * The price in force on a date: the latest row on or before it. Null when the
 * line carries no price yet, or none that had come into force by then — a gap
 * the caller reports rather than filling.
 */
export function priceInForceOn(prices: readonly CatalogPrice[], date: string): CatalogPrice | null {
  let best: CatalogPrice | null = null;
  for (const p of prices) {
    if (p.effectiveFrom > date) continue;
    if (!best || p.effectiveFrom > best.effectiveFrom) best = p;
  }
  return best;
}

export interface CatalogPriceMatch {
  /** The approved line the input prices off, if one matched. */
  line: CatalogLine | null;
  /** Its price in force on the date. Null when the line carries none by then. */
  price: CatalogPrice | null;
  /**
   * A line that matched by name but is not approved, when no approved line did.
   * Carried so the caller can say why the catalog price was not used, rather
   * than leaving the operator to infer it from a fallback figure.
   */
  candidate: CatalogLine | null;
}

/**
 * The one price an input carries on a date: the approved catalog line it
 * matches, at the price in force then. A candidate line is a quote on file, not
 * a price — it never prices the plan, and it is returned so the absence can be
 * stated.
 */
export function matchCatalogPrice(input: string, lines: CatalogLine[], date: string): CatalogPriceMatch {
  const approved = matchCatalogLine(input, lines.filter((l) => l.status === 'approved'));
  if (approved) return { line: approved, price: priceInForceOn(approved.prices, date), candidate: null };
  return { line: null, price: null, candidate: matchCatalogLine(input, lines) };
}

/**
 * Match a grow plan line to a supplier's catalog. Exact name first, then a
 * containment match either way, so "Ground beef, 85/15" finds "Ground beef".
 * Returns null rather than guessing when nothing matches.
 */
export function matchCatalogLine(input: string, lines: CatalogLine[]): CatalogLine | null {
  const needle = input.trim().toLowerCase();
  const exact = lines.find((l) => l.item.trim().toLowerCase() === needle);
  if (exact) return exact;
  const head = needle.split(',')[0].trim();
  return (
    lines.find((l) => {
      const item = l.item.trim().toLowerCase();
      return item === head || item.includes(head) || head.includes(item);
    }) ?? null
  );
}

// ── Import ──────────────────────────────────────────────────────────────────

/** Header aliases, so a supplier's own column names import without editing. */
const HEADER_ALIASES: Record<string, string[]> = {
  item: ['item', 'product', 'name', 'description', 'crop'],
  category: ['category', 'type', 'group'],
  variety: ['variety', 'breed', 'cultivar'],
  packSize: ['pack size', 'pack', 'packsize', 'size'],
  unit: ['unit', 'uom', 'units'],
  unitPrice: ['unit price', 'price', 'unitprice', 'cost', '$'],
  priceBasis: ['price basis', 'basis', 'per', 'pricebasis'],
  minOrderQty: ['min order qty', 'min order', 'minimum', 'moq', 'minorderqty'],
  leadTimeDays: ['lead time days', 'lead time', 'lead', 'leadtimedays'],
  availStartMonth: ['avail start', 'available from', 'start', 'season start', 'availstartmonth'],
  availEndMonth: ['avail end', 'available to', 'end', 'season end', 'availendmonth'],
  certification: ['certification', 'cert', 'certified'],
  origin: ['origin', 'source', 'farm', 'ranch'],
  sku: ['sku', 'code', 'item code'],
  notes: ['notes', 'note', 'comment', 'comments'],
};

export type ImportField = keyof typeof HEADER_ALIASES;

function normalizeHeader(h: string): ImportField | null {
  const k = h.trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    if (aliases.includes(k)) return field as ImportField;
  }
  return null;
}

/** Split one delimited line, honouring double quotes and doubled escapes. */
export function splitRow(line: string, delimiter: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else quoted = false;
      } else cur += c;
    } else if (c === '"') {
      quoted = true;
    } else if (c === delimiter) {
      out.push(cur);
      cur = '';
    } else cur += c;
  }
  out.push(cur);
  return out.map((v) => v.trim());
}

/** Tab when the header row has more tabs than commas — pasted spreadsheets. */
export function detectDelimiter(headerLine: string): string {
  const tabs = (headerLine.match(/\t/g) ?? []).length;
  const commas = (headerLine.match(/,/g) ?? []).length;
  return tabs > commas ? '\t' : ',';
}

const MONTH_NAMES: Record<string, number> = {};
MONTH_LABEL.forEach((m, i) => {
  MONTH_NAMES[m.toLowerCase()] = i + 1;
});
const MONTH_FULL = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
MONTH_FULL.forEach((m, i) => {
  MONTH_NAMES[m] = i + 1;
});

/** A month as a number, a 3-letter name, or a full name. Null when unreadable. */
export function parseMonth(raw: string): number | null {
  const v = raw.trim().toLowerCase();
  if (!v) return null;
  const named = MONTH_NAMES[v] ?? MONTH_NAMES[v.slice(0, 3)];
  if (named) return named;
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= 12 ? n : null;
}

/** A price or quantity, tolerating currency symbols and thousands separators. */
export function parseNumber(raw: string): number | null {
  const v = raw.replace(/[$,\s]/g, '').trim();
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export type ParsedCatalogRow = Omit<CatalogLine, 'id' | 'supplierId' | 'sourceId' | 'status' | 'prices'> & {
  /** The sheet's price for this line; it becomes the row in force from the sheet's date. */
  unitPrice: number | null;
  priceBasis: string | null;
};

export interface ImportProblem {
  /** 1-based line number in the pasted text, counting the header. */
  line: number;
  reason: string;
}

export interface CatalogImportResult {
  rows: ParsedCatalogRow[];
  /** Fields the header did not supply, so the operator can see what is missing. */
  missingFields: ImportField[];
  /** Header columns that matched nothing, kept so a typo is visible. */
  unknownHeaders: string[];
  problems: ImportProblem[];
}

/**
 * Parse a pasted or uploaded price sheet. Only `item` is required — a sheet with
 * nothing but names still imports, and the gaps show as blanks rather than
 * blocking the whole file. Rows that cannot be read are reported with their line
 * number instead of being dropped in silence.
 */
export function parseCatalogSheet(text: string): CatalogImportResult {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l.trim().length > 0);
  if (lines.length === 0) {
    return { rows: [], missingFields: [], unknownHeaders: [], problems: [{ line: 0, reason: 'Nothing to import.' }] };
  }

  const delimiter = detectDelimiter(lines[0]);
  const rawHeaders = splitRow(lines[0], delimiter);
  const mapped = rawHeaders.map(normalizeHeader);
  const unknownHeaders = rawHeaders.filter((h, i) => h.length > 0 && mapped[i] === null);
  const present = new Set(mapped.filter((m): m is ImportField => m !== null));
  const missingFields = (Object.keys(HEADER_ALIASES) as ImportField[]).filter((f) => !present.has(f));

  const problems: ImportProblem[] = [];
  if (!present.has('item')) {
    problems.push({
      line: 1,
      reason: `No item column found. Name one of: ${HEADER_ALIASES['item'].join(', ')}.`,
    });
    return { rows: [], missingFields, unknownHeaders, problems };
  }

  const rows: ParsedCatalogRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitRow(lines[i], delimiter);
    const get = (f: ImportField): string => {
      const idx = mapped.indexOf(f);
      return idx === -1 ? '' : cells[idx] ?? '';
    };
    const item = get('item');
    if (!item) {
      problems.push({ line: i + 1, reason: 'No item name; row skipped.' });
      continue;
    }
    const priceRaw = get('unitPrice');
    const unitPrice = parseNumber(priceRaw);
    if (priceRaw && unitPrice === null) {
      problems.push({ line: i + 1, reason: `Could not read the price “${priceRaw}”; imported without one.` });
    }
    const leadRaw = get('leadTimeDays');
    const lead = parseNumber(leadRaw);
    const blank = (s: string): string | null => (s.length > 0 ? s : null);

    rows.push({
      item,
      category: blank(get('category')),
      variety: blank(get('variety')),
      packSize: blank(get('packSize')),
      unit: get('unit') || 'lb',
      unitPrice,
      priceBasis: blank(get('priceBasis').toLowerCase()),
      minOrderQty: parseNumber(get('minOrderQty')),
      leadTimeDays: lead === null ? null : Math.round(lead),
      availStartMonth: parseMonth(get('availStartMonth')),
      availEndMonth: parseMonth(get('availEndMonth')),
      certification: blank(get('certification')),
      origin: blank(get('origin')),
      sku: blank(get('sku')),
      notes: blank(get('notes')),
    });
  }

  return { rows, missingFields, unknownHeaders, problems };
}

/** The header row the importer writes out, for the downloadable template. */
export function catalogTemplateHeader(): string {
  return (Object.keys(HEADER_ALIASES) as ImportField[]).join(',');
}

// ── Purchase orders ─────────────────────────────────────────────────────────

export const PO_STATUSES = ['draft', 'issued', 'received', 'closed', 'cancelled'] as const;
export type PoStatus = (typeof PO_STATUSES)[number];

export const PO_STATUS_LABEL: Record<PoStatus, string> = {
  draft: 'Draft',
  issued: 'Issued',
  received: 'Received',
  closed: 'Closed',
  cancelled: 'Cancelled',
};

/** Forward transitions. Cancelling is allowed from anywhere that is not final. */
const PO_NEXT: Record<PoStatus, PoStatus[]> = {
  draft: ['issued', 'cancelled'],
  issued: ['received', 'cancelled'],
  received: ['closed', 'cancelled'],
  closed: [],
  cancelled: [],
};

export function nextPoStatuses(current: PoStatus): PoStatus[] {
  return PO_NEXT[current] ?? [];
}

export function canTransition(from: PoStatus, to: PoStatus): boolean {
  return nextPoStatuses(from).includes(to);
}

/** AMK-PO-YYYYMMDD-NN. `sequence` is the count already raised that day, plus one. */
export function purchaseOrderNumber(orderedFor: string, sequence: number): string {
  const compact = orderedFor.slice(0, 10).replace(/-/g, '');
  return `AMK-PO-${compact}-${String(sequence).padStart(2, '0')}`;
}

const cents = (dollars: number) => Math.round(dollars * 100);

export interface RequirementLine {
  input: string;
  /** As-purchased quantity the production run needs. */
  qty: number;
  unit: string;
  packSize: number;
  casesToOrder: number;
  /** The grow plan's own reference cost per unit, used when the catalog has none. */
  fallbackUnitCost: number;
}

export interface DraftPoLine {
  input: string;
  item: string;
  supplierItemId: string | null;
  qty: number;
  unit: string;
  packSize: string | null;
  cases: number;
  unitPriceCents: number;
  extendedCents: number;
  /** Where the price came from — the supplier's catalog or the grow plan's own figure. */
  pricedFrom: 'catalog' | 'growPlan';
  /** The date the catalog price came into force, when the catalog priced the line. */
  priceEffectiveFrom: string | null;
  /** Stated when a line matched by name but is not approved, or is approved with no price by this date. */
  approvalNote: string | null;
  /** Stated when the catalog line is out of season on the order date. */
  seasonalityNote: string | null;
  /** Stated when the order is below the supplier's stated minimum. */
  minimumNote: string | null;
}

export interface DraftPurchaseOrder {
  supplierId: string;
  supplierName: string;
  orderedFor: string;
  lines: DraftPoLine[];
  subtotalCents: number;
}

export interface PoBuildResult {
  orders: DraftPurchaseOrder[];
  /** Requirement lines with no supplier linked — nothing to order them against. */
  unassigned: RequirementLine[];
}

/**
 * Group the day's requirement into one draft order per linked supplier.
 *
 * A line is priced off the supplier's APPROVED catalog line, at the price in
 * force on the order date, and off the grow plan's own reference cost otherwise;
 * which one was used is stated on the line rather than left to inference, and a
 * candidate line that was passed over says so. Season and minimum-order checks
 * annotate the line — they never silently change a quantity, because whether to
 * order a short or out-of-season line is the operator's call.
 */
export function buildDraftPurchaseOrders(
  requirement: RequirementLine[],
  links: Record<string, string>,
  suppliers: Record<string, { id: string; name: string }>,
  catalogBySupplier: Record<string, CatalogLine[]>,
  orderedFor: string,
): PoBuildResult {
  const orders = new Map<string, DraftPurchaseOrder>();
  const unassigned: RequirementLine[] = [];
  const orderDate = new Date(`${orderedFor}T00:00:00Z`);
  const month = Number.isNaN(orderDate.getTime()) ? null : orderDate.getUTCMonth() + 1;

  for (const r of requirement) {
    const supplierId = links[r.input];
    const supplier = supplierId ? suppliers[supplierId] : undefined;
    if (!supplier) {
      unassigned.push(r);
      continue;
    }
    let order = orders.get(supplier.id);
    if (!order) {
      order = { supplierId: supplier.id, supplierName: supplier.name, orderedFor, lines: [], subtotalCents: 0 };
      orders.set(supplier.id, order);
    }

    const catalog = catalogBySupplier[supplier.id] ?? [];
    const { line: approved, price, candidate } = matchCatalogPrice(r.input, catalog, orderedFor);
    // The line the order reads its pack, unit and terms off: the approved line
    // when there is one, else the candidate — its price is what is refused, not
    // everything else it states.
    const match = approved ?? candidate;
    const unitPrice = price?.unitPrice ?? null;
    const pricedFrom: DraftPoLine['pricedFrom'] = unitPrice === null ? 'growPlan' : 'catalog';
    const effectivePrice = unitPrice ?? r.fallbackUnitCost;
    const unitPriceCents = cents(effectivePrice);
    const extendedCents = cents(effectivePrice * r.qty);

    const approvalNote = candidate
      ? `${candidate.item} is a candidate line, not approved; priced off the grow plan's own figure.`
      : approved && unitPrice === null
        ? `${approved.item} is approved but carries no price in force on ${orderedFor}; priced off the grow plan's own figure.`
        : null;
    const seasonalityNote =
      match && month !== null && !isAvailableInMonth(match.availStartMonth, match.availEndMonth, month)
        ? `Catalog window is ${availabilityLabel(match.availStartMonth, match.availEndMonth)}; the order date falls outside it.`
        : null;
    const minimumNote =
      match && match.minOrderQty !== null && r.qty < match.minOrderQty
        ? `Below the stated minimum of ${match.minOrderQty} ${match.unit}.`
        : null;

    order.lines.push({
      input: r.input,
      item: match?.item ?? r.input,
      supplierItemId: match?.id ?? null,
      qty: r.qty,
      unit: match?.unit ?? r.unit,
      packSize: match?.packSize ?? String(r.packSize),
      cases: r.casesToOrder,
      unitPriceCents,
      extendedCents,
      pricedFrom,
      priceEffectiveFrom: price?.effectiveFrom ?? null,
      approvalNote,
      seasonalityNote,
      minimumNote,
    });
    order.subtotalCents += extendedCents;
  }

  return {
    orders: [...orders.values()].sort((a, b) => b.subtotalCents - a.subtotalCents),
    unassigned,
  };
}
