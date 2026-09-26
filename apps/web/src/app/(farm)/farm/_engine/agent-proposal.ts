/**
 * MicroFarm — agentic assistance: the crop-plan-variant proposal and its resolver
 * (agentic-assistance build plan §3–§4). Pure.
 *
 * The model proposes; the engine computes. A chef's instruction ("duplicate the
 * bowl with pre-cut carrots and drop the wash-and-peel step") comes back from the
 * model as a typed proposal: line changes, labor changes, open questions and the
 * facts it read. Nothing in the proposal is a computed figure — a number is in it
 * only because the chef stated it (decision 7). `resolveProposal` turns the
 * proposal into a library-shaped variant crop plan and its estimated study, finding
 * each figure the instruction implies in this order:
 *
 *   1. FIND AND CITE — an approved catalog line, or a line of another library
 *      crop plan by the same name, tagged with where it came from.
 *   2. DERIVE — what the engine already derives (a prepared item's quantity from
 *      the raw line's separate trim yield; the harvested yield per sowing).
 *   3. ASK — an open question. A waived question resolves to the source crop plan's
 *      own figure tagged PLACEHOLDER with the question as its note; nothing is
 *      guessed.
 *
 * A name that matches zero or several records is a question listing the
 * candidates, never a pick (decision 8). Every figure on the variant carries a
 * tag: STATED, SOURCED, DERIVED or PLACEHOLDER.
 */

import { z } from 'zod';
import type { InputLine, CropPlanDef } from '../_data/plan-data';
import type { StatusTag } from '../_data/tagged';
import type { TimeStudyDoc, TimeStudyLine, TimeStudySeed } from '../_data/time-studies';
import { priceInForceOn, type CatalogLine } from './catalog';
import { normalizeLines } from './crop-plan-library';
import { laborStandard, studiesForCropPlan } from './time-studies';
import { estimatedTimeStudy } from './time-study-estimate';
import { FOOD_TRACEABILITY_LIST_CATEGORIES } from './traceability';

// ── The contract the model fills ────────────────────────────────────────────

const Num = z.coerce.number().finite();
const Name = z.string().trim().min(1).max(160);
const Unit = z.enum(['lb', 'each']);
const Scaling = z.enum(['fixed', 'variable']);
const Stream = z.enum(['sowing', 'harvest']);

export const LineChangeSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('replace'),
    line: Name,
    withItem: Name,
    seedQtyPerSowing: Num.min(0).optional(),
    unit: Unit.optional(),
    yieldToHarvest: Num.positive().optional(),
    packSize: Num.positive().optional(),
    seedUnitCost: Num.min(0).optional(),
    spec: z.string().max(400).optional(),
    fromCropPlan: z.string().trim().max(160).optional(),
    foodTraceabilityList: z.string().trim().min(1).max(120).optional(),
  }),
  z.object({
    kind: z.literal('swapComponent'),
    /** The served component on the source crop plan, as the chef named it. */
    component: Name,
    /** The component that takes its place, as the chef named it. */
    withComponent: Name,
    /** The crop plan the chef said it comes from, when named. */
    fromCropPlan: z.string().trim().max(160).optional(),
  }),
  z.object({
    kind: z.literal('edit'),
    line: Name,
    seedQtyPerSowing: Num.min(0).optional(),
    yieldToHarvest: Num.positive().optional(),
    packSize: Num.positive().optional(),
    seedUnitCost: Num.min(0).optional(),
    spec: z.string().max(400).optional(),
  }),
  z.object({
    kind: z.literal('add'),
    name: Name,
    spec: z.string().max(400).default(''),
    seedQtyPerSowing: Num.min(0),
    unit: Unit.default('lb'),
    yieldToHarvest: Num.positive().optional(),
    packSize: Num.positive().optional(),
    seedUnitCost: Num.min(0).optional(),
    isHotComponent: z.boolean().default(true),
    fromCropPlan: z.string().trim().max(160).optional(),
    foodTraceabilityList: z.string().trim().min(1).max(120).optional(),
  }),
  z.object({ kind: z.literal('remove'), line: Name }),
  z.object({
    /**
     * The item stays but its FORM changes — bought pre-cut, pre-diced, harvested,
     * frozen, canned — so the step that worked it changes too (R6.3). The line
     * change and the step change are one change: the step is found through the
     * component the line belongs to, never through the chef's words for it.
     */
    kind: z.literal('changeProcessing'),
    /** The line, or the served component, whose form changes. */
    line: Name,
    /** The item in its new form, as the chef named it; absent when only the step changes. */
    withItem: Name.optional(),
    step: z.enum(['prep', 'sow']).default('prep'),
    removeStep: z.boolean().default(false),
    laborMinutes: Num.min(0).optional(),
    elapsedMinutes: Num.min(0).optional(),
    staff: Num.int().min(0).optional(),
    seedQtyPerSowing: Num.min(0).optional(),
    unit: Unit.optional(),
    yieldToHarvest: Num.positive().optional(),
    packSize: Num.positive().optional(),
    seedUnitCost: Num.min(0).optional(),
    spec: z.string().max(400).optional(),
    fromCropPlan: z.string().trim().max(160).optional(),
    foodTraceabilityList: z.string().trim().min(1).max(120).optional(),
  }),
]);
export type LineChange = z.infer<typeof LineChangeSchema>;

export const LaborChangeSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('edit'),
    step: Name,
    laborMinutes: Num.min(0).optional(),
    elapsedMinutes: Num.min(0).optional(),
    staff: Num.int().min(0).optional(),
    scalesWith: Scaling.optional(),
    station: z.string().max(120).optional(),
  }),
  z.object({
    kind: z.literal('add'),
    task: Name,
    station: z.string().max(120).nullable().default(null),
    staff: Num.int().min(1).default(1),
    laborMinutes: Num.min(0).optional(),
    elapsedMinutes: Num.min(0).optional(),
    scalesWith: Scaling.optional(),
    stream: Stream.default('sowing'),
    after: Name.optional(),
  }),
  z.object({ kind: z.literal('remove'), step: Name }),
]);
export type LaborChange = z.infer<typeof LaborChangeSchema>;

export const OpenQuestionSchema = z.object({
  id: z.string().trim().min(1).max(80),
  about: z.enum(['line', 'step', 'catalog', 'cropPlan']),
  field: z.string().trim().min(1).max(60),
  question: z.string().trim().min(1).max(400),
  waivable: z.boolean().default(true),
});
export type OpenQuestion = z.infer<typeof OpenQuestionSchema>;

/**
 * A list the model may have written as a list, as a JSON-encoded list, as one
 * bare item, or as the word "none". The proposal is never sunk by the shape of
 * an empty list.
 */
const NONE = /^\s*(none|n\/a|null|no(ne)? (open )?questions?|nothing)?\s*\.?\s*$/i;
const asList = (v: unknown): unknown[] => {
  if (Array.isArray(v)) return v;
  if (v === undefined || v === null) return [];
  if (typeof v === 'string') {
    if (NONE.test(v)) return [];
    const t = v.trim();
    if (t.startsWith('[') || t.startsWith('{')) {
      try {
        const parsed: unknown = JSON.parse(t);
        return Array.isArray(parsed) ? parsed : [parsed];
      } catch {
        /* a bare sentence */
      }
    }
    return [v];
  }
  return [v];
};
/** A bare sentence in the questions list is a question about the crop plan as a whole. */
const asQuestion = (v: unknown, i: number): unknown => (typeof v === 'string' ? { id: `model-${i + 1}`, about: 'cropPlan', field: 'note', question: v, waivable: true } : v);

/**
 * The loose envelope: the change lists are `unknown[]` on purpose so one
 * malformed change becomes a question instead of sinking the proposal (the
 * roster-ingestion pattern).
 */
export const ProposalEnvelopeSchema = z.object({
  sourceCropPlan: z.string().trim().max(160).default(''),
  variantName: z.string().trim().max(80).default(''),
  lineChanges: z.preprocess(asList, z.array(z.unknown()).max(40)),
  laborChanges: z.preprocess(asList, z.array(z.unknown()).max(40)),
  /** Tolerated for older recorded outputs; never read (R6.4). */
  openQuestions: z.preprocess((v) => asList(v).map(asQuestion), z.array(z.unknown()).max(40)).optional(),
  facts: z.preprocess((v) => asList(v).filter((f) => typeof f === 'string'), z.array(z.string().trim().min(1).max(300)).max(20)),
});

export interface CropPlanVariantProposal {
  sourceCropPlan: string;
  variantName: string;
  lineChanges: LineChange[];
  laborChanges: LaborChange[];
  openQuestions: OpenQuestion[];
  facts: string[];
}

