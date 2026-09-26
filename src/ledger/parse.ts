/**
 * CSV parsing + format-specific mappers for the Phase 5b/5c ingest
 * pipeline.
 *
 *   parseCsv(text) → string[][]  — RFC-4180 minus the optional
 *     trailing CRLF, handles quoted fields, escaped quotes, and
 *     embedded newlines inside quotes. No external dep.
 *
 *   mapTransactionRows(rows, mapping) → one row = one balanced two-
 *     line entry. The "generic CSV" path operators use when they
 *     control the export shape.
 *
 *   mapGlRows(rows, mapping, resolver) → multi-line GL format
 *     (QuickBooks Online Journal, Xero Journal). Rows are grouped by
 *     operator-specified key columns; each group becomes one journal
 *     entry. Account names are resolved to internal codes via a
 *     `resolver` callback the caller provides (the web app binds it to
 *     the org's CoA).
 *
 *   detectCsvFormat(headerRow) → suggest a format and column mapping
 *     based on header signatures. Used to pre-fill the column mapper
 *     in the UI when the operator pastes a known export.
 */

import type { Account, NewJournalEntry, NewJournalLine } from '@/ledger/types';

// ─── CSV parser ─────────────────────────────────────────────────────

/**
 * Parse a CSV string into a row-of-cells array. Handles:
 *   - quoted fields ("hello, world")
 *   - escaped quotes ("she said ""hi""")
 *   - newlines inside quotes ("line1\nline2")
 *   - leading/trailing whitespace on unquoted fields is preserved
 *   - CRLF and LF line endings
 *   - a single trailing newline is ignored
 *
 * Empty input returns `[]`. A row with only whitespace becomes a
 * single-element row with that whitespace; the mapping layer decides
 * whether to drop it.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let cur: string[] = [];
  let cell = '';
  let inQuotes = false;
  let i = 0;

  while (i < text.length) {
    const ch = text[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      cell += ch;
      i += 1;
      continue;
    }
    // Not in quotes:
    if (ch === '"' && cell === '') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === ',') {
      cur.push(cell);
      cell = '';
      i += 1;
      continue;
    }
    if (ch === '\n' || ch === '\r') {
      // End of row. Eat a paired \r\n.
      cur.push(cell);
      rows.push(cur);
      cur = [];
      cell = '';
      if (ch === '\r' && text[i + 1] === '\n') i += 2;
      else i += 1;
      continue;
    }
    cell += ch;
    i += 1;
  }
  // Flush any trailing cell / row.
  if (cell !== '' || cur.length > 0) {
    cur.push(cell);
    rows.push(cur);
  }
  return rows;
}

// ─── Transaction-format mapper ──────────────────────────────────────

export interface TransactionColumnMapping {
  /** Index of the date column in the parsed row. ISO YYYY-MM-DD or M/D/YYYY. */
  date: number;
  /** Description column. */
  description: number;
  /** Account code receiving the debit. */
  debitAccount: number;
  /** Account code receiving the credit. */
  creditAccount: number;
  /** Dollar or cents amount column. See `amountUnit` below. */
  amount: number;
  /** Optional memo column. */
  memo?: number;
  /** Optional external reference column (transaction id, check number). */
  reference?: number;
  /** Whether `amount` is dollars (e.g. "125.50") or cents ("12550"). */
  amountUnit: 'dollars' | 'cents';
  /** Whether the parsed rows include a header row to skip. */
  hasHeader: boolean;
}

export interface ParsedTransactionRow {
  /** 0-based index in the CSV (after header skip — index 0 is the first data row). */
  rowIndex: number;
  /** The journal entry draft built from this row. */
  entry: NewJournalEntry;
}

export interface ParseTransactionRowsResult {
  rows: ParsedTransactionRow[];
  errors: Array<{ rowIndex: number; message: string }>;
}

