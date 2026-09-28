import 'server-only';
import { cookies } from 'next/headers';
import { getActiveScenario, getScenarioView, loadDefinitions, resolveWithDefinitions } from '@/server/scenarios';
import { loadActuals } from '@/server/actuals';
import { simulateForecast, type ForecastTimeline } from '@/engine/forecast-timeline';
import { planBundle, postPlanLedger, type PlanLedger } from '@/engine/plan-ledger';
import { postActualLedger, type ActualLedger } from '@/engine/actuals-ledger';
import type { ActualsBundle } from '@/engine/actuals';
import type { FarmScenarioConfig, ResolvedInputs } from '@/engine/scenario';
import { LEDGER_COOKIE, isLedgerKind, type LedgerKind } from '@/engine/ledger-view';
import type { ScenarioView } from '@/server/scenarios';

/**
 * Cotyledon — posting the selected ledger on the server. Plan runs the timeline and the Plan
 * ledger on the forecast asked for: the working copy the browser sends, else the saved open
 * forecast. Actual posts the recorded documents at the plan of record, whatever is open: a
 * forecast edit never restates the books (`accounting-policy.md` §11), and a sowing with no
 * approved standard is costed at the plan of record's labor standard and overhead and absorbs at
 * its Plan ledger's rate (§5, §14). Both hand back the documents they posted.
 */

export async function getLedgerKind(): Promise<LedgerKind> {
  const v = (await cookies()).get(LEDGER_COOKIE)?.value;
  return isLedgerKind(v) ? v : 'plan';
}

export type PostedLedger =
  | { kind: 'plan'; view: ScenarioView; inputs: ResolvedInputs; timeline: ForecastTimeline; ledger: PlanLedger; bundle: ActualsBundle; empty: false }
  | { kind: 'actual'; view: ScenarioView; inputs: ResolvedInputs; timeline: null; ledger: ActualLedger; bundle: ActualsBundle; empty: boolean };

const today = () => new Date().toISOString().slice(0, 10);

/** Post a ledger. Plan: `config`, else the saved open forecast (or the plan of record). Actual: the plan of record. */
export async function postLedger(kind: LedgerKind, config?: FarmScenarioConfig): Promise<PostedLedger> {
  const [definitions, view] = await Promise.all([loadDefinitions(), getScenarioView()]);
  if (kind === 'plan') {
    const inputs = resolveWithDefinitions(config ?? view.config, definitions);
    const timeline = simulateForecast({ inputs });
    const ledger = postPlanLedger({ timeline, inputs });
    return { kind, view, inputs, timeline, ledger, bundle: planBundle(timeline), empty: false };
  }
  const [bundle, plan] = await Promise.all([loadActuals(), getActiveScenario()]);
  const inputs = resolveWithDefinitions(plan?.config ?? {}, definitions);
  const absorption = postPlanLedger({ timeline: simulateForecast({ inputs }), inputs }).absorption;
  const ledger = postActualLedger(bundle, inputs, today(), undefined, { absorption });
  return { kind, view, inputs, timeline: null, ledger, bundle, empty: ledger.empty };
}

/** The ledger this person selected, on the saved open forecast. */
export async function postSelectedLedger(): Promise<PostedLedger> {
  return postLedger(await getLedgerKind());
}