const issueText = (e: z.ZodError): string =>
  e.issues
    .slice(0, 2)
    .map((i) => `${i.path.join('.') || 'row'}: ${i.message}`)
    .join('; ');

const describe = (raw: unknown): string => {
  if (raw && typeof raw === 'object') {
    const r = raw as Record<string, unknown>;
    for (const k of ['line', 'name', 'step', 'task', 'withItem', 'component', 'withComponent']) {
      const v = r[k];
      if (typeof v === 'string' && v.length > 0) return v;
    }
  }
  return 'an unnamed change';
};

/**
 * Parse the model's tool input. Strict per row: a change that fails its schema
 * is dropped and reported as a question the reviewer can act on.
 */
export function parseProposal(input: unknown): { ok: true; proposal: CropPlanVariantProposal } | { ok: false; error: string } {
  const env = ProposalEnvelopeSchema.safeParse(input);
  if (!env.success) return { ok: false, error: issueText(env.error) };
  const lineChanges: LineChange[] = [];
  const laborChanges: LaborChange[] = [];
  const openQuestions: OpenQuestion[] = [];
  let n = 0;
  const unreadable = (kind: 'line' | 'step', raw: unknown, e: z.ZodError) => {
    n += 1;
    openQuestions.push({
      id: `unreadable-${n}`,
      about: kind === 'line' ? 'line' : 'step',
      field: 'row',
      question: `A ${kind} change for "${describe(raw)}" could not be read (${issueText(e)}). State it again, or waive it to leave that part out.`,
      waivable: true,
    });
  };
  for (const raw of env.data.lineChanges) {
    const r = LineChangeSchema.safeParse(raw);
    if (r.success) lineChanges.push(r.data);
    else unreadable('line', raw, r.error);
  }
  for (const raw of env.data.laborChanges) {
    const r = LaborChangeSchema.safeParse(raw);
    if (r.success) laborChanges.push(r.data);
    else unreadable('step', raw, r.error);
  }
  // R6.4: every question is the resolver's. Questions the model still writes are not read.
  return {
    ok: true,
    proposal: {
      sourceCropPlan: env.data.sourceCropPlan,
      variantName: env.data.variantName,
      lineChanges,
      laborChanges,
      openQuestions,
      facts: env.data.facts,
    },
  };
}

// ── Name matching ───────────────────────────────────────────────────────────

export type NameMatch = { match: string } | { candidates: string[] };

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * Words that carry no meaning in a chef's reference to a line, component or
 * step ("the green bean prep step" → green bean prep). Kept short on purpose:
 * "prep" and "sow" stay, since they tell a prep step from a sow step.
 */
const STOPWORDS = new Set(['the', 'a', 'an', 'of', 'for', 'with', 'to', 'in', 'on', 'and', 'or', 'its', 'my', 'our', 'this', 'that', 'it', 'is', 'be', 'as', 'at', 'by', 'per', 'from', 'into', 'some', 'all', 'one', 'step', 'steps', 'line', 'lines', 'item', 'items', 'input', 'inputs', 'pack', 'dish', 'cropPlan', 'bowl', 'unit', 'entree', 'side']);

/** Plural to singular for the common English shapes (potatoes, berries, beans, thighs); never touches a short word or an "-ss" word. */
const singular = (w: string): string => {
  if (w.length <= 3) return w;
  if (w.endsWith('ies') && w.length > 4) return `${w.slice(0, -3)}y`;
  if (/(?:oes|xes|shes|ches|sses)$/.test(w)) return w.slice(0, -2);
  if (w.endsWith('ss')) return w;
  if (w.endsWith('s')) return w.slice(0, -1);
  return w;
};

/** The meaning-bearing words of a name: lower-cased, punctuation stripped, stopwords dropped, plurals folded. */
const words = (s: string): string[] =>
  norm(s)
    .replace(/[^a-z0-9 ]+/g, ' ')
    .split(' ')
    .filter((w) => w.length > 1 && !STOPWORDS.has(w))
    .map(singular);

const contains = (outer: readonly string[], inner: readonly string[]) => inner.every((w) => outer.includes(w));

/**
 * Exact, then case-insensitive, then by meaning-bearing words: every word of the
 * query in the candidate, or every word of the candidate in the query. One hit at
 * any stage is the match; several at the last stage is ambiguity, listed. When no
 * candidate contains the query, the ones sharing at least half its words are
 * listed as candidates but never chosen (decision 8: ambiguity is a question,
 * never a pick).
 */
export function matchName(query: string, candidates: readonly string[]): NameMatch {
  const exact = candidates.filter((c) => c === query);
  if (exact.length === 1) return { match: exact[0]! };
  const ci = candidates.filter((c) => norm(c) === norm(query));
  if (ci.length === 1) return { match: ci[0]! };
  const qw = words(query);
  if (qw.length === 0) return { candidates: [] };
  const contained = candidates.filter((c) => {
    const cw = words(c);
    return cw.length > 0 && (contains(cw, qw) || contains(qw, cw));
  });
  if (contained.length === 1) return { match: contained[0]! };
  if (contained.length > 1) {
    // Among several, a candidate whose words are exactly the query's is the one meant.
    const same = contained.filter((c) => {
      const cw = words(c);
      return cw.length === qw.length && contains(cw, qw);
    });
    if (same.length === 1) return { match: same[0]! };
    return { candidates: contained };
  }
  const partial = candidates.filter((c) => {
    const cw = words(c);
    const overlap = qw.filter((w) => cw.includes(w)).length;
    return overlap > 0 && overlap * 2 >= qw.length;
  });
  return { candidates: partial };
}

// ── The resolver ────────────────────────────────────────────────────────────

export interface ResolveContext {
  /** The library, as costed under the open forecast; the source crop plan is found here by code or name. */
  library: readonly CropPlanDef[];
  /** The time-study library, or null when none is loaded (engine defaults apply). */
  studies: readonly TimeStudyDoc[] | null;
  /** Approved catalog lines, every supplier flattened. */
  catalog: readonly CatalogLine[];
  /** Supplier name by id, for the citation on a catalog-sourced price. */
  supplierNames: Readonly<Record<string, string>>;
  /** The date catalog prices are read for. */
  asOf: string;
  /** The derived sowing the source crop plan is costed at (its labor estimate is built for it when no study exists). */
  sowingSize: number;
  /** Question ids the reviewer has waived. */
  waived: ReadonlySet<string>;
  /** Confirmation ids the reviewer has accepted: "use the line found on crop plan X as the basis". */
  confirmed: ReadonlySet<string>;
}

/** One figure the resolver set, with where it came from — the rows of the review card. */
export interface AppliedChange {
  target: 'line' | 'step' | 'cropPlan';
  name: string;
  field: string;
  from: string | number | null;
  to: string | number | null;
  status: StatusTag;
  note: string;
}

export interface ResolvedQuestion extends OpenQuestion {
  /** `ask` wants an answer or a waiver; `confirm` wants a yes to figures the platform found. */
  kind: 'ask' | 'confirm';
  waived: boolean;
  confirmed: boolean;
  /** True while the run cannot proceed: unanswered and not waived, or a confirmation not yet given. */
  blocking: boolean;
}

export interface ResolvedVariant {
  source: CropPlanDef;
  /** The variant, library-shaped, with `code` a working code until saved. */
  variant: CropPlanDef;
  /** The variant's estimated study: the source standard with the labor changes applied. */
  study: TimeStudySeed;
  /** The source crop plan's own standard the study was built from, as lines. */
  sourceStudyLines: TimeStudyLine[];
  sourceStudyBasis: 'observed' | 'estimated' | 'built';
  changes: AppliedChange[];
  questions: ResolvedQuestion[];
  /** Refusals: the variant cannot be built as instructed. */
  findings: string[];
  /** No blocking question and no finding. */
  ready: boolean;
  placeholderCount: number;
}

const WORKING_CODE_SUFFIX = '-VARIANT';

function findCropPlan(library: readonly CropPlanDef[], key: string): CropPlanDef | null {
  const byCode = library.find((r) => r.code === key.trim().toUpperCase());
  if (byCode) return byCode;
  const m = matchName(key, library.map((r) => r.name));
  return 'match' in m ? (library.find((r) => r.name === m.match) ?? null) : null;
}