/**
 * Convert "$1,234.56" / "1234.56" / "(1234.56)" / "12345" into integer
 * cents. Parens denote negative; commas are stripped; non-numeric
 * input returns `null` and the caller surfaces a row error.
 */
export function parseAmountToCents(
  raw: string,
  unit: 'dollars' | 'cents',
): number | null {
  if (raw == null) return null;
  let s = raw.trim();
  if (s === '') return null;
  let negative = false;
  if (s.startsWith('(') && s.endsWith(')')) {
    negative = true;
    s = s.slice(1, -1);
  }
  s = s.replace(/[$,\s]/g, '');
  if (s.startsWith('-')) {
    negative = true;
    s = s.slice(1);
  }
  const m = /^([0-9]+)(?:\.([0-9]+))?$/.exec(s);
  if (!m) return null;
  let cents: number;
  if (unit === 'cents') {
    if (s.includes('.')) return null;
    cents = Number(m[1]);
    if (!Number.isFinite(cents)) return null;
  } else {
    // String-based dollar-to-cents conversion. Avoids IEEE-754 float
    // surprises like 1.005 * 100 === 100.49999999... by working on
    // the decimal digits directly. Rounds half-up on the 3rd
    // fractional digit.
    const whole = m[1]!;
    const frac = m[2] ?? '';
    let fracCents: number;
    if (frac.length === 0) {
      fracCents = 0;
    } else if (frac.length === 1) {
      fracCents = Number(frac) * 10;
    } else if (frac.length === 2) {
      fracCents = Number(frac);
    } else {
      const head = Number(frac.slice(0, 2));
      // Round half-up based on the 3rd digit.
      const roundUp = frac.charCodeAt(2) >= 53; // '5' === 53
      fracCents = head + (roundUp ? 1 : 0);
    }
    cents = Number(whole) * 100 + fracCents;
  }
  return negative ? -cents : cents;
}

/**
 * Convert "2026-03-15" / "3/15/2026" / "03/15/2026" / "2026-3-15" into
 * canonical YYYY-MM-DD. Returns `null` for anything else. Two-digit
 * years are explicitly rejected — too ambiguous in a tool that runs
 * across forecast and historical periods.
 */
export function parseDateToIso(raw: string): string | null {
  if (raw == null) return null;
  const s = raw.trim();
  if (s === '') return null;
  const isoMatch = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (isoMatch) {
    const y = isoMatch[1]!;
    const m = isoMatch[2]!.padStart(2, '0');
    const d = isoMatch[3]!.padStart(2, '0');
    return validateDate(`${y}-${m}-${d}`);
  }
  const usMatch = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (usMatch) {
    const m = usMatch[1]!.padStart(2, '0');
    const d = usMatch[2]!.padStart(2, '0');
    const y = usMatch[3]!;
    return validateDate(`${y}-${m}-${d}`);
  }
  return null;
}

function validateDate(iso: string): string | null {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (
    date.getUTCFullYear() !== y ||
    date.getUTCMonth() !== m - 1 ||
    date.getUTCDate() !== d
  ) {
    return null;
  }
  return iso;
}

/**
 * Map parsed CSV rows into NewJournalEntry drafts using a transaction
 * column mapping. Each row becomes a single balanced 2-line entry:
 *   DR debitAccount, CR creditAccount, |amount|.
 * Rows that fail to parse (bad date / amount / accounts) accumulate
 * into `errors` but do NOT abort the batch — the operator preview
 * surfaces them and the operator either fixes the CSV or proceeds
 * with the good rows.
 *
 * Negative amounts swap the sides automatically — a "-125.00" in a
 * "Sales" credit-account column becomes DR sales / CR debit-account,
 * matching how most accounting tools export refunds.
 */
