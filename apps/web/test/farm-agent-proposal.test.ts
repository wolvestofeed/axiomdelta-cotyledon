/**
 * MicroFarm — agentic assistance: the proposal contract and the resolver
 * (agentic-assistance build plan R0, R1).
 */

import { describe, it, expect } from 'vitest';
import { matchName, packSizeOf, parseProposal, resolveProposal, type CropPlanVariantProposal, type ResolveContext } from '@/app/(farm)/farm/_engine/agent-proposal';
import { cropPlan as seed } from '@/app/(farm)/farm/_data/plan-data';
import type { InputLine, CropPlanDef } from '@/app/(farm)/farm/_data/plan-data';
import type { CatalogLine } from '@/app/(farm)/farm/_engine/catalog';
import { estimatedTimeStudy } from '@/app/(farm)/farm/_engine/time-study-estimate';
import type { TimeStudyDoc } from '@/app/(farm)/farm/_data/time-studies';

const line = (over: Partial<InputLine> & { name: string }): InputLine => ({
  spec: '',
  seedQtyPerSowing: 10,
  unit: 'lb',
  yieldToHarvest: 0.9,
  harvestedYieldPerSowing: 9,
  seedUnitCost: 1,
  packSize: 25,
  isHotComponent: true,
  status: 'STATED',
  source: 'test',
  yieldStatus: 'STATED',
  yieldSource: 'test',
  nutrition: { component: 'VEG', vegSubgroup: 'RED_ORANGE', cupWeightG: 150, status: 'STATED', source: 'test' },
  component: over.name,
  ...over,
});

/** A soup with a raw carrot line that carries a separate trim yield, and a rice line that does not. */
const soup: CropPlanDef = {
  ...structuredClone(seed),
  code: 'AMK-E-090',
  name: 'Carrot and rice soup',
  inputs: [
    line({ name: 'Carrots, whole', seedQtyPerSowing: 50, yieldToHarvest: 0.72, trimYield: 0.8, seedUnitCost: 0.6 }),
    line({ name: 'Brown rice, long grain', seedQtyPerSowing: 12, yieldToHarvest: 2.5, seedUnitCost: 1.1, nutrition: { component: 'GRAINS', grainGroup: 'H', status: 'STATED', source: 'test' } }),
    line({ name: 'Cheddar, shredded', seedQtyPerSowing: 5, yieldToHarvest: 1, isHotComponent: false, nutrition: { component: 'MMA', status: 'STATED', source: 'test' } }),
  ],
};

/** Another crop plan already using pre-cut carrots, with its own yield on file. */
const other: CropPlanDef = {
  ...structuredClone(seed),
  code: 'AMK-E-091',
  name: 'Glazed carrots',
  inputs: [line({ name: 'Carrots, pre-cut', seedQtyPerSowing: 30, yieldToHarvest: 0.9, yieldStatus: 'SOURCED', yieldSource: 'USDA FBG carrots, ready-to-use', seedUnitCost: 1.4 })],
};

const catalogLine = (over: Partial<CatalogLine> & { item: string }): CatalogLine => ({
  id: over.item,
  supplierId: 'sup-1',
  category: null,
  variety: null,
  packSize: '25 lb',
  unit: 'lb',
  status: 'approved',
  prices: [{ effectiveFrom: '2026-01-01', unitPrice: 1.35, priceBasis: 'lb', sourceId: null, note: null }],
  minOrderQty: null,
  leadTimeDays: null,
  availStartMonth: null,
  availEndMonth: null,
  certification: null,
  origin: null,
  sku: null,
  notes: null,
  sourceId: null,
  ...over,
});

const study = (cropPlan: CropPlanDef): TimeStudyDoc => ({
  id: `study-${cropPlan.code}`,
  cropPlanCode: cropPlan.code,
  adoptedAt: null,
  adoptedBy: null,
  source: 'seed',
  ...estimatedTimeStudy(cropPlan, 500),
});

const ctx = (over: Partial<ResolveContext> = {}): ResolveContext => ({
  library: [soup, other],
  studies: [study(soup), study(other)],
  catalog: [],
  supplierNames: { 'sup-1': 'Test Produce Co.' },
  asOf: '2026-09-19',
  sowingSize: 500,
  waived: new Set(),
  confirmed: new Set(),
  ...over,
});

const proposal = (over: Partial<CropPlanVariantProposal>): CropPlanVariantProposal => ({
  sourceCropPlan: 'AMK-E-090',
  variantName: '',
  lineChanges: [],
  laborChanges: [],
  openQuestions: [],
  facts: [],
  ...over,
});

const ok = (r: ReturnType<typeof resolveProposal>) => {
  if ('error' in r) throw new Error(r.error);
  return r;
};

