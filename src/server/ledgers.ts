import 'server-only';
import { cookies } from 'next/headers';
import { getScenarioView, loadDefinitions, resolveWithDefinitions } from '@/server/scenarios';
import { listSubscriptionCycles } from '@/server/orders';
import { loadActuals } from '@/server/actuals';
import { simulateForecast, type ForecastTimeline } from '@/engine/forecast-timeline';
import { planBundle, postPlanLedger, type PlanLedger } from '@/engine/plan-ledger';
import { postActualLedger, type ActualLedger } from '@/engine/actuals-ledger';
import type { ActualsBundle } from '@/engine/actuals';
import type { FarmScenarioConfig, ResolvedInputs } from '@/engine/scenario';
import { LEDGER_COOKIE, isLedgerKind, type LedgerKind } from '@/engine/ledger-view';
import type { ScenarioView } from '@/server/scenarios';

/**
 * MicroFarm — posting the selected ledger on the server (Roadmap N6). One path for
 * the live statement actions (the working copy the browser sends) and for server
 * pages (the saved open forecast): Plan runs the timeline and the Plan ledger,
 * Actual posts the recorded documents. Both hand back the documents they posted.
 */

export async function getLedgerKind(): Promise<LedgerKind> {
  const v = (await cookies()).get(LEDGER_COOKIE)?.value;
  return isLedgerKind(v) ? v : 'plan';
}

export type PostedLedger =
  | { kind: 'plan'; view: ScenarioView; inputs: ResolvedInputs; timeline: ForecastTimeline; ledger: PlanLedger; bundle: ActualsBundle; empty: false }
  | { kind: 'actual'; view: ScenarioView; inputs: ResolvedInputs; timeline: null; ledger: ActualLedger; bundle: ActualsBundle; empty: boolean };

const today = () => new Date().toISOString().slice(0, 10);

/** Post a ledger. `config` omitted = the saved open forecast (or the plan of record). */
export async function postLedger(kind: LedgerKind, config?: FarmScenarioConfig): Promise<PostedLedger> {
  const [definitions, view] = await Promise.all([loadDefinitions(), getScenarioView()]);
  const inputs = resolveWithDefinitions(config ?? view.config, definitions);
  if (kind === 'plan') {
    const cycles = await listSubscriptionCycles();
    const timeline = simulateForecast({ inputs, cycles });
    const ledger = postPlanLedger({ timeline, inputs });
    return { kind, view, inputs, timeline, ledger, bundle: planBundle(timeline), empty: false };
  }
  // Actual sowings without an approved standard absorb at the rate the same forecast's Plan
  // ledger sets on its own production — one absorption basis on both ledgers.
  const [bundle, cycles] = await Promise.all([loadActuals(), listSubscriptionCycles()]);
  const absorption = postPlanLedger({ timeline: simulateForecast({ inputs, cycles }), inputs }).absorption;
  const ledger = postActualLedger(bundle, inputs, today(), undefined, { absorption });
  return { kind, view, inputs, timeline: null, ledger, bundle, empty: ledger.empty };
}

/** The ledger this person selected, on the saved open forecast. */
export async function postSelectedLedger(): Promise<PostedLedger> {
  return postLedger(await getLedgerKind());
}