export function mapTransactionRows(
  rows: ReadonlyArray<ReadonlyArray<string>>,
  mapping: TransactionColumnMapping,
): ParseTransactionRowsResult {
  const out: ParsedTransactionRow[] = [];
  const errors: Array<{ rowIndex: number; message: string }> = [];
  const start = mapping.hasHeader ? 1 : 0;
  for (let i = start; i < rows.length; i++) {
    const r = rows[i]!;
    // Skip rows that are entirely empty (operator-side trailing
    // newlines or blank separators).
    if (r.every((c) => c.trim() === '')) continue;
    const dataRowIndex = i - start;
    const rawDate = r[mapping.date] ?? '';
    const date = parseDateToIso(rawDate);
    if (!date) {
      errors.push({
        rowIndex: dataRowIndex,
        message: `Could not parse date "${rawDate}".`,
      });
      continue;
    }
    const description = (r[mapping.description] ?? '').trim();
    if (!description) {
      errors.push({
        rowIndex: dataRowIndex,
        message: 'Description is empty.',
      });
      continue;
    }
    const debitAccount = (r[mapping.debitAccount] ?? '').trim();
    const creditAccount = (r[mapping.creditAccount] ?? '').trim();
    if (!debitAccount || !creditAccount) {
      errors.push({
        rowIndex: dataRowIndex,
        message: 'Debit and credit account codes are both required.',
      });
      continue;
    }
    const cents = parseAmountToCents(
      r[mapping.amount] ?? '',
      mapping.amountUnit,
    );
    if (cents === null) {
      errors.push({
        rowIndex: dataRowIndex,
        message: `Could not parse amount "${r[mapping.amount] ?? ''}".`,
      });
      continue;
    }
    if (cents === 0) {
      errors.push({
        rowIndex: dataRowIndex,
        message: 'Amount is zero.',
      });
      continue;
    }

    // Negative amounts: swap the sides. Operator's intent for a
    // "refund" line stays the same; the entry comes out balanced
    // with positive cents on each side.
    const absCents = Math.abs(cents);
    const dr = cents > 0 ? debitAccount : creditAccount;
    const cr = cents > 0 ? creditAccount : debitAccount;

    const lines: NewJournalLine[] = [
      { accountCode: dr, debitCents: absCents, creditCents: 0 },
      { accountCode: cr, debitCents: 0, creditCents: absCents },
    ];
    const memo = mapping.memo !== undefined ? (r[mapping.memo] ?? '').trim() : '';
    if (memo) {
      lines[0]!.memo = memo;
      lines[1]!.memo = memo;
    }

    const entry: NewJournalEntry = {
      date,
      description,
      lines,
    };
    if (mapping.reference !== undefined) {
      const ref = (r[mapping.reference] ?? '').trim();
      if (ref) entry.reference = ref;
    }
    out.push({ rowIndex: dataRowIndex, entry });
  }
  return { rows: out, errors };
}

// ─── Multi-line GL mapper (Phase 5c) ────────────────────────────────

export interface GlColumnMapping {
  /**
   * Indices of the columns that together identify a single journal
   * entry. Most QBO / Xero Journal exports use a transaction number
   * or reference column; passing `[refCol]` groups all lines of a
   * transaction together. `[dateCol, refCol]` is a safer default
   * when references can recur across days.
   */
  groupBy: number[];
  date: number;
  description: number;
  /** Optional column with a transaction reference / external id. */
  reference?: number;
  /** Operator-supplied account *name* — resolved to a code by the caller. */
  account: number;
  debit: number;
  credit: number;
  memo?: number;
  amountUnit: 'dollars' | 'cents';
  hasHeader: boolean;
}

/**
 * Resolve an account name (operator-facing label from the source CSV)
 * to a CoA account code. Returns `null` when no match is found —
 * callers surface unmatched names so the operator can either fix the
 * CSV or extend the chart.
 */
export type AccountNameResolver = (name: string) => string | null;

export interface ParsedGlEntry {
  /** First row index in the group (0-based after header skip). */
  rowIndex: number;
  /** Source row indices that contributed to this entry. */
  sourceRowIndices: number[];
  entry: NewJournalEntry;
}