/** A catalog line's pack size as a number when it reads as one ("50 lb", "25"), else null. */
export function packSizeOf(line: Pick<CatalogLine, 'packSize'>): number | null {
  if (!line.packSize) return null;
  const m = line.packSize.match(/(\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) : null;
}

export function resolveProposal(proposal: CropPlanVariantProposal, ctx: ResolveContext): ResolvedVariant | { error: string } {
  const source = findCropPlan(ctx.library, proposal.sourceCropPlan);
  if (!source) return { error: `No library crop plan matches "${proposal.sourceCropPlan || '(none named)'}".` };

  const changes: AppliedChange[] = [];
  const questions: ResolvedQuestion[] = [];
  const findings: string[] = [];
  const asked = new Set<string>();

  const ask = (q: OpenQuestion): boolean => {
    if (asked.has(q.id)) return ctx.waived.has(q.id);
    asked.add(q.id);
    const waived = ctx.waived.has(q.id);
    questions.push({ ...q, kind: 'ask', waived, confirmed: false, blocking: !waived });
    return waived;
  };
  /** A yes-or-no on figures the platform found. Returns true once the reviewer has confirmed. */
  const confirm = (id: string, about: OpenQuestion['about'], field: string, question: string): boolean => {
    const confirmed = ctx.confirmed.has(id);
    if (!asked.has(id)) {
      asked.add(id);
      questions.push({ id, about, field, question, waivable: false, kind: 'confirm', waived: false, confirmed, blocking: !confirmed });
    }
    return confirmed;
  };
  // The parser's own questions (a row it could not read) stand as asked; the model writes none (R6.4).
  for (const q of proposal.openQuestions) ask(q);

  const put = (c: AppliedChange) => changes.push(c);

  // ── Lines ────────────────────────────────────────────────────────────────
  const lines: InputLine[] = structuredClone(source.inputs) as InputLine[];
  const lineNames = () => lines.map((l) => l.name);
  const otherLines = ctx.library.filter((r) => r.code !== source.code).flatMap((r) => r.inputs.map((l) => ({ cropPlan: r, line: l })));

  /** Lines renamed by an earlier change in this proposal, by their original name: the chef may use either name in one instruction. */
  const renamed = new Map<string, InputLine>();
  /** The line a reference means: by its current name, else by the name it had before an earlier change renamed it. */
  const lineByRef = (ref: string): { line: InputLine } | { candidates: string[] } => {
    const m = matchName(ref, lineNames());
    if ('match' in m) return { line: lines.find((l) => l.name === m.match)! };
    const before = matchName(ref, [...renamed.keys()]);
    if ('match' in before) return { line: renamed.get(before.match)! };
    return { candidates: m.candidates };
  };
  const resolveLine = (name: string, what: string): InputLine | null => {
    const found = lineByRef(name);
    if ('line' in found) return found.line;
    const m = { candidates: found.candidates };
    const id = `line-match:${norm(name)}`;
    ask({
      id,
      about: 'line',
      field: 'line',
      question:
        m.candidates.length === 0
          ? `No line on ${source.code} is named "${name}" (${what}). Name one of: ${lineNames().join(', ')}.`
          : `"${name}" (${what}) matches more than one line on ${source.code}: ${m.candidates.join(', ')}. Name one.`,
      waivable: false,
    });
    return null;
  };

  /**
   * What the platform knows about an item by name: an approved catalog line and a
   * line on another crop plan — the crop plan the chef named first ("the marinara from
   * the meatball pack"), then every other crop plan.
   */
  const lookup = (item: string, fromCropPlan?: string) => {
    const cat = matchName(item, ctx.catalog.map((c) => c.item));
    const catalogLine = 'match' in cat ? (ctx.catalog.find((c) => c.item === cat.match) ?? null) : null;
    const catalogCandidates = 'candidates' in cat ? cat.candidates : [];
    const named = fromCropPlan ? findCropPlan(ctx.library, fromCropPlan) : null;
    const pools = named ? [otherLines.filter((o) => o.cropPlan.code === named.code), otherLines] : [otherLines];
    let otherLine: (typeof otherLines)[number] | null = null;
    for (const pool of pools) {
      const other = matchName(item, pool.map((o) => o.line.name));
      if ('match' in other) {
        otherLine = pool.find((o) => o.line.name === other.match) ?? null;
        break;
      }
    }
    return { catalogLine, catalogCandidates, otherLine };
  };

  /** The distinct served components a crop plan's lines belong to, in line order. */
  const componentsOf = (r: CropPlanDef): string[] => [...new Set(r.inputs.map((l) => l.component))];

  /**
   * A served component found in the library, in the order the chef reads it
   *: the crop plan the chef named, else crop plans whose NAME
   * carries the words, else every crop plan's component names. One hit is the
   * component; several is a question listing them; none is null.
   */
  type ComponentHit = { cropPlan: CropPlanDef; component: string };
  const findComponent = (query: string, fromCropPlan: string | undefined, exclude: CropPlanDef | null): { hit: ComponentHit } | { candidates: ComponentHit[] } => {
    const named = fromCropPlan ? findCropPlan(ctx.library, fromCropPlan) : null;
    const pool = named ? [named] : ctx.library.filter((r) => r !== exclude);
    const hitsIn = (rs: readonly CropPlanDef[]): ComponentHit[] => {
      const out: ComponentHit[] = [];
      for (const r of rs) {
        const m = matchName(query, componentsOf(r));
        if ('match' in m) out.push({ cropPlan: r, component: m.match });
        else for (const c of m.candidates) out.push({ cropPlan: r, component: c });
      }
      return out;
    };
    // 1. The named crop plan's components; 2. crop plans whose name carries the words; 3. every crop plan.
    let hits = named ? hitsIn([named]) : [];
    if (hits.length === 0 && !named) {
      const byName = pool.filter((r) => 'match' in matchName(query, [r.name, r.code]));
      hits = hitsIn(byName);
      if (hits.length === 0 && byName.length === 1) {
        // The crop plan is named after the dish; the component the chef means is the one sharing a word with it.
        const qw = words(query);
        const sharing = componentsOf(byName[0]!).filter((c) => words(c).some((w) => qw.includes(w)));
        hits = sharing.map((component) => ({ cropPlan: byName[0]!, component }));
      }
    }
    if (hits.length === 0) hits = hitsIn(pool);
    if (hits.length === 1) return { hit: hits[0]! };
    return { candidates: hits };
  };

  /** A component name on the source crop plan, or null; ambiguity is impossible since components are distinct. */
  const componentOnSource = (ref: string): string | null => {
    const m = matchName(ref, componentsOf(source));
    return 'match' in m ? m.match : null;
  };

  /** Component swaps confirmed on the lines, to carry into the labor standard once the steps exist. */
  const componentSwaps: { oldComponent: string | null; hit: ComponentHit }[] = [];
  /** Components emptied by a removed line: their steps leave with them. */
  const componentsEmptied: { component: string; line: string }[] = [];

  /**
   * Swap one served component for another found in the library: the source
   * lines of the old component go, the found component's lines come across
   * scaled to this crop plan's sowing by units, each with its own provenance and
   * the catalog's price where an approved line matches. One confirmation, listing
   * every line that moves. Returns false when nothing matched a component.
   */
  const swapComponent = (oldRef: string, newRef: string, fromCropPlan: string | undefined): boolean => {
    const oldComponent = componentOnSource(oldRef);
    if (!oldComponent) return false;
    const found = findComponent(newRef, fromCropPlan, source);
    if ('candidates' in found) {
      if (found.candidates.length === 0) return false;
      ask({
        id: `component-match:${norm(newRef)}`,
        about: 'cropPlan',
        field: 'component',
        question: `"${newRef}" matches more than one served component: ${found.candidates.map((h) => `${h.component} (${h.cropPlan.code} ${h.cropPlan.name})`).join('; ')}. Name the crop plan it comes from.`,
        waivable: false,
      });
      return true;
    }
    const { cropPlan: from, component } = found.hit;
    const moving = from.inputs.filter((l) => l.component === component);
    const scale = from.sowingUnits > 0 ? source.sowingUnits / from.sowingUnits : 1;
    const id = `component:${norm(oldComponent)}:use:${from.code}:${norm(component)}`;
    const listed = moving.map((l) => `${l.name} ${fmtNum(l.seedQtyPerSowing)} ${l.unit}`).join(', ');
    const question =
      `"${component}" is a served component of ${from.code} ${from.name}: ${listed} per ${from.sowingUnits}-unit sowing. ` +
      `Use it in place of "${oldComponent}" (${lines.filter((l) => l.component === oldComponent).map((l) => l.name).join(', ')})? ` +
      `Its lines scale to ${source.code}'s ${source.sowingUnits}-unit sowing by units, and its prep and sow steps come across from ${from.code}'s labor standard.`;
    if (!confirm(id, 'cropPlan', 'component', question)) return true;
    for (const l of lines.filter((l) => l.component === oldComponent)) {
      lines.splice(lines.indexOf(l), 1);
      put({ target: 'line', name: l.name, field: 'line', from: l.name, to: null, status: 'STATED', note: `Removed with the component "${oldComponent}", as instructed.` });
    }
    const cite = `${from.code} "${component}"`;
    for (const src of moving) {
      const l = structuredClone(src) as InputLine;
      l.seedQtyPerSowing = src.seedQtyPerSowing * scale;
      l.harvestedYieldPerSowing = l.seedQtyPerSowing * l.yieldToHarvest;
      const cat = matchName(l.name, ctx.catalog.map((c) => c.item));
      const catalogLine = 'match' in cat ? (ctx.catalog.find((c) => c.item === cat.match) ?? null) : null;
      const price = catalogLine ? priceInForceOn(catalogLine.prices, ctx.asOf) : null;
      if (catalogLine && price && price.unitPrice !== null) {
        const supplier = ctx.supplierNames[catalogLine.supplierId] ?? catalogLine.supplierId;
        l.seedUnitCost = price.unitPrice;
        l.status = 'SOURCED';
        l.source = `Supplier catalog: ${catalogLine.item} (${supplier}), in force from ${price.effectiveFrom}.`;
      } else {
        l.source = `${cite}: ${src.source}`;
      }
      l.yieldSource = `${cite}: ${src.yieldSource}`;
      lines.push(l);
      put({ target: 'line', name: l.name, field: 'line', from: null, to: l.name, status: 'DERIVED', note: `${cite}: ${fmtNum(src.seedQtyPerSowing)} ${src.unit} per ${from.sowingUnits} units × ${source.sowingUnits} ÷ ${from.sowingUnits} = ${fmtNum(l.seedQtyPerSowing)} ${l.unit}.` });
      put({ target: 'line', name: l.name, field: 'seedUnitCost', from: null, to: l.seedUnitCost, status: l.status, note: l.source });
      put({ target: 'line', name: l.name, field: 'yieldToHarvest', from: null, to: l.yieldToHarvest, status: l.yieldStatus, note: l.yieldSource });
      put({ target: 'line', name: l.name, field: 'nutrition', from: null, to: l.nutrition?.component ?? null, status: l.nutrition?.status ?? 'STATED', note: `Nutrition as on ${cite}.` });
    }
    componentSwaps.push({ oldComponent, hit: found.hit });
    return true;
  };

  const setPrice = (line: InputLine, stated: number | undefined, found: ReturnType<typeof lookup>, fallback: { value: number; label: string }) => {
    const before = line.seedUnitCost;
    if (stated !== undefined) {
      line.seedUnitCost = stated;
      line.status = 'STATED';
      line.source = 'Stated in the instruction.';
      put({ target: 'line', name: line.name, field: 'seedUnitCost', from: before, to: stated, status: 'STATED', note: 'Stated in the instruction.' });
      return;
    }
    if (found.catalogLine) {
      const p = priceInForceOn(found.catalogLine.prices, ctx.asOf);
      if (p && p.unitPrice !== null) {
        const supplier = ctx.supplierNames[found.catalogLine.supplierId] ?? found.catalogLine.supplierId;
        line.seedUnitCost = p.unitPrice;
        line.status = 'SOURCED';
        line.source = `Supplier catalog: ${found.catalogLine.item} (${supplier}), in force from ${p.effectiveFrom}.`;
        put({ target: 'line', name: line.name, field: 'seedUnitCost', from: before, to: p.unitPrice, status: 'SOURCED', note: line.source });
        return;
      }
    }
    const id = `line:${norm(line.name)}:seedUnitCost`;
    const question =
      found.catalogCandidates.length > 0
        ? `"${line.name}" matches more than one catalog line (${found.catalogCandidates.join(', ')}) — which prices it, or what is its price per ${line.unit}?`
        : `No approved catalog line prices "${line.name}". What is its price per ${line.unit}?`;
    const waived = ask({ id, about: 'catalog', field: 'seedUnitCost', question, waivable: true });
    if (waived) {
      line.seedUnitCost = fallback.value;
      line.status = 'PLACEHOLDER';
      line.source = `Waived: ${question} Carried at ${fallback.label}.`;
      put({ target: 'line', name: line.name, field: 'seedUnitCost', from: before, to: fallback.value, status: 'PLACEHOLDER', note: line.source });
    }
  };

  const setYield = (line: InputLine, stated: number | undefined, found: ReturnType<typeof lookup>, fallback: { value: number; label: string }) => {
    const before = line.yieldToHarvest;
    if (stated !== undefined) {
      line.yieldToHarvest = stated;
      line.yieldStatus = 'STATED';
      line.yieldSource = 'Stated in the instruction.';
      put({ target: 'line', name: line.name, field: 'yieldToHarvest', from: before, to: stated, status: 'STATED', note: line.yieldSource });
      return;
    }
    const id = `line:${norm(line.name)}:yieldToHarvest`;
    const question = `What is the yield to harvest of "${line.name}" (harvested weight over as-purchased, as a multiplier)? The source line's factor is a composite and is not split.`;
    const waived = ask({ id, about: 'line', field: 'yieldToHarvest', question, waivable: true });
    if (waived) {
      line.yieldToHarvest = fallback.value;
      line.yieldStatus = 'PLACEHOLDER';
      line.yieldSource = `Waived: ${question} Carried at ${fallback.label}.`;
      put({ target: 'line', name: line.name, field: 'yieldToHarvest', from: before, to: fallback.value, status: 'PLACEHOLDER', note: line.yieldSource });
    }
  };

  const fmtNum = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(3).replace(/0+$/, '').replace(/\.$/, ''));

  /**
   * The one question a found line raises: use it as the basis? Confirmed, its
   * yield, price (the catalog's where one prices it), pack size, nutrition,
   * traceability flag and hot flag come across, each with its own provenance;
   * the quantity is `qty` when already settled (stated, or derived from the raw
   * line's trim yield), else the found line's per-unit quantity scaled to this
   * crop plan's authored sowing. Nothing is asked twice.
   */
  const adoptFoundLine = (line: InputLine, found: ReturnType<typeof lookup>, qty: { value: number; settled: boolean }, stated: { yield?: number; price?: number; packSize?: number; ftl?: string }): boolean => {
    const o = found.otherLine!;
    const id = `line:${norm(line.name)}:use:${o.cropPlan.code}`;
    const scale = o.cropPlan.sowingUnits > 0 ? source.sowingUnits / o.cropPlan.sowingUnits : 1;
    const scaled = o.line.seedQtyPerSowing * scale;
    const cat = found.catalogLine ? priceInForceOn(found.catalogLine.prices, ctx.asOf) : null;
    const price = stated.price ?? (cat && cat.unitPrice !== null ? cat.unitPrice : o.line.seedUnitCost);
    const question =
      `"${o.line.name}" is a line on ${o.cropPlan.code} ${o.cropPlan.name}: ${fmtNum(o.line.seedQtyPerSowing)} ${o.line.unit} per ${o.cropPlan.sowingUnits}-unit sowing, ` +
      `yield to harvest ${fmtNum(o.line.yieldToHarvest)} (${o.line.yieldStatus.toLowerCase()}), $${price.toFixed(2)}/${o.line.unit} (${cat && cat.unitPrice !== null && stated.price === undefined ? 'catalog' : o.line.status.toLowerCase()}), pack ${fmtNum(o.line.packSize)}. ` +
      `Use it as the basis for this line?` +
      (qty.settled ? '' : ` The quantity scales to ${source.code}'s ${source.sowingUnits}-unit sowing by units: ${fmtNum(scaled)} ${o.line.unit}.`);
    if (!confirm(id, 'line', 'basis', question)) return false;
    const cite = `${o.cropPlan.code} "${o.line.name}"`;
    if (!qty.settled) {
      const before = line.seedQtyPerSowing;
      line.seedQtyPerSowing = scaled;
      if (line.unit !== o.line.unit) line.unit = o.line.unit;
      put({ target: 'line', name: line.name, field: 'seedQtyPerSowing', from: before, to: scaled, status: 'DERIVED', note: `${cite}: ${fmtNum(o.line.seedQtyPerSowing)} ${o.line.unit} per ${o.cropPlan.sowingUnits} units × ${source.sowingUnits} ÷ ${o.cropPlan.sowingUnits}.` });
    }
    if (stated.yield === undefined) {
      const before = line.yieldToHarvest;
      line.yieldToHarvest = o.line.yieldToHarvest;
      line.yieldStatus = o.line.yieldStatus;
      line.yieldSource = `${cite}: ${o.line.yieldSource}`;
      if (o.line.trimYield !== undefined) line.trimYield = o.line.trimYield;
      put({ target: 'line', name: line.name, field: 'yieldToHarvest', from: before, to: o.line.yieldToHarvest, status: o.line.yieldStatus, note: line.yieldSource });
    }
    if (stated.price === undefined) {
      const before = line.seedUnitCost;
      if (cat && cat.unitPrice !== null) {
        const supplier = ctx.supplierNames[found.catalogLine!.supplierId] ?? found.catalogLine!.supplierId;
        line.seedUnitCost = cat.unitPrice;
        line.status = 'SOURCED';
        line.source = `Supplier catalog: ${found.catalogLine!.item} (${supplier}), in force from ${cat.effectiveFrom}.`;
      } else {
        line.seedUnitCost = o.line.seedUnitCost;
        line.status = o.line.status;
        line.source = `${cite}: ${o.line.source}`;
      }
      put({ target: 'line', name: line.name, field: 'seedUnitCost', from: before, to: line.seedUnitCost, status: line.status, note: line.source });
    }
    if (stated.packSize === undefined) {
      const before = line.packSize;
      const ps = found.catalogLine ? packSizeOf(found.catalogLine) : null;
      line.packSize = ps ?? o.line.packSize;
      put({ target: 'line', name: line.name, field: 'packSize', from: before, to: line.packSize, status: ps !== null ? 'SOURCED' : o.line.status, note: ps !== null ? `Supplier catalog: ${found.catalogLine!.item}, pack "${found.catalogLine!.packSize}".` : `${cite}.` });
    }
    line.nutrition = structuredClone(o.line.nutrition);
    line.isHotComponent = o.line.isHotComponent;
    if (o.line.unitMassOz !== undefined) line.unitMassOz = o.line.unitMassOz;
    if (o.line.foodTraceabilityList !== undefined) line.foodTraceabilityList = o.line.foodTraceabilityList;
    else delete line.foodTraceabilityList;
    if (stated.ftl !== undefined) line.foodTraceabilityList = stated.ftl;
    put({ target: 'line', name: line.name, field: 'nutrition', from: null, to: line.nutrition?.component ?? null, status: line.nutrition?.status ?? 'STATED', note: `Nutrition as on ${cite}.` });
    put({ target: 'line', name: line.name, field: 'foodTraceabilityList', from: null, to: line.foodTraceabilityList ?? null, status: 'STATED', note: stated.ftl !== undefined ? 'Stated in the instruction.' : o.line.foodTraceabilityList !== undefined ? `On the Food Traceability List as ${cite} sets it.` : `Not on the Food Traceability List, as ${cite} sets it.` });
    return true;
  };

  /** Replace one line's item with another, finding the new item's figures in the order find → derive → ask. */
  type ReplaceChange = Extract<LineChange, { kind: 'replace' }>;
  const applyReplace = (c: ReplaceChange): void => {
    // The chef may have named served components rather than lines: a component on this
    // crop plan for the line, or a component elsewhere for the item. Components are the unit.
    const lineMatch = lineByRef(c.line);
    const matchedLine = 'line' in lineMatch ? lineMatch.line : null;
    const oldIsComponent = matchedLine === null && componentOnSource(c.line) !== null;
    const newLookup = lookup(c.withItem);
    const compFound = findComponent(c.withItem, c.fromCropPlan, source);
    const newIsComponent = !newLookup.otherLine && !newLookup.catalogLine && ('hit' in compFound || compFound.candidates.length > 0);
    if (oldIsComponent || (newIsComponent && matchedLine !== null)) {
      const oldRef = oldIsComponent ? c.line : matchedLine!.component;
      if (swapComponent(oldRef, c.withItem, c.fromCropPlan)) return;
    }
    const line = resolveLine(c.line, 'replace');
    if (!line) return;
    const raw = structuredClone(line) as InputLine;
    const found = newLookup;
    line.name = found.otherLine ? found.otherLine.line.name : c.withItem;
    line.component = raw.component;
    renamed.set(raw.name, line);
    put({ target: 'line', name: raw.name, field: 'line', from: raw.name, to: line.name, status: 'STATED', note: 'Replaced as instructed.' });
    if (c.unit !== undefined) line.unit = c.unit;
    if (c.spec !== undefined) line.spec = c.spec;
    else if (found.otherLine) line.spec = found.otherLine.line.spec;
    else if (found.catalogLine?.variety) line.spec = found.catalogLine.variety;
    // A prepared item carries no trim step of its own unless the found line carries one.
    delete line.trimYield;
    // Quantity: stated, else derived from the raw line's separate trim yield, else the found line scaled, else asked.
    let qtySettled = false;
    if (c.seedQtyPerSowing !== undefined) {
      line.seedQtyPerSowing = c.seedQtyPerSowing;
      qtySettled = true;
      put({ target: 'line', name: line.name, field: 'seedQtyPerSowing', from: raw.seedQtyPerSowing, to: c.seedQtyPerSowing, status: 'STATED', note: 'Stated in the instruction.' });
    } else if (raw.trimYield !== undefined && raw.unit === line.unit) {
      line.seedQtyPerSowing = raw.seedQtyPerSowing * raw.trimYield;
      qtySettled = true;
      put({
        target: 'line',
        name: line.name,
        field: 'seedQtyPerSowing',
        from: raw.seedQtyPerSowing,
        to: line.seedQtyPerSowing,
        status: 'DERIVED',
        note: `${raw.seedQtyPerSowing} ${raw.unit} of ${raw.name} × trim yield ${raw.trimYield} = the prepared pounds that replace it.`,
      });
    }
    if (c.yieldToHarvest !== undefined) setYield(line, c.yieldToHarvest, found, { value: raw.yieldToHarvest, label: 'the raw line’s yield' });
    if (c.seedUnitCost !== undefined) setPrice(line, c.seedUnitCost, found, { value: raw.seedUnitCost, label: 'the raw line’s price' });
    if (c.packSize !== undefined) {
      line.packSize = c.packSize;
      put({ target: 'line', name: line.name, field: 'packSize', from: raw.packSize, to: c.packSize, status: 'STATED', note: 'Stated in the instruction.' });
    }
    if (found.otherLine) {
      // Found on another crop plan: one question, and its figures come across on a yes.
      adoptFoundLine(line, found, { value: line.seedQtyPerSowing, settled: qtySettled }, { yield: c.yieldToHarvest, price: c.seedUnitCost, packSize: c.packSize, ftl: c.foodTraceabilityList });
      return;
    }
    if (!qtySettled) {
      const id = `line:${norm(line.name)}:seedQtyPerSowing`;
      const question = `How much "${line.name}" replaces ${raw.seedQtyPerSowing} ${raw.unit} of ${raw.name} per ${source.sowingUnits}-unit sowing? ${raw.name} carries no separate trim yield, so the prepared quantity is not derived.`;
      if (ask({ id, about: 'line', field: 'seedQtyPerSowing', question, waivable: true })) {
        put({ target: 'line', name: line.name, field: 'seedQtyPerSowing', from: raw.seedQtyPerSowing, to: raw.seedQtyPerSowing, status: 'PLACEHOLDER', note: `Waived: ${question}` });
      }
    }
    // Pack size: stated above, else the catalog line's, else the raw line's as a placeholder.
    if (c.packSize === undefined) {
      const ps = found.catalogLine ? packSizeOf(found.catalogLine) : null;
      if (ps !== null) {
        line.packSize = ps;
        put({ target: 'line', name: line.name, field: 'packSize', from: raw.packSize, to: ps, status: 'SOURCED', note: `Supplier catalog: ${found.catalogLine!.item}, pack "${found.catalogLine!.packSize}".` });
      } else {
        put({ target: 'line', name: line.name, field: 'packSize', from: raw.packSize, to: raw.packSize, status: 'PLACEHOLDER', note: 'No pack size stated or on a catalog line; the raw line’s pack size stands until one is.' });
      }
    }
    if (c.yieldToHarvest === undefined) setYield(line, undefined, found, { value: raw.yieldToHarvest, label: 'the raw line’s yield' });
    if (c.seedUnitCost === undefined) setPrice(line, undefined, found, { value: raw.seedUnitCost, label: 'the raw line’s price' });
    put({ target: 'line', name: line.name, field: 'nutrition', from: raw.nutrition?.component ?? null, to: raw.nutrition?.component ?? null, status: raw.nutrition?.status ?? 'STATED', note: `Nutrition carried from ${raw.name}: the same component in a different form.` });
    askFtl(line, c.foodTraceabilityList);
    return;
  };

  const NOT_LISTED = /^\s*(not (on the )?list(ed)?|none|no|out of scope|n\/a|off the list)\s*\.?\s*$/i;
  const askFtl = (line: InputLine, stated: string | undefined) => {
    if (stated !== undefined) {
      if (NOT_LISTED.test(stated)) {
        delete line.foodTraceabilityList;
        put({ target: 'line', name: line.name, field: 'foodTraceabilityList', from: null, to: null, status: 'STATED', note: 'Not on the Food Traceability List, as stated.' });
        return;
      }
      const m = matchName(stated, FOOD_TRACEABILITY_LIST_CATEGORIES);
      const category = 'match' in m ? m.match : stated;
      line.foodTraceabilityList = category;
      put({ target: 'line', name: line.name, field: 'foodTraceabilityList', from: null, to: category, status: 'STATED', note: 'Stated in the instruction.' });
      return;
    }
    const id = `line:${norm(line.name)}:ftl`;
    const waived = ask({
      id,
      about: 'line',
      field: 'foodTraceabilityList',
      question: `Is "${line.name}" on the FDA Food Traceability List (21 CFR 1.1990)? Answer with its category — ${FOOD_TRACEABILITY_LIST_CATEGORIES.join('; ')} — or "not listed". It is set per line, never read from the name; fresh-cut produce is in scope where whole produce may not be.`,
      waivable: true,
    });
    if (waived) {
      delete line.foodTraceabilityList;
      put({ target: 'line', name: line.name, field: 'foodTraceabilityList', from: null, to: null, status: 'PLACEHOLDER', note: 'Waived: traceability status unset until stated.' });
    }
  };

  /** Processing changes confirmed on the lines, to apply to the component's step once the steps exist (R6.3). */
  type ProcessingEdit = { component: string; step: 'prep' | 'sow'; removeStep: boolean; laborMinutes?: number; elapsedMinutes?: number; staff?: number; ref: string };
  const processingEdits: ProcessingEdit[] = [];

  for (const c of proposal.lineChanges) {
    if (c.kind === 'swapComponent') {
      if (!swapComponent(c.component, c.withComponent, c.fromCropPlan)) {
        const oldOk = componentOnSource(c.component) !== null;
        ask({
          id: `component-match:${norm(oldOk ? c.withComponent : c.component)}`,
          about: 'cropPlan',
          field: 'component',
          question: oldOk
            ? `No served component in the library is named "${c.withComponent}"${c.fromCropPlan ? ` on ${c.fromCropPlan}` : ''}. Name the crop plan it comes from, or describe its inputs.`
            : `No served component on ${source.code} is named "${c.component}". Its components are: ${componentsOf(source).join(', ')}.`,
          waivable: false,
        });
      }
      continue;
    }
    if (c.kind === 'remove') {
      const line = resolveLine(c.line, 'remove');
      if (!line) continue;
      const hotLeft = lines.filter((l) => l.isHotComponent && l !== line);
      if (line.isHotComponent && hotLeft.length === 0) {
        findings.push(`"${line.name}" is the only hot component on ${source.code}; a crop plan with no hot component has no canopy mass and cannot be sowing-sized.`);
        continue;
      }
      lines.splice(lines.indexOf(line), 1);
      put({ target: 'line', name: line.name, field: 'line', from: line.name, to: null, status: 'STATED', note: 'Removed as instructed.' });
      if (!lines.some((l) => l.component === line.component)) componentsEmptied.push({ component: line.component, line: line.name });
      continue;
    }
    if (c.kind === 'edit') {
      const line = resolveLine(c.line, 'edit');
      if (!line) continue;
      const found = lookup(line.name);
      if (c.seedQtyPerSowing === undefined && c.packSize === undefined && c.spec === undefined && c.yieldToHarvest === undefined && c.seedUnitCost === undefined) {
        // The chef changed something on the line without stating a figure ("about half the chicken").
        ask({ id: `line:${norm(line.name)}:edit`, about: 'line', field: 'seedQtyPerSowing', question: `The instruction changes "${line.name}" (now ${fmtNum(line.seedQtyPerSowing)} ${line.unit} per ${source.sowingUnits}-unit sowing) but states no figure. State the quantity, or waive to leave the line as it is.`, waivable: true });
        continue;
      }
      if (c.seedQtyPerSowing !== undefined) {
        put({ target: 'line', name: line.name, field: 'seedQtyPerSowing', from: line.seedQtyPerSowing, to: c.seedQtyPerSowing, status: 'STATED', note: 'Stated in the instruction.' });
        line.seedQtyPerSowing = c.seedQtyPerSowing;
      }
      if (c.packSize !== undefined) {
        put({ target: 'line', name: line.name, field: 'packSize', from: line.packSize, to: c.packSize, status: 'STATED', note: 'Stated in the instruction.' });
        line.packSize = c.packSize;
      }
      if (c.spec !== undefined) {
        put({ target: 'line', name: line.name, field: 'spec', from: line.spec, to: c.spec, status: 'STATED', note: 'Stated in the instruction.' });
        line.spec = c.spec;
      }
      if (c.yieldToHarvest !== undefined) setYield(line, c.yieldToHarvest, found, { value: line.yieldToHarvest, label: 'the source line’s yield' });
      if (c.seedUnitCost !== undefined) setPrice(line, c.seedUnitCost, found, { value: line.seedUnitCost, label: 'the source line’s price' });
      continue;
    }
    if (c.kind === 'replace') {
      applyReplace(c);
      continue;
    }
    if (c.kind === 'changeProcessing') {
      // The line named, or every line of the component named.
      const lineMatch = lineByRef(c.line);
      const line = 'line' in lineMatch ? lineMatch.line : null;
      const lineCandidates = 'candidates' in lineMatch ? lineMatch.candidates : [];
      const component = line ? line.component : componentOnSource(c.line);
      if (!component) {
        ask({
          id: `line-match:${norm(c.line)}`,
          about: 'line',
          field: 'line',
          question:
            lineCandidates.length === 0
              ? `Nothing on ${source.code} is named "${c.line}" (its form changes). Its lines are: ${lineNames().join(', ')}; its served components: ${componentsOf(source).join(', ')}.`
              : `"${c.line}" (its form changes) matches more than one line on ${source.code}: ${lineCandidates.join(', ')}. Name one.`,
          waivable: false,
        });
        continue;
      }
      if (c.withItem !== undefined) {
        if (!line) {
          const ofComponent = lines.filter((l) => l.component === component).map((l) => l.name);
          if (ofComponent.length !== 1) {
            ask({ id: `line-match:${norm(c.line)}`, about: 'line', field: 'line', question: `"${c.line}" is a served component of ${source.code} with ${ofComponent.length} lines (${ofComponent.join(', ')}). Which line becomes "${c.withItem}"?`, waivable: false });
            continue;
          }
        }
        const { kind: _k, step: _s, removeStep: _r, laborMinutes: _lm, elapsedMinutes: _em, staff: _st, withItem, line: ref, ...rest } = c;
        applyReplace({ kind: 'replace', line: line ? line.name : lines.find((l) => l.component === component)!.name, withItem, ...rest });
      }
      processingEdits.push({ component, step: c.step, removeStep: c.removeStep, laborMinutes: c.laborMinutes, elapsedMinutes: c.elapsedMinutes, staff: c.staff, ref: c.line });
      continue;
    }
    // add
    const dup = matchName(c.name, lineNames());
    if ('match' in dup) {
      ask({ id: `line-add-exists:${norm(c.name)}`, about: 'line', field: 'line', question: `"${c.name}" is already a line on ${source.code} ("${dup.match}"). Edit it, or name the added line differently.`, waivable: false });
      continue;
    }
    const found = lookup(c.name, c.fromCropPlan);
    const line: InputLine = {
      name: c.name,
      spec: c.spec || (found.otherLine?.line.spec ?? found.catalogLine?.variety ?? ''),
      seedQtyPerSowing: c.seedQtyPerSowing,
      unit: c.unit,
      yieldToHarvest: 1,
      harvestedYieldPerSowing: 0,
      seedUnitCost: 0,
      packSize: 1,
      isHotComponent: c.isHotComponent,
      status: 'PLACEHOLDER',
      source: 'Placeholder, quote required',
      yieldStatus: 'PLACEHOLDER',
      yieldSource: 'Unsourced working figure',
      nutrition: { component: 'NONE', status: 'PLACEHOLDER', source: 'Not credited until a component is assigned.' },
      component: c.name,
    };
    put({ target: 'line', name: line.name, field: 'line', from: null, to: line.name, status: 'STATED', note: `Added as instructed: ${c.seedQtyPerSowing} ${c.unit} per ${source.sowingUnits}-unit sowing.` });
    if (found.otherLine) {
      line.name = found.otherLine.line.name;
      if (c.yieldToHarvest !== undefined) setYield(line, c.yieldToHarvest, found, { value: 1, label: 'a yield of 1.0' });
      if (c.seedUnitCost !== undefined) setPrice(line, c.seedUnitCost, found, { value: 0, label: 'zero' });
      if (c.packSize !== undefined) {
        line.packSize = c.packSize;
        put({ target: 'line', name: line.name, field: 'packSize', from: null, to: c.packSize, status: 'STATED', note: 'Stated in the instruction.' });
      }
      if (adoptFoundLine(line, found, { value: c.seedQtyPerSowing, settled: true }, { yield: c.yieldToHarvest, price: c.seedUnitCost, packSize: c.packSize, ftl: c.foodTraceabilityList })) {
        // The line's prep and sow steps come across from the crop plan it was found on, with it.
        line.component = found.otherLine!.line.component;
        componentSwaps.push({ oldComponent: null, hit: { cropPlan: found.otherLine!.cropPlan, component: found.otherLine!.line.component } });
      }
      lines.push(line);
      continue;
    }
    if (line.isHotComponent) {
      const id = `line:${norm(line.name)}:steps`;
      const question = `"${line.name}" is new to ${source.code}, whose labor standard has no prep or sow step for it. State its steps with minutes and staff, or waive to carry no minutes for it.`;
      if (ask({ id, about: 'step', field: 'step', question, waivable: true })) {
        put({ target: 'step', name: line.name, field: 'step', from: null, to: null, status: 'PLACEHOLDER', note: `Waived: ${question}` });
      }
    }
    if (c.packSize !== undefined) {
      line.packSize = c.packSize;
      put({ target: 'line', name: line.name, field: 'packSize', from: null, to: c.packSize, status: 'STATED', note: 'Stated in the instruction.' });
    } else {
      const ps = found.catalogLine ? packSizeOf(found.catalogLine) : null;
      if (ps !== null) {
        line.packSize = ps;
        put({ target: 'line', name: line.name, field: 'packSize', from: null, to: ps, status: 'SOURCED', note: `Supplier catalog: ${found.catalogLine!.item}.` });
      } else {
        put({ target: 'line', name: line.name, field: 'packSize', from: null, to: 1, status: 'PLACEHOLDER', note: 'No pack size stated or on file; 1 per pack until stated.' });
      }
    }
    setYield(line, c.yieldToHarvest, found, { value: 1, label: 'a yield of 1.0' });
    setPrice(line, c.seedUnitCost, found, { value: 0, label: 'zero' });
    {
      const id = `line:${norm(line.name)}:nutrition`;
      const question = `How does "${line.name}" credit toward the nutrient profile (meat/meat alternate, grains, vegetable and subgroup, fruit, or none), and at what harvested cup weight? It is never read from the name.`;
      if (ask({ id, about: 'line', field: 'nutrition', question, waivable: true })) {
        put({ target: 'line', name: line.name, field: 'nutrition', from: null, to: 'NONE', status: 'PLACEHOLDER', note: `Waived: ${question}` });
      }
    }
    askFtl(line, c.foodTraceabilityList);
    lines.push(line);
  }

  // ── Labor ────────────────────────────────────────────────────────────────
  const own = ctx.studies === null ? null : studiesForCropPlan(ctx.studies, source.code);
  const standard = own === null ? null : laborStandard(own);
  const base: TimeStudySeed = standard
    ? { studiedOn: standard.studiedOn, sowingSize: standard.sowingSize, observer: standard.observer, qualityResult: standard.qualityResult, qualityNotes: standard.qualityNotes, basis: standard.basis, lines: structuredClone(standard.lines) as TimeStudyLine[] }
    : estimatedTimeStudy(source, ctx.sowingSize);
  const sourceStudyBasis: ResolvedVariant['sourceStudyBasis'] = standard ? (standard.basis === 'observed' && standard.adoptedAt ? 'observed' : 'estimated') : 'built';
  const sourceStudyLines = structuredClone(base.lines) as TimeStudyLine[];
  const steps: TimeStudyLine[] = structuredClone(base.lines) as TimeStudyLine[];
  const stepNames = () => steps.map((s) => s.task);

  // A swapped component takes its prep, sow and assembly steps with it: the old
  // component's steps leave the standard where they sat, and the found crop plan's
  // steps for the new component take their place, variable minutes rescaled from
  // the sowing that standard was written at to this one.
  /** Steps that already left the standard with a component or a removed line, by task. */
  const departed: string[] = [];
  const mentions = (task: string, component: string) => norm(task).includes(norm(component)) || (words(component).length > 0 && contains(words(task), words(component)));
  for (const { component, line } of componentsEmptied) {
    for (const s of steps.filter((s) => mentions(s.task, component))) {
      steps.splice(steps.indexOf(s), 1);
      put({ target: 'step', name: s.task, field: 'step', from: `${fmtNum(s.laborMinutes)} min`, to: null, status: 'DERIVED', note: `Left with "${line}", the last line of the component "${component}".` });
      departed.push(s.task);
    }
  }
  const isComponentStep = (s: TimeStudyLine) => words(s.task).some((w) => w === 'prep' || w === 'sow');
  for (const { oldComponent, hit } of componentSwaps) {
    const fromOwn = ctx.studies === null ? null : laborStandard(studiesForCropPlan(ctx.studies, hit.cropPlan.code));
    const fromStudy: TimeStudySeed = fromOwn
      ? { studiedOn: fromOwn.studiedOn, sowingSize: fromOwn.sowingSize, observer: fromOwn.observer, qualityResult: fromOwn.qualityResult, qualityNotes: fromOwn.qualityNotes, basis: fromOwn.basis, lines: fromOwn.lines }
      : estimatedTimeStudy(hit.cropPlan, ctx.sowingSize);
    const fromBasis = fromOwn ? (fromOwn.basis === 'observed' && fromOwn.adoptedAt ? 'observed standard' : 'estimated standard') : 'built estimate';
    const ratio = fromStudy.sowingSize > 0 ? base.sowingSize / fromStudy.sowingSize : 1;
    const leaving = oldComponent === null ? [] : steps.filter((s) => mentions(s.task, oldComponent));
    const lastComponentStep = steps.map((s, i) => (isComponentStep(s) ? i : -1)).filter((i) => i >= 0).pop();
    const at = leaving.length > 0 ? steps.indexOf(leaving[0]!) : lastComponentStep === undefined ? steps.length : lastComponentStep + 1;
    for (const s of leaving) {
      steps.splice(steps.indexOf(s), 1);
      put({ target: 'step', name: s.task, field: 'step', from: `${fmtNum(s.laborMinutes)} min`, to: null, status: 'STATED', note: `Left with the component "${oldComponent}".` });
      departed.push(s.task);
    }
    const arriving = fromStudy.lines.filter((s) => mentions(s.task, hit.component)).map((s) => ({
      ...structuredClone(s),
      laborMinutes: s.scalesWith === 'variable' ? s.laborMinutes * ratio : s.laborMinutes,
      elapsedMinutes: s.scalesWith === 'variable' ? s.elapsedMinutes * ratio : s.elapsedMinutes,
    }));
    steps.splice(at, 0, ...arriving);
    for (const s of arriving) {
      put({ target: 'step', name: s.task, field: 'step', from: null, to: `${fmtNum(s.laborMinutes)} min, ${s.staff} staff, ${s.scalesWith}, ${s.stream}`, status: 'DERIVED', note: `From ${hit.cropPlan.code}'s ${fromBasis}${s.scalesWith === 'variable' && Math.abs(ratio - 1) > 1e-9 ? `, variable minutes × ${fmtNum(ratio)} for the sowing` : ''}.` });
    }
    if (arriving.length === 0) {
      ask({ id: `component-steps:${norm(hit.component)}`, about: 'step', field: 'laborMinutes', question: `${hit.cropPlan.code}'s labor standard has no step naming "${hit.component}", so no prep or sow minutes came across with it. State the minutes for its prep and sow, or waive to carry none.`, waivable: true });
    }
  }

  const resolveStep = (name: string, what: string): TimeStudyLine | null => {
    const m = matchName(name, stepNames());
    if ('match' in m) return steps.find((s) => s.task === m.match)!;
    ask({
      id: `step-match:${norm(name)}`,
      about: 'step',
      field: 'step',
      question:
        m.candidates.length === 0
          ? `No step on ${source.code}'s labor standard is named "${name}" (${what}). Name one of: ${stepNames().join('; ')}.`
          : `"${name}" (${what}) matches more than one step: ${m.candidates.join('; ')}. Name one.`,
      waivable: false,
    });
    return null;
  };

  /** The body of a step edit: each stated figure set and tagged STATED; elapsed minutes derived from the staff count when only labor minutes are stated. */
  const editStep = (step: TimeStudyLine, c: { laborMinutes?: number; elapsedMinutes?: number; staff?: number; scalesWith?: 'fixed' | 'variable'; station?: string }): void => {
    // Staff first, so elapsed minutes derive from the stated crew when only labor minutes are given.
    if (c.staff !== undefined) {
      put({ target: 'step', name: step.task, field: 'staff', from: step.staff, to: c.staff, status: 'STATED', note: 'Stated in the instruction.' });
      step.staff = c.staff;
    }
    if (c.laborMinutes !== undefined) {
      put({ target: 'step', name: step.task, field: 'laborMinutes', from: step.laborMinutes, to: c.laborMinutes, status: 'STATED', note: 'Stated in the instruction.' });
      step.laborMinutes = c.laborMinutes;
    }
    if (c.elapsedMinutes !== undefined) {
      put({ target: 'step', name: step.task, field: 'elapsedMinutes', from: step.elapsedMinutes, to: c.elapsedMinutes, status: 'STATED', note: 'Stated in the instruction.' });
      step.elapsedMinutes = c.elapsedMinutes;
    } else if (c.laborMinutes !== undefined && step.staff > 0) {
      const to = c.laborMinutes / step.staff;
      put({ target: 'step', name: step.task, field: 'elapsedMinutes', from: step.elapsedMinutes, to, status: 'DERIVED', note: `Labor minutes ÷ ${step.staff} staff; state the elapsed minutes to override.` });
      step.elapsedMinutes = to;
    }
    if (c.scalesWith !== undefined) {
      put({ target: 'step', name: step.task, field: 'scalesWith', from: step.scalesWith, to: c.scalesWith, status: 'STATED', note: 'Stated in the instruction.' });
      step.scalesWith = c.scalesWith;
    }
    if (c.station !== undefined) {
      put({ target: 'step', name: step.task, field: 'station', from: step.station, to: c.station, status: 'STATED', note: 'Stated in the instruction.' });
      step.station = c.station;
    }
  };

  // R6.3: a processing change edits the step that worked the line, found through its
  // component and the step's kind, never through the chef's words for the step.
  const PREP_WORDS = ['prep', 'prepare', 'wash', 'trim', 'cut', 'dice', 'peel', 'slice', 'chop', 'scale', 'unit'];
  const SOW_WORDS = ['sow', 'roast', 'steam', 'bake', 'fry', 'simmer', 'smoke', 'grill', 'braise', 'boil', 'saute', 'sear'];
  for (const e of processingEdits) {
    const kindWords = e.step === 'prep' ? PREP_WORDS : SOW_WORDS;
    const hits = steps.filter((s) => mentions(s.task, e.component) && words(s.task).some((w) => kindWords.includes(w)));
    const label = `${e.step} step for "${e.component}"`;
    if (hits.length !== 1) {
      ask({
        id: `step-match:${norm(e.component)}:${e.step}`,
        about: 'step',
        field: 'step',
        question:
          hits.length === 0
            ? `No step on ${source.code}'s labor standard reads as the ${label}, so the change in form of "${e.ref}" has no step to land on. Name one of: ${stepNames().join('; ')}.`
            : `More than one step reads as the ${label}: ${hits.map((h) => h.task).join('; ')}. Name one.`,
        waivable: false,
      });
      continue;
    }
    const step = hits[0]!;
    if (e.removeStep) {
      steps.splice(steps.indexOf(step), 1);
      put({ target: 'step', name: step.task, field: 'step', from: `${fmtNum(step.laborMinutes)} min`, to: null, status: 'STATED', note: `Removed: "${e.ref}" in its new form no longer takes this step, as instructed.` });
      continue;
    }
    if (e.laborMinutes === undefined && e.elapsedMinutes === undefined && e.staff === undefined) {
      const id = `step:${norm(step.task)}:laborMinutes`;
      const question = `"${e.ref}" changes form, so the ${label} ("${step.task}": ${fmtNum(step.laborMinutes)} labor minutes, ${step.staff} staff) changes with it. State its minutes and staff in the new form, or waive to carry the source figure.`;
      if (ask({ id, about: 'step', field: 'laborMinutes', question, waivable: true })) {
        put({ target: 'step', name: step.task, field: 'laborMinutes', from: step.laborMinutes, to: step.laborMinutes, status: 'PLACEHOLDER', note: `Waived: ${question}` });
      }
      continue;
    }
    editStep(step, e);
  }

  for (const c of proposal.laborChanges) {
    if (c.kind === 'remove') {
      // A step the chef names that already left with its component is already done.
      if (!('match' in matchName(c.step, stepNames())) && 'match' in matchName(c.step, departed)) continue;
      const step = resolveStep(c.step, 'remove');
      if (!step) continue;
      steps.splice(steps.indexOf(step), 1);
      put({ target: 'step', name: step.task, field: 'step', from: `${step.laborMinutes} min`, to: null, status: 'STATED', note: 'Removed as instructed.' });
      continue;
    }
    if (c.kind === 'edit') {
      const step = resolveStep(c.step, 'edit');
      if (!step) continue;
      editStep(step, c);
      continue;
    }
    // add
    const exists = matchName(c.task, stepNames());
    if ('match' in exists) {
      ask({ id: `step-add-exists:${norm(c.task)}`, about: 'step', field: 'step', question: `"${c.task}" is already a step ("${exists.match}"). Edit it, or name the added step differently.`, waivable: false });
      continue;
    }
    if (c.laborMinutes === undefined) {
      ask({ id: `step:${norm(c.task)}:laborMinutes`, about: 'step', field: 'laborMinutes', question: `How many labor minutes does the added step "${c.task}" take, with how many people? An added step has no source figure to carry.`, waivable: false });
      continue;
    }
    let scalesWith = c.scalesWith;
    let scalingNote = 'Stated in the instruction.';
    if (scalesWith === undefined) {
      const id = `step:${norm(c.task)}:scalesWith`;
      const question = `Does "${c.task}" take the same minutes per sowing whatever the sowing (fixed), or minutes per unit (variable)?`;
      if (!ask({ id, about: 'step', field: 'scalesWith', question, waivable: true })) continue;
      scalesWith = 'fixed';
      scalingNote = `Waived: ${question} Carried as fixed per sowing.`;
    }
    const elapsed = c.elapsedMinutes ?? (c.staff > 0 ? c.laborMinutes / c.staff : c.laborMinutes);
    const step: TimeStudyLine = { task: c.task, station: c.station, staff: c.staff, elapsedMinutes: elapsed, laborMinutes: c.laborMinutes, scalesWith, stream: c.stream };
    let at = steps.length;
    if (c.after !== undefined) {
      const prev = resolveStep(c.after, 'placed after');
      if (!prev) continue;
      at = steps.indexOf(prev) + 1;
    } else {
      const lastOfStream = steps.map((s, i) => (s.stream === c.stream ? i : -1)).filter((i) => i >= 0).pop();
      at = lastOfStream === undefined ? steps.length : lastOfStream + 1;
    }
    steps.splice(at, 0, step);
    put({ target: 'step', name: step.task, field: 'step', from: null, to: `${c.laborMinutes} min, ${c.staff} staff, ${scalesWith}, ${c.stream}`, status: 'STATED', note: 'Added as instructed.' });
    if (c.scalesWith === undefined) put({ target: 'step', name: step.task, field: 'scalesWith', from: null, to: scalesWith, status: 'PLACEHOLDER', note: scalingNote });
    if (c.elapsedMinutes === undefined) {
      put({ target: 'step', name: step.task, field: 'elapsedMinutes', from: null, to: elapsed, status: 'DERIVED', note: `Labor minutes ÷ ${c.staff} staff; state the elapsed minutes to override.` });
    }
  }
  // ── The variant ──────────────────────────────────────────────────────────
  if (!lines.some((l) => l.isHotComponent)) findings.push('The variant has no hot component, so it has no canopy mass and cannot be sowing-sized.');
  const variantName = proposal.variantName || `${source.name} (variant)`;
  const variant: CropPlanDef = {
    ...(structuredClone(source) as CropPlanDef),
    code: `${source.code}${WORKING_CODE_SUFFIX}`,
    name: variantName,
    status: 'developing',
    inputs: normalizeLines(lines),
  };
  const study: TimeStudySeed = {
    studiedOn: null,
    sowingSize: base.sowingSize,
    observer: null,
    qualityResult: null,
    qualityNotes: `Estimated: ${source.code}'s ${sourceStudyBasis === 'built' ? 'built estimate' : `${sourceStudyBasis} standard`} with the instructed changes applied. Stands until an observed study is adopted.`,
    basis: 'estimated',
    lines: steps,
  };
  const blocking = questions.some((q) => q.blocking);
  return {
    source,
    variant,
    study,
    sourceStudyLines,
    sourceStudyBasis,
    changes,
    questions,
    findings,
    ready: !blocking && findings.length === 0,
    placeholderCount: changes.filter((c) => c.status === 'PLACEHOLDER').length,
  };
}

/** The working code the in-memory variant carries; replaced by the next library code on save. */
export const isWorkingVariantCode = (code: string): boolean => code.endsWith(WORKING_CODE_SUFFIX);