describe('parseProposal — loose envelope, strict rows', () => {
  it('reads a well-formed proposal', () => {
    const r = parseProposal({
      sourceCropPlan: 'AMK-E-090',
      lineChanges: [{ kind: 'replace', line: 'Carrots, whole', withItem: 'Carrots, pre-cut' }],
      laborChanges: [{ kind: 'remove', step: 'Prep — Carrots' }],
      openQuestions: [{ id: 'q1', about: 'step', field: 'laborMinutes', question: 'How long is the new prep?' }],
      facts: ['Swap whole carrots for pre-cut.'],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.proposal.lineChanges).toHaveLength(1);
    expect(r.proposal.laborChanges).toHaveLength(1);
    // R6.4: every question is the resolver's; a question the model writes is not read.
    expect(r.proposal.openQuestions).toEqual([]);
  });

  it('turns a malformed change into a question instead of dropping the proposal', () => {
    const r = parseProposal({ sourceCropPlan: 'AMK-E-090', lineChanges: [{ kind: 'add', name: 'Parsley' }, { kind: 'remove', line: 'Cheddar, shredded' }] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.proposal.lineChanges).toHaveLength(1);
    expect(r.proposal.openQuestions).toHaveLength(1);
    expect(r.proposal.openQuestions[0]!.question).toContain('Parsley');
  });

  it('absorbs a list the model wrote as a sentence, as "none", or as a JSON string', () => {
    const asNone = parseProposal({ sourceCropPlan: 'x', lineChanges: [], laborChanges: 'None.', openQuestions: 'No open questions', facts: 'none' });
    expect(asNone.ok && asNone.proposal.openQuestions).toEqual([]);
    expect(asNone.ok && asNone.proposal.laborChanges).toEqual([]);
    expect(asNone.ok && asNone.proposal.facts).toEqual([]);
    const asSentence = parseProposal({ sourceCropPlan: 'x', openQuestions: 'Does the prep step change?', facts: 'Swap the hash for crispy potatoes.' });
    expect(asSentence.ok && asSentence.proposal.openQuestions).toEqual([]);
    expect(asSentence.ok && asSentence.proposal.facts).toEqual(['Swap the hash for crispy potatoes.']);
    const asJson = parseProposal({ sourceCropPlan: 'x', lineChanges: '[{"kind":"remove","line":"Cheddar, shredded"}]', openQuestions: '[{"id":"q","about":"step","field":"laborMinutes","question":"Minutes?"}]' });
    expect(asJson.ok && asJson.proposal.lineChanges).toEqual([{ kind: 'remove', line: 'Cheddar, shredded' }]);
    expect(asJson.ok && asJson.proposal.openQuestions).toEqual([]);
  });

  it('coerces a numeric string the model wrote as text', () => {
    const r = parseProposal({ sourceCropPlan: 'x', lineChanges: [{ kind: 'edit', line: 'Carrots, whole', seedQtyPerSowing: '45' }] });
    expect(r.ok && r.proposal.lineChanges[0]).toMatchObject({ kind: 'edit', seedQtyPerSowing: 45 });
  });
});

describe('matchName — exact, then case, then words; ambiguity is reported', () => {
  const names = ['Carrots, whole', 'Carrots, pre-cut', 'Brown rice, long grain'];
  it('matches exactly and case-insensitively', () => {
    expect(matchName('Carrots, whole', names)).toEqual({ match: 'Carrots, whole' });
    expect(matchName('brown rice, long grain', names)).toEqual({ match: 'Brown rice, long grain' });
  });
  it('matches by contained words when one candidate fits', () => {
    expect(matchName('rice', names)).toEqual({ match: 'Brown rice, long grain' });
    expect(matchName('pre-cut carrots', names)).toEqual({ match: 'Carrots, pre-cut' });
  });
  it('reports every candidate when several fit', () => {
    expect(matchName('carrots', names)).toEqual({ candidates: ['Carrots, whole', 'Carrots, pre-cut'] });
  });
  it('reports none when nothing fits', () => {
    expect(matchName('parsnips', names)).toEqual({ candidates: [] });
  });
  it('reads a pack size out of a catalog string', () => {
    expect(packSizeOf({ packSize: '25 lb' })).toBe(25);
    expect(packSizeOf({ packSize: '2 × 5 lb' })).toBe(2);
    expect(packSizeOf({ packSize: null })).toBeNull();
  });
});

describe('resolveProposal — the carrot case', () => {
  const swap = proposal({ lineChanges: [{ kind: 'replace', line: 'Carrots, whole', withItem: 'pre-cut carrots' }] });
  const USE = 'line:carrots, pre-cut:use:AMK-E-091';
  const alone = (over: Partial<ResolveContext> = {}) => ctx({ library: [soup], studies: [study(soup)], ...over });

  it('an item found on another crop plan raises exactly one question, a confirmation', () => {
    const r = ok(resolveProposal(swap, ctx()));
    expect(r.questions).toHaveLength(1);
    expect(r.questions[0]).toMatchObject({ id: USE, kind: 'confirm', blocking: true, confirmed: false, waivable: false });
    expect(r.questions[0]!.question).toContain('AMK-E-091');
    expect(r.questions[0]!.question).toContain('Glazed carrots');
    expect(r.ready).toBe(false);
    expect(r.variant.inputs.find((l) => l.name === 'Carrots, pre-cut')).toBeDefined();
  });

  it('confirmed, the found line’s yield comes across with its citation', () => {
    const r = ok(resolveProposal(swap, ctx({ confirmed: new Set([USE]) })));
    const carrots = r.variant.inputs.find((l) => l.name === 'Carrots, pre-cut')!;
    expect(carrots.yieldToHarvest).toBe(0.9);
    expect(carrots.yieldStatus).toBe('SOURCED');
    expect(carrots.yieldSource).toContain('AMK-E-091');
    expect(carrots.seedUnitCost).toBe(1.4);
    expect(r.questions).toHaveLength(1);
    expect(r.ready).toBe(true);
  });

  it('the raw line’s separate trim yield still derives the quantity, over the found line’s', () => {
    const r = ok(resolveProposal(swap, ctx({ confirmed: new Set([USE]) })));
    const carrots = r.variant.inputs.find((l) => l.name === 'Carrots, pre-cut')!;
    expect(carrots.seedQtyPerSowing).toBeCloseTo(40, 6);
    expect(r.changes.find((c) => c.field === 'seedQtyPerSowing')).toMatchObject({ status: 'DERIVED', from: 50, to: 40 });
    expect(carrots.trimYield).toBeUndefined();
  });

  it('with no trim yield, the found line’s quantity scales to this crop plan’s sowing by units', () => {
    const lib: CropPlanDef[] = [{ ...soup, inputs: [line({ name: 'Carrots, whole', seedQtyPerSowing: 50, yieldToHarvest: 0.72 }), ...soup.inputs.slice(1)] }, { ...other, sowingUnits: 50 }];
    const r = ok(resolveProposal(swap, ctx({ library: lib, confirmed: new Set([USE]) })));
    const carrots = r.variant.inputs.find((l) => l.name === 'Carrots, pre-cut')!;
    expect(carrots.seedQtyPerSowing).toBeCloseTo(30 * (100 / 50), 6);
    expect(r.changes.find((c) => c.field === 'seedQtyPerSowing')).toMatchObject({ status: 'DERIVED' });
    expect(r.questions).toHaveLength(1);
  });

  it('a catalog price outranks the found line’s price, and the supplier is cited', () => {
    const r = ok(resolveProposal(swap, ctx({ catalog: [catalogLine({ item: 'Carrots, pre-cut' })], confirmed: new Set([USE]) })));
    const carrots = r.variant.inputs.find((l) => l.name === 'Carrots, pre-cut')!;
    expect(carrots.seedUnitCost).toBe(1.35);
    expect(carrots.status).toBe('SOURCED');
    expect(carrots.source).toContain('Test Produce Co.');
    expect(carrots.packSize).toBe(25);
  });

  it('a question the model wrote is never read; the resolver alone asks (R6.4)', () => {
    const parsed = parseProposal({
      ...swap,
      openQuestions: [
        { id: 'pc-price', about: 'catalog', field: 'seedUnitCost', question: 'What does pre-cut cost?', waivable: true },
        { id: 'pc-prep', about: 'step', field: 'laborMinutes', question: 'Does the carrot prep step change?', waivable: true },
      ],
    });
    expect(parsed.ok && parsed.proposal.openQuestions).toEqual([]);
    const r = ok(resolveProposal(parsed.ok ? parsed.proposal : proposal({}), ctx({ confirmed: new Set([USE]) })));
    expect(r.questions.map((q) => q.id)).toEqual([USE]);
  });

  it('with nothing found, the price is asked and blocks the run', () => {
    const r = ok(resolveProposal(swap, alone()));
    const q = r.questions.find((q) => q.field === 'seedUnitCost');
    expect(q).toMatchObject({ kind: 'ask', blocking: true });
    expect(r.questions.some((q) => q.kind === 'confirm')).toBe(false);
    expect(r.ready).toBe(false);
  });

  it('with nothing found, a waived question becomes a placeholder at the raw line’s figure, never a guess', () => {
    const r = ok(resolveProposal(swap, alone({ waived: new Set(['line:pre-cut carrots:seedUnitCost', 'line:pre-cut carrots:yieldToHarvest', 'line:pre-cut carrots:ftl']) })));
    const carrots = r.variant.inputs.find((l) => l.name === 'pre-cut carrots')!;
    expect(carrots.seedUnitCost).toBe(0.6);
    expect(carrots.status).toBe('PLACEHOLDER');
    expect(carrots.yieldToHarvest).toBe(0.72);
    expect(carrots.yieldStatus).toBe('PLACEHOLDER');
    expect(r.placeholderCount).toBeGreaterThanOrEqual(3);
    expect(r.ready).toBe(true);
  });

  it('with nothing found, the traceability status is asked rather than read from the name', () => {
    const r = ok(resolveProposal(swap, alone()));
    expect(r.questions.some((q) => q.field === 'foodTraceabilityList')).toBe(true);
  });

  it('asks for the quantity when the raw line has no separate trim yield and nothing is found', () => {
    const r = ok(resolveProposal(proposal({ lineChanges: [{ kind: 'replace', line: 'Brown rice, long grain', withItem: 'Parboiled rice' }] }), ctx()));
    expect(r.questions.some((q) => q.field === 'seedQtyPerSowing')).toBe(true);
    expect(r.questions.some((q) => q.field === 'yieldToHarvest')).toBe(true);
  });

  it('a stated figure outranks everything found and is tagged STATED', () => {
    const r = ok(resolveProposal(proposal({ lineChanges: [{ kind: 'replace', line: 'Carrots, whole', withItem: 'Carrots, pre-cut', seedQtyPerSowing: 42, seedUnitCost: 2, yieldToHarvest: 0.95 }] }), ctx({ catalog: [catalogLine({ item: 'Carrots, pre-cut' })], confirmed: new Set([USE]) })));
    const carrots = r.variant.inputs.find((l) => l.name === 'Carrots, pre-cut')!;
    expect(carrots).toMatchObject({ seedQtyPerSowing: 42, seedUnitCost: 2, yieldToHarvest: 0.95, status: 'STATED', yieldStatus: 'STATED' });
    expect(r.ready).toBe(true);
  });

  it('does not invent a variant name', () => {
    const r = ok(resolveProposal(swap, ctx()));
    expect(r.variant.name).toBe('Carrot and rice soup (variant)');
    expect(r.variant.status).toBe('developing');
    expect(r.variant.code).toBe('AMK-E-090-VARIANT');
  });
});

describe('resolveProposal — a served component swapped for another (the sweet potato hash case)', () => {
  const chicken: CropPlanDef = {
    ...structuredClone(seed),
    code: 'AMK-E-003',
    name: 'Hill Country Smoked Chicken & Sweet Potato Hash',
    inputs: [
      line({ name: 'Chicken thighs, boneless skinless', component: 'Smoked chicken', seedQtyPerSowing: 24, nutrition: { component: 'MMA', status: 'STATED', source: 'test' } }),
      line({ name: 'Sweet potatoes', component: 'Sweet potato hash', seedQtyPerSowing: 28, seedUnitCost: 1.1 }),
      line({ name: 'Olive oil', component: 'Sweet potato hash', seedQtyPerSowing: 0.125, seedUnitCost: 9, nutrition: undefined }),
      line({ name: 'Smoked paprika', component: 'Sweet potato hash', seedQtyPerSowing: 0.25, seedUnitCost: 12, nutrition: undefined }),
      line({ name: 'Green beans, fresh', component: 'Green beans', seedQtyPerSowing: 26 }),
    ],
  };
  const fish: CropPlanDef = {
    ...structuredClone(seed),
    code: 'AMK-E-004',
    name: 'Gulf Coast Fish & Crispy Potatoes',
    sowingUnits: 100,
    inputs: [
      line({ name: 'Gulf drum / redfish, raw', component: 'Fish bites', seedQtyPerSowing: 23, nutrition: { component: 'MMA', status: 'STATED', source: 'test' } }),
      line({ name: 'Potato wedges, raw', component: 'Crispy potatoes', seedQtyPerSowing: 28, seedUnitCost: 0.9, yieldToHarvest: 25 / 28, nutrition: { component: 'VEG', vegSubgroup: 'STARCHY', cupWeightG: 150, status: 'STATED', source: 'test' } }),
      line({ name: 'Olive oil', component: 'Crispy potatoes', seedQtyPerSowing: 0.25, seedUnitCost: 9, nutrition: undefined }),
      line({ name: 'Carrot matchsticks', component: 'Carrots', seedQtyPerSowing: 25 }),
    ],
  };
  const farm = (over: Partial<ResolveContext> = {}) => ctx({ library: [chicken, fish, other], studies: [study(chicken), study(fish), study(other)], ...over });
  const USE = 'component:sweet potato hash:use:AMK-E-004:crispy potatoes';
  const swap = proposal({ sourceCropPlan: 'AMK-E-003', lineChanges: [{ kind: 'swapComponent', component: 'sweet potato hash', withComponent: 'crispy potatoes' }] });

  it('finds the component through the crop plan name and raises exactly one confirmation', () => {
    const r = ok(resolveProposal(swap, farm()));
    expect(r.questions).toHaveLength(1);
    expect(r.questions[0]).toMatchObject({ id: USE, kind: 'confirm', blocking: true });
    expect(r.questions[0]!.question).toContain('AMK-E-004');
    expect(r.questions[0]!.question).toContain('Potato wedges, raw');
    expect(r.variant.inputs.map((l) => l.component)).toEqual(['Smoked chicken', 'Sweet potato hash', 'Sweet potato hash', 'Sweet potato hash', 'Green beans']);
  });

  it('confirmed, the old component’s lines leave and the found component’s lines arrive, scaled by units', () => {
    const r = ok(resolveProposal(swap, farm({ confirmed: new Set([USE]) })));
    expect(r.variant.inputs.map((l) => l.component)).toEqual(['Smoked chicken', 'Green beans', 'Crispy potatoes', 'Crispy potatoes']);
    const wedges = r.variant.inputs.find((l) => l.name === 'Potato wedges, raw')!;
    expect(wedges.seedQtyPerSowing).toBeCloseTo(28, 6);
    expect(wedges.seedUnitCost).toBe(0.9);
    expect(wedges.nutrition?.component).toBe('VEG');
    expect(wedges.yieldSource).toContain('AMK-E-004');
    expect(r.questions).toHaveLength(1);
    expect(r.ready).toBe(true);
  });

  it('a different authored sowing scales the arriving lines', () => {
    const r = ok(resolveProposal(swap, farm({ library: [{ ...chicken, sowingUnits: 50 }, fish, other], confirmed: new Set([USE]) })));
    expect(r.variant.inputs.find((l) => l.name === 'Potato wedges, raw')!.seedQtyPerSowing).toBeCloseTo(14, 6);
  });

  it('the component’s prep and sow steps come across from the found crop plan’s standard', () => {
    const before = ok(resolveProposal(proposal({ sourceCropPlan: 'AMK-E-003' }), farm()));
    expect(before.study.lines.some((s) => /sweet potato hash/i.test(s.task))).toBe(true);
    const r = ok(resolveProposal(swap, farm({ confirmed: new Set([USE]) })));
    expect(r.study.lines.some((s) => /sweet potato hash/i.test(s.task))).toBe(false);
    const arrived = r.study.lines.filter((s) => /crispy potatoes/i.test(s.task));
    expect(arrived.length).toBeGreaterThanOrEqual(2);
    expect(r.changes.filter((c) => c.target === 'step' && c.status === 'DERIVED').length).toBe(arrived.length);
    expect(r.changes.filter((c) => c.target === 'step' && c.to === null).length).toBe(before.study.lines.filter((s) => /sweet potato hash/i.test(s.task)).length);
  });

  it('a "replace" written with component names is read as the same swap', () => {
    const r = ok(resolveProposal(proposal({ sourceCropPlan: 'AMK-E-003', lineChanges: [{ kind: 'replace', line: 'Sweet potato hash', withItem: 'crispy potatoes' }] }), farm()));
    expect(r.questions).toHaveLength(1);
    expect(r.questions[0]!.id).toBe(USE);
  });

  it('a "replace" on one line of a component with a component elsewhere is the swap too', () => {
    const r = ok(resolveProposal(proposal({ sourceCropPlan: 'AMK-E-003', lineChanges: [{ kind: 'replace', line: 'Sweet potatoes', withItem: 'the crispy potatoes from E004', fromCropPlan: 'AMK-E-004' }] }), farm()));
    expect(r.questions).toHaveLength(1);
    expect(r.questions[0]!.id).toBe(USE);
  });

  it('the crop plan the chef names narrows the search', () => {
    const twice: CropPlanDef = { ...structuredClone(fish), code: 'AMK-E-014', name: 'Brisket & Crispy Potatoes' };
    const amb = ok(resolveProposal(swap, farm({ library: [chicken, fish, twice] })));
    expect(amb.questions[0]!.question).toMatch(/more than one served component/);
    expect(amb.questions[0]!.blocking).toBe(true);
    const named = ok(resolveProposal(proposal({ sourceCropPlan: 'AMK-E-003', lineChanges: [{ kind: 'swapComponent', component: 'sweet potato hash', withComponent: 'crispy potatoes', fromCropPlan: 'AMK-E-014' }] }), farm({ library: [chicken, fish, twice] })));
    expect(named.questions[0]!.id).toBe('component:sweet potato hash:use:AMK-E-014:crispy potatoes');
  });

  it('an unknown old component is a blocking question naming the crop plan’s components', () => {
    const r = ok(resolveProposal(proposal({ sourceCropPlan: 'AMK-E-003', lineChanges: [{ kind: 'swapComponent', component: 'the slaw', withComponent: 'crispy potatoes' }] }), farm()));
    expect(r.questions[0]!.question).toContain('Smoked chicken, Sweet potato hash, Green beans');
    expect(r.ready).toBe(false);
  });
});

describe('resolveProposal — ambiguity, additions, removals', () => {
  it('a name that matches two lines is a blocking question listing both', () => {
    const lib: CropPlanDef[] = [{ ...soup, inputs: [...soup.inputs, line({ name: 'Carrots, baby' })] }];
    const r = ok(resolveProposal(proposal({ lineChanges: [{ kind: 'remove', line: 'carrots' }] }), ctx({ library: lib, studies: null })));
    const q = r.questions.find((q) => q.field === 'line')!;
    expect(q.blocking).toBe(true);
    expect(q.waivable).toBe(false);
    expect(q.question).toContain('Carrots, whole');
    expect(q.question).toContain('Carrots, baby');
    expect(r.variant.inputs).toHaveLength(4);
  });

  it('an added line asks its nutrition and traceability, and prices off the catalog when it can', () => {
    const r = ok(resolveProposal(proposal({ lineChanges: [{ kind: 'add', name: 'Parsley, fresh', spec: '', seedQtyPerSowing: 2, unit: 'lb', isHotComponent: false }] }), ctx({ catalog: [catalogLine({ item: 'Parsley, fresh', prices: [{ effectiveFrom: '2026-01-01', unitPrice: 3, priceBasis: 'lb', sourceId: null, note: null }] })] })));
    const parsley = r.variant.inputs.find((l) => l.name === 'Parsley, fresh')!;
    expect(parsley.seedUnitCost).toBe(3);
    expect(parsley.status).toBe('SOURCED');
    expect(r.questions.map((q) => q.field).sort()).toEqual(['foodTraceabilityList', 'nutrition', 'yieldToHarvest']);
  });

  it('an added line found on another crop plan raises one confirmation and takes its figures', () => {
    const r0 = ok(resolveProposal(proposal({ lineChanges: [{ kind: 'add', name: 'pre-cut carrots', spec: '', seedQtyPerSowing: 10, unit: 'lb', isHotComponent: true }] }), ctx()));
    expect(r0.questions).toHaveLength(1);
    expect(r0.questions[0]!.kind).toBe('confirm');
    const r = ok(resolveProposal(proposal({ lineChanges: [{ kind: 'add', name: 'pre-cut carrots', spec: '', seedQtyPerSowing: 10, unit: 'lb', isHotComponent: true }] }), ctx({ confirmed: new Set(['line:carrots, pre-cut:use:AMK-E-091']) })));
    const carrots = r.variant.inputs.find((l) => l.name === 'Carrots, pre-cut')!;
    expect(carrots).toMatchObject({ seedQtyPerSowing: 10, yieldToHarvest: 0.9, seedUnitCost: 1.4, nutrition: { component: 'VEG' } });
    expect(r.ready).toBe(true);
  });

  it('removing the only hot component is refused with a finding', () => {
    const lib: CropPlanDef[] = [{ ...soup, inputs: [soup.inputs[0]!, soup.inputs[2]!] }];
    const r = ok(resolveProposal(proposal({ lineChanges: [{ kind: 'remove', line: 'Carrots, whole' }] }), ctx({ library: lib, studies: null })));
    expect(r.findings).toHaveLength(1);
    expect(r.ready).toBe(false);
    expect(r.variant.inputs).toHaveLength(2);
  });

  it('adding a line that already exists is a blocking question, not a duplicate', () => {
    const r = ok(resolveProposal(proposal({ lineChanges: [{ kind: 'add', name: 'Cheddar, shredded', spec: '', seedQtyPerSowing: 1, unit: 'lb', isHotComponent: false }] }), ctx()));
    expect(r.questions.some((q) => q.id.startsWith('line-add-exists') && !q.waivable)).toBe(true);
    expect(r.variant.inputs.filter((l) => l.name === 'Cheddar, shredded')).toHaveLength(1);
  });

  it('an unknown source crop plan is an error, not a guess', () => {
    const r = resolveProposal(proposal({ sourceCropPlan: 'AMK-E-999' }), ctx());
    expect('error' in r).toBe(true);
  });
});

describe('resolveProposal — labor', () => {
  const stepNamed = (r: ReturnType<typeof ok>, part: string) => r.study.lines.find((l) => l.task.toLowerCase().includes(part.toLowerCase()));

  it('builds the variant’s estimated study from the source standard', () => {
    const r = ok(resolveProposal(proposal({}), ctx()));
    expect(r.study.basis).toBe('estimated');
    expect(r.study.studiedOn).toBeNull();
    expect(r.study.lines).toEqual(r.sourceStudyLines);
    expect(r.sourceStudyBasis).toBe('estimated');
  });

  it('removes a step and moves only that step’s minutes', () => {
    const before = ok(resolveProposal(proposal({}), ctx()));
    const prep = before.study.lines.find((l) => /prep/i.test(l.task) && /carrot/i.test(l.task))!;
    expect(prep).toBeDefined();
    const r = ok(resolveProposal(proposal({ laborChanges: [{ kind: 'remove', step: prep.task }] }), ctx()));
    expect(r.study.lines).toHaveLength(before.study.lines.length - 1);
    const sum = (ls: { laborMinutes: number }[]) => ls.reduce((t, l) => t + l.laborMinutes, 0);
    expect(sum(r.study.lines)).toBeCloseTo(sum(before.study.lines) - prep.laborMinutes, 6);
    expect(r.changes.find((c) => c.target === 'step')).toMatchObject({ field: 'step', status: 'STATED' });
  });

  it('edits a step’s minutes as stated and derives the elapsed minutes from the staff count', () => {
    const before = ok(resolveProposal(proposal({}), ctx()));
    const prep = before.study.lines.find((l) => /prep/i.test(l.task) && /carrot/i.test(l.task))!;
    const r = ok(resolveProposal(proposal({ laborChanges: [{ kind: 'edit', step: prep.task, laborMinutes: 6 }] }), ctx()));
    const edited = stepNamed(r, prep.task)!;
    expect(edited.laborMinutes).toBe(6);
    expect(edited.elapsedMinutes).toBeCloseTo(6 / prep.staff, 6);
    expect(r.changes.find((c) => c.field === 'elapsedMinutes')).toMatchObject({ status: 'DERIVED' });
  });

  it('adds a step after a named one, on the sowing stream by default', () => {
    const before = ok(resolveProposal(proposal({}), ctx()));
    const first = before.study.lines[0]!;
    const r = ok(resolveProposal(proposal({ laborChanges: [{ kind: 'add', task: 'Open pre-cut cases', station: null, staff: 1, laborMinutes: 4, scalesWith: 'fixed', stream: 'sowing', after: first.task }] }), ctx()));
    expect(r.study.lines[1]).toMatchObject({ task: 'Open pre-cut cases', laborMinutes: 4, elapsedMinutes: 4, stream: 'sowing' });
  });

  it('an ambiguous step name is a blocking question', () => {
    const r = ok(resolveProposal(proposal({ laborChanges: [{ kind: 'remove', step: 'prep' }] }), ctx()));
    const q = r.questions.find((q) => q.field === 'step')!;
    expect(q.blocking).toBe(true);
    expect(q.question).toMatch(/more than one step|Name one of/);
  });

  it('with no study library loaded the estimate is built in code', () => {
    const r = ok(resolveProposal(proposal({}), ctx({ studies: null })));
    expect(r.sourceStudyBasis).toBe('built');
    expect(r.study.lines.length).toBeGreaterThan(0);
  });
});

describe('resolveProposal — the parser’s own questions', () => {
  it('a row the parser could not read stands as a question, blocks until waived, and is not duplicated', () => {
    const parsed = parseProposal({ sourceCropPlan: 'AMK-E-090', lineChanges: [{ kind: 'add', name: 'Parsley' }] });
    const p = parsed.ok ? parsed.proposal : proposal({});
    expect(p.openQuestions).toHaveLength(1);
    const id = p.openQuestions[0]!.id;
    const blocked = ok(resolveProposal(p, ctx()));
    expect(blocked.questions.find((q) => q.id === id)).toMatchObject({ blocking: true, waived: false });
    const waived = ok(resolveProposal(p, ctx({ waived: new Set([id]) })));
    expect(waived.questions.filter((q) => q.id === id)).toHaveLength(1);
    expect(waived.questions[0]).toMatchObject({ blocking: false, waived: true });
    expect(waived.ready).toBe(true);
  });
});

describe('matchName — a chef’s words (R6.2)', () => {
  const steps = ['Prep — Sweet potato hash: wash, trim, cut, scale', 'Sow — Sweet potato hash (Roast, jar stand)', 'Prep — Green beans: wash, trim, cut, scale', 'Sow — Green beans (Steam, jar stand)', 'Prep — Smoked chicken: wash, trim, cut, scale', 'Component blackout and stage'];
  const lines = ['Chicken thighs, boneless skinless', 'Sweet potatoes', 'Smoked paprika', 'Green beans, fresh'];
  const comps = ['Smoked chicken', 'Sweet potato hash', 'Green beans'];

  it('drops stopwords and folds plurals', () => {
    expect(matchName('the sweet potato prep', steps)).toEqual({ match: steps[0] });
    expect(matchName('the hash prep', steps)).toEqual({ match: steps[0] });
    expect(matchName('the green bean prep step', steps)).toEqual({ match: steps[2] });
    expect(matchName('sweet potato', lines)).toEqual({ match: 'Sweet potatoes' });
    expect(matchName('the hash', comps)).toEqual({ match: 'Sweet potato hash' });
    expect(matchName('the chicken', comps)).toEqual({ match: 'Smoked chicken' });
  });

  it('a word shared by a prep and a sow step is ambiguity, listed', () => {
    const m = matchName('the hash', steps);
    expect('candidates' in m && m.candidates).toEqual([steps[0], steps[1]]);
  });

  it('a partial overlap is listed as candidates but never chosen', () => {
    const m = matchName('wash-and-peel step', steps);
    expect('candidates' in m && m.candidates).toEqual([steps[0], steps[2], steps[4]]);
  });

  it('among several containing candidates, the one whose words are exactly the query wins', () => {
    expect(matchName('carrots', ['Carrots, whole', 'Carrots, pre-cut'])).toEqual({ candidates: ['Carrots, whole', 'Carrots, pre-cut'] });
    expect(matchName('carrots', ['Carrots', 'Carrots, pre-cut'])).toEqual({ match: 'Carrots' });
  });
});

describe('resolveProposal — a processing change (R6.3)', () => {
  const prepStep = (r: ReturnType<typeof ok>) => r.study.lines.find((l) => /^prep/i.test(l.task) && /carrot/i.test(l.task));

  it('with stated minutes, replaces the line and edits the component’s prep step in one change', () => {
    const before = ok(resolveProposal(proposal({}), ctx()));
    const prep = prepStep(before)!;
    const r = ok(resolveProposal(proposal({ lineChanges: [{ kind: 'changeProcessing', line: 'the carrots', withItem: 'Carrots, pre-cut', step: 'prep', removeStep: false, laborMinutes: 10, staff: 1 }] }), ctx({ confirmed: new Set(['line:carrots, pre-cut:use:AMK-E-091']) })));
    expect(r.variant.inputs.map((l) => l.name)).toContain('Carrots, pre-cut');
    const edited = prepStep(r)!;
    expect(edited.task).toBe(prep.task);
    expect(edited).toMatchObject({ laborMinutes: 10, staff: 1, elapsedMinutes: 10 });
    expect(r.questions.filter((q) => q.blocking)).toEqual([]);
  });

  it('with no minutes stated, the step is found and its minutes asked; waived, the source figure is carried as a placeholder', () => {
    const p = proposal({ lineChanges: [{ kind: 'changeProcessing', line: 'Carrots, whole', withItem: 'Carrots, pre-cut', step: 'prep', removeStep: false }] });
    const asked = ok(resolveProposal(p, ctx({ confirmed: new Set(['line:carrots, pre-cut:use:AMK-E-091']) })));
    const q = asked.questions.find((q) => q.field === 'laborMinutes')!;
    expect(q).toMatchObject({ blocking: true, waivable: true });
    expect(q.question).toContain('changes form');
    const waived = ok(resolveProposal(p, ctx({ confirmed: new Set(['line:carrots, pre-cut:use:AMK-E-091']), waived: new Set([q.id]) })));
    expect(waived.ready).toBe(true);
    expect(waived.changes.find((c) => c.target === 'step' && c.status === 'PLACEHOLDER')).toBeDefined();
  });

  it('removeStep drops the component’s prep step without naming it', () => {
    const before = ok(resolveProposal(proposal({}), ctx()));
    const r = ok(resolveProposal(proposal({ lineChanges: [{ kind: 'changeProcessing', line: 'carrots', step: 'prep', removeStep: true }] }), ctx()));
    expect(r.study.lines).toHaveLength(before.study.lines.length - 1);
    expect(prepStep(r)).toBeUndefined();
    expect(r.ready).toBe(true);
  });

  it('a component with several lines and a new item is a question naming the lines', () => {
    const r = ok(resolveProposal(proposal({ lineChanges: [{ kind: 'changeProcessing', line: 'nothing here', withItem: 'x', step: 'prep', removeStep: false }] }), ctx()));
    expect(r.questions[0]!.question).toMatch(/Nothing on AMK-E-090 is named/);
  });
});

describe('resolveProposal — an added step with figures unstated (R6.4)', () => {
  it('asks the minutes and blocks; asks the scaling and carries fixed as a placeholder when waived', () => {
    const noMinutes = ok(resolveProposal(proposal({ laborChanges: [{ kind: 'add', task: 'Open pre-cut cases', station: null, staff: 1, stream: 'sowing' }] }), ctx()));
    expect(noMinutes.questions.find((q) => q.id === 'step:open pre-cut cases:laborMinutes')).toMatchObject({ blocking: true, waivable: false });
    const noScaling = proposal({ laborChanges: [{ kind: 'add', task: 'Open pre-cut cases', station: null, staff: 1, laborMinutes: 4, stream: 'sowing' }] });
    const asked = ok(resolveProposal(noScaling, ctx()));
    expect(asked.questions.find((q) => q.id === 'step:open pre-cut cases:scalesWith')).toMatchObject({ blocking: true, waivable: true });
    const waived = ok(resolveProposal(noScaling, ctx({ waived: new Set(['step:open pre-cut cases:scalesWith']) })));
    expect(waived.study.lines.find((l) => l.task === 'Open pre-cut cases')).toMatchObject({ scalesWith: 'fixed', laborMinutes: 4 });
    expect(waived.changes.find((c) => c.field === 'scalesWith')).toMatchObject({ status: 'PLACEHOLDER' });
  });
});

describe('resolveProposal — the same instruction referring to one thing twice', () => {
  it('a line renamed by an earlier change still answers to its original name', () => {
    const r = ok(
      resolveProposal(
        proposal({
          lineChanges: [
            { kind: 'changeProcessing', line: 'carrots', withItem: 'Carrots, pre-cut', step: 'prep', removeStep: false, laborMinutes: 5, staff: 1 },
            { kind: 'changeProcessing', line: 'Carrots, whole', step: 'sow', removeStep: true },
          ],
        }),
        ctx({ confirmed: new Set(['line:carrots, pre-cut:use:AMK-E-091']) }),
      ),
    );
    expect(r.questions.filter((q) => q.id.startsWith('line-match'))).toEqual([]);
    expect(r.study.lines.some((l) => /^sow/i.test(l.task) && /carrot/i.test(l.task))).toBe(false);
  });

  it('removing a step that already left with its dropped component is already done, not a question', () => {
    const before = ok(resolveProposal(proposal({}), ctx()));
    const cheddarSteps = before.study.lines.filter((l) => /cheddar/i.test(l.task)).map((l) => l.task);
    expect(cheddarSteps.length).toBeGreaterThan(0);
    const r = ok(resolveProposal(proposal({ lineChanges: [{ kind: 'remove', line: 'cheddar' }], laborChanges: cheddarSteps.map((step) => ({ kind: 'remove' as const, step })) }), ctx()));
    expect(r.questions).toEqual([]);
    expect(r.study.lines.some((l) => /cheddar/i.test(l.task))).toBe(false);
    expect(r.changes.filter((c) => c.target === 'step' && c.to === null)).toHaveLength(cheddarSteps.length);
  });
});

describe('resolveProposal — the Food Traceability List flag is stated, never read from the name', () => {
  it('a stated category is set on the line, matched to the list’s own name', () => {
    const r = ok(resolveProposal(proposal({ lineChanges: [{ kind: 'replace', line: 'Carrots, whole', withItem: 'Carrot sticks, fresh', foodTraceabilityList: 'fresh-cut fruits and vegetables' }] }), ctx()));
    const line = r.variant.inputs.find((l) => l.name === 'Carrot sticks, fresh')!;
    expect(line.foodTraceabilityList).toBe('Fruits and vegetables (fresh-cut)');
    expect(r.questions.some((q) => q.field === 'foodTraceabilityList')).toBe(false);
    expect(r.changes.find((c) => c.field === 'foodTraceabilityList')).toMatchObject({ status: 'STATED', to: 'Fruits and vegetables (fresh-cut)' });
  });

  it('"not listed" clears the flag rather than storing the words', () => {
    const r = ok(resolveProposal(proposal({ lineChanges: [{ kind: 'replace', line: 'Carrots, whole', withItem: 'Carrot sticks, fresh', foodTraceabilityList: 'not listed' }] }), ctx()));
    expect(r.variant.inputs.find((l) => l.name === 'Carrot sticks, fresh')!.foodTraceabilityList).toBeUndefined();
    expect(r.questions.some((q) => q.field === 'foodTraceabilityList')).toBe(false);
  });

  it('unstated, it is asked and the question names the categories', () => {
    const r = ok(resolveProposal(proposal({ lineChanges: [{ kind: 'replace', line: 'Carrots, whole', withItem: 'Carrot sticks, fresh' }] }), ctx()));
    const q = r.questions.find((q) => q.field === 'foodTraceabilityList')!;
    expect(q.question).toContain('Fruits and vegetables (fresh-cut)');
  });
});