export interface MapGlRowsResult {
  rows: ParsedGlEntry[];
  errors: Array<{ rowIndex: number; message: string }>;
  /** Account names referenced in the CSV that didn't resolve to a code. */
  unmatchedAccountNames: string[];
}

interface PendingGlGroup {
  key: string;
  firstRowIndex: number;
  sourceRowIndices: number[];
  date: string;
  description: string;
  reference: string | undefined;
  lines: NewJournalLine[];
}

/**
 * Map multi-line GL CSV rows into journal entries. Rows with matching
 * `groupBy` cells collapse into a single entry — that's how QBO
 * Journal and Xero Journal exports represent one transaction as
 * multiple lines.
 *
 * Per-row failures (unparseable date / amount / account name not in
 * the CoA) accumulate into `errors`. A group whose lines don't sum
 * to a balanced entry (DR === CR) is rejected with a group-level
 * error. Account names that didn't resolve are listed separately so
 * the UI can surface them as a fixable batch.
 */
export function mapGlRows(
  rows: ReadonlyArray<ReadonlyArray<string>>,
  mapping: GlColumnMapping,
  resolver: AccountNameResolver,
): MapGlRowsResult {
  const groups = new Map<string, PendingGlGroup>();
  const groupOrder: string[] = [];
  const errors: Array<{ rowIndex: number; message: string }> = [];
  const unmatchedSet = new Set<string>();
  const start = mapping.hasHeader ? 1 : 0;

  for (let i = start; i < rows.length; i++) {
    const r = rows[i]!;
    if (r.every((c) => c.trim() === '')) continue;
    const dataRowIndex = i - start;

    const rawDate = r[mapping.date] ?? '';
    const date = parseDateToIso(rawDate);
    if (!date) {
      errors.push({
        rowIndex: dataRowIndex,
        message: `Could not parse date "${rawDate}".`,
      });
      continue;
    }
    const accountName = (r[mapping.account] ?? '').trim();
    if (!accountName) {
      errors.push({
        rowIndex: dataRowIndex,
        message: 'Account column is empty.',
      });
      continue;
    }
    const code = resolver(accountName);
    if (!code) {
      unmatchedSet.add(accountName);
      errors.push({
        rowIndex: dataRowIndex,
        message: `No CoA account matches "${accountName}".`,
      });
      continue;
    }
    const debitCents =
      parseAmountToCents(r[mapping.debit] ?? '', mapping.amountUnit) ?? 0;
    const creditCents =
      parseAmountToCents(r[mapping.credit] ?? '', mapping.amountUnit) ?? 0;
    if (debitCents === 0 && creditCents === 0) {
      // QBO journal sometimes emits zero-amount rows for metadata. Skip.
      continue;
    }
    if (debitCents < 0 || creditCents < 0) {
      errors.push({
        rowIndex: dataRowIndex,
        message: 'Negative amounts not supported in GL format. Use refunds via reversing entries instead.',
      });
      continue;
    }
    if (debitCents > 0 && creditCents > 0) {
      errors.push({
        rowIndex: dataRowIndex,
        message: 'Row has both a debit and a credit. Split into two rows.',
      });
      continue;
    }

    const description = (r[mapping.description] ?? '').trim();
    const reference =
      mapping.reference !== undefined
        ? (r[mapping.reference] ?? '').trim() || undefined
        : undefined;
    const memo = mapping.memo !== undefined ? (r[mapping.memo] ?? '').trim() : '';

    const keyParts = mapping.groupBy.map((col) => (r[col] ?? '').trim());
    const key = keyParts.join('|');

    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        firstRowIndex: dataRowIndex,
        sourceRowIndices: [],
        date,
        description,
        reference,
        lines: [],
      };
      groups.set(key, group);
      groupOrder.push(key);
    }
    // Within a group, prefer the first non-empty description.
    if (!group.description && description) group.description = description;
    group.sourceRowIndices.push(dataRowIndex);

    const line: NewJournalLine = {
      accountCode: code,
      debitCents,
      creditCents,
    };
    if (memo) line.memo = memo;
    group.lines.push(line);
  }

  const out: ParsedGlEntry[] = [];
  for (const key of groupOrder) {
    const g = groups.get(key)!;
    if (g.lines.length === 0) continue;
    let d = 0;
    let c = 0;
    for (const l of g.lines) {
      d += l.debitCents;
      c += l.creditCents;
    }
    if (d !== c) {
      errors.push({
        rowIndex: g.firstRowIndex,
        message: `Group "${key}" is unbalanced: debits ${d} vs credits ${c}.`,
      });
      continue;
    }
    const entry: NewJournalEntry = {
      date: g.date,
      description: g.description || `(no description)`,
      lines: g.lines,
    };
    if (g.reference) entry.reference = g.reference;
    out.push({
      rowIndex: g.firstRowIndex,
      sourceRowIndices: g.sourceRowIndices,
      entry,
    });
  }

  return {
    rows: out,
    errors,
    unmatchedAccountNames: [...unmatchedSet].sort(),
  };
}

