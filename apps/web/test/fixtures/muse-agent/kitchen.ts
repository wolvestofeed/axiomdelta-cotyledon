/**
 * The seed kitchen every agent fixture runs in (agentic-assistance build plan
 * R6.6, R6.7): the menu library as authored, each recipe's built labor estimate
 * at a 500-portion batch, no catalog and no supplier. Shared by the fixture
 * test and the live eval script so both resolve against the same library.
 */
import { menuRecipes } from '../../../src/app/(muse)/muse/_data/recipes-menu';
import type { TimeStudyDoc } from '../../../src/app/(muse)/muse/_data/time-studies';
import type { ResolveContext } from '../../../src/app/(muse)/muse/_engine/agent-proposal';
import { estimatedTimeStudy } from '../../../src/app/(muse)/muse/_engine/time-study-estimate';

export const FIXTURE_BATCH = 500;
export const FIXTURE_AS_OF = '2026-09-19';

export function seedStudies(): TimeStudyDoc[] {
  return menuRecipes.map((r) => ({ id: `estimate-${r.code}`, recipeCode: r.code, adoptedAt: null, adoptedBy: null, source: 'seed', ...estimatedTimeStudy(r, FIXTURE_BATCH) }));
}

export function seedKitchen(over: Partial<ResolveContext> = {}): ResolveContext {
  return { library: menuRecipes, studies: seedStudies(), catalog: [], supplierNames: {}, asOf: FIXTURE_AS_OF, batchSize: FIXTURE_BATCH, waived: new Set(), confirmed: new Set(), ...over };
}

/** One recorded run: the instruction, what the model returned, and what the resolver must ask. */
export interface AgentFixture {
  name: string;
  instruction: string;
  sourceRecipeCode: string;
  /** The raw tool input the model returned (recorded, or authored as the expected shape). */
  toolInput: Record<string, unknown>;
  expect: {
    /** The exact question list, in order. */
    questions: { id: string; kind: 'ask' | 'confirm'; waivable: boolean }[];
    /** Confirmations and waivers that make the run ready; ready must then be true. */
    readyWhen?: { confirmed?: string[]; waived?: string[] };
    /** Line names the variant must carry, and must not. */
    lines?: { has?: string[]; lacks?: string[] };
    /** Steps on the variant's study, found by a word in the task, with the figures they must carry. */
    steps?: { taskHas: string; laborMinutes?: number; staff?: number; absent?: boolean }[];
    variantName?: string;
  };
}
