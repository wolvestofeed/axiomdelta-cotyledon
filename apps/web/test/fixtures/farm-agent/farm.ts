/**
 * The seed farm every agent fixture runs in (agentic-assistance build plan
 * R6.6, R6.7): the menu library as authored, each crop plan's built labor estimate
 * at a 500-unit sowing, no catalog and no supplier. Shared by the fixture
 * test and the live eval script so both resolve against the same library.
 */
import { menuCropPlans } from '../../../src/app/(farm)/farm/_data/crop-plans-seed';
import type { TimeStudyDoc } from '../../../src/app/(farm)/farm/_data/time-studies';
import type { ResolveContext } from '../../../src/app/(farm)/farm/_engine/agent-proposal';
import { estimatedTimeStudy } from '../../../src/app/(farm)/farm/_engine/time-study-estimate';

export const FIXTURE_SOWING = 500;
export const FIXTURE_AS_OF = '2026-09-19';

export function seedStudies(): TimeStudyDoc[] {
  return menuCropPlans.map((r) => ({ id: `estimate-${r.code}`, cropPlanCode: r.code, adoptedAt: null, adoptedBy: null, source: 'seed', ...estimatedTimeStudy(r, FIXTURE_SOWING) }));
}

export function seedFarm(over: Partial<ResolveContext> = {}): ResolveContext {
  return { library: menuCropPlans, studies: seedStudies(), catalog: [], supplierNames: {}, asOf: FIXTURE_AS_OF, sowingSize: FIXTURE_SOWING, waived: new Set(), confirmed: new Set(), ...over };
}

/** One recorded run: the instruction, what the model returned, and what the resolver must ask. */
export interface AgentFixture {
  name: string;
  instruction: string;
  sourceCropPlanCode: string;
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