// ─── Account-name resolver helpers ──────────────────────────────────

/**
 * Build a resolver that maps an operator-facing account name to a CoA
 * code. Match precedence:
 *   1. Exact (case-insensitive, trimmed)
 *   2. Code prefix — "1010 Cash" matches code "1010"
 *   3. Case-insensitive substring — "cash" matches "Cash — Operating"
 *      (only when exactly one CoA account matches)
 *
 * The ambiguity guard on step 3 is deliberate: a multi-match falls
 * through to `null` so the operator surfaces the conflict instead of
 * silently mis-posting.
 */
export function buildAccountNameResolver(
  coa: ReadonlyArray<Account>,
): AccountNameResolver {
  const byNameLower = new Map<string, string>();
  const byCode = new Map<string, string>();
  for (const a of coa) {
    byNameLower.set(a.name.trim().toLowerCase(), a.code);
    byCode.set(a.code, a.code);
  }
  return (rawName) => {
    const name = rawName.trim();
    if (!name) return null;
    const lower = name.toLowerCase();
    const exact = byNameLower.get(lower);
    if (exact) return exact;
    // "1010 Cash — Operating" style — leading code token.
    const leadingCodeMatch = /^(\d{3,6})\b/.exec(name);
    if (leadingCodeMatch) {
      const code = leadingCodeMatch[1]!;
      if (byCode.has(code)) return code;
    }
    // Substring match — only if unambiguous.
    const matches: string[] = [];
    for (const a of coa) {
      if (a.name.toLowerCase().includes(lower)) matches.push(a.code);
    }
    if (matches.length === 1) return matches[0]!;
    return null;
  };
}

// ─── Format detection (Phase 5c) ────────────────────────────────────

export type CsvFormat = 'quickbooks_online_csv' | 'xero_csv' | 'generic_csv';

export interface DetectedFormat {
  format: CsvFormat;
  /** Per-column suggested mapping. Indices align with the parsed header row. */
  suggestedGlMapping?: GlColumnMapping;
  /** Per-column suggested mapping for the simpler transaction format. */
  suggestedTransactionMapping?: TransactionColumnMapping;
  /** Human-readable label for the UI badge. */
  label: string;
}

interface ColumnAlias {
  /** Key in the returned mapping (e.g. 'date', 'debit'). */
  field: keyof GlColumnMapping | 'group';
  /** Case-insensitive header names that satisfy this field. */
  aliases: string[];
}

const QBO_GL_ALIASES: ColumnAlias[] = [
  { field: 'date', aliases: ['date', 'transaction date'] },
  { field: 'description', aliases: ['memo/description', 'description'] },
  { field: 'reference', aliases: ['num', 'no.', 'no'] },
  { field: 'account', aliases: ['account', 'name'] },
  { field: 'debit', aliases: ['debit'] },
  { field: 'credit', aliases: ['credit'] },
];

const XERO_GL_ALIASES: ColumnAlias[] = [
  { field: 'date', aliases: ['date'] },
  { field: 'description', aliases: ['description', 'narration'] },
  { field: 'reference', aliases: ['reference', 'source'] },
  { field: 'account', aliases: ['account', 'account name'] },
  { field: 'debit', aliases: ['debit', 'debit amount'] },
  { field: 'credit', aliases: ['credit', 'credit amount'] },
];

/**
 * Lower-cased, whitespace-collapsed header for fuzzy matching.
 */
function normalizeHeader(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

function resolveMapping(
  headers: string[],
  aliases: ColumnAlias[],
): Partial<Record<ColumnAlias['field'], number>> {
  const out: Partial<Record<ColumnAlias['field'], number>> = {};
  const normalized = headers.map(normalizeHeader);
  for (const a of aliases) {
    for (const candidate of a.aliases) {
      const idx = normalized.indexOf(candidate);
      if (idx !== -1) {
        out[a.field] = idx;
        break;
      }
    }
  }
  return out;
}

/**
 * Inspect the first row of a parsed CSV and guess the format. When a
 * format is recognized, returns suggested column indices the UI can
 * pre-fill so the operator only confirms — no manual mapping needed
 * for clean QBO / Xero exports.
 *
 * Returns `{ format: 'generic_csv', label: 'Generic CSV' }` when
 * nothing matches; the operator's existing manual-mapping flow takes
 * over from there.
 */
export function detectCsvFormat(headerRow: ReadonlyArray<string>): DetectedFormat {
  const headers = headerRow.slice();
  const qbo = resolveMapping(headers, QBO_GL_ALIASES);
  const xero = resolveMapping(headers, XERO_GL_ALIASES);

  // QBO Journal is the strongest signal: it's the only common export
  // that combines `Memo/Description` with explicit `Debit` + `Credit`
  // columns. Use that pair to disambiguate from Xero.
  const hasMemoDescription = headers.some(
    (h) => normalizeHeader(h) === 'memo/description',
  );
  if (
    qbo.date !== undefined &&
    qbo.account !== undefined &&
    qbo.debit !== undefined &&
    qbo.credit !== undefined &&
    hasMemoDescription
  ) {
    const groupCol = qbo.reference ?? qbo.date;
    const mapping: GlColumnMapping = {
      groupBy: qbo.reference !== undefined ? [qbo.date, qbo.reference] : [qbo.date],
      date: qbo.date,
      description: qbo.description ?? qbo.date,
      account: qbo.account,
      debit: qbo.debit,
      credit: qbo.credit,
      amountUnit: 'dollars',
      hasHeader: true,
    };
    if (qbo.reference !== undefined) mapping.reference = qbo.reference;
    void groupCol;
    return {
      format: 'quickbooks_online_csv',
      label: 'QuickBooks Online — Journal',
      suggestedGlMapping: mapping,
    };
  }

  // Xero Journal: Date + Description + Account + Debit + Credit.
  if (
    xero.date !== undefined &&
    xero.account !== undefined &&
    xero.debit !== undefined &&
    xero.credit !== undefined &&
    xero.description !== undefined
  ) {
    const mapping: GlColumnMapping = {
      groupBy: xero.reference !== undefined ? [xero.date, xero.reference] : [xero.date, xero.description],
      date: xero.date,
      description: xero.description,
      account: xero.account,
      debit: xero.debit,
      credit: xero.credit,
      amountUnit: 'dollars',
      hasHeader: true,
    };
    if (xero.reference !== undefined) mapping.reference = xero.reference;
    return {
      format: 'xero_csv',
      label: 'Xero — Journal',
      suggestedGlMapping: mapping,
    };
  }

  return { format: 'generic_csv', label: 'Generic CSV' };
}
