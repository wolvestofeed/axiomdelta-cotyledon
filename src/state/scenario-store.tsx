'use client';

/**
 * MicroFarm — shared scenario store (M1).
 *
 * One client-side context holds the WORKING DRAFT overlay for the whole
 * platform. Every interactive page reads `resolved` (defaults + draft) and writes
 * through the setters, so an edit to a wage or an input cost on one page
 * flows to every other page and, later, through the ledger to the statements.
 *
 * `baseline` is the live master state the session loaded (the applied scenario,
 * or plan-data defaults when nothing is applied yet). Dirtiness = draft ≠ baseline
 * per section, which drives the Section Save buttons and the Draft-vs-Live banner.
 *
 * This store does NOT persist. Save / Apply (server actions) and DB hydration
 * land in the next M1 checkpoint; `commitBaseline` is the hook they'll call to
 * rebase dirtiness after a successful save. Nothing here promotes a draft to the
 * live master — that stays a super-admin-only server action.
 */

import type { GrowPlanDef } from '@/data/grow-plan';
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  resolveScenarioInputs,
  SCENARIO_SECTIONS,
  type FarmScenarioConfig,
  type ResolvedInputs,
  type ScenarioSection,
  type AssumptionsOverlay,
  type PhaseOverlay,
  type PhaseProfileOverlay,
  type CapacityOverlay,
  type CrewOverlay,
  type SustainabilityOverlay,
  type PickupPointOverlay,
  type SalesOverlay,
  type ForecastOverlay,
  type ResourceOverlay,
  type RouteStepOverlay,
  type SchedulePolicyOverlay,
} from '@/engine/scenario';
import { routeKey } from '@/engine/routing';
import type { SubscriberDef } from '@/data/subscribers';
import { crews as seedCrews, LEGACY_SEED_CREWS, type NewCrewDefaults } from '@/data/crews';
import type { DateRange } from '@/engine/periods';
import { leaseholdSeed, type EquipmentLine, type LeaseholdLine } from '@/data/capex';
import { seedPackagingLibrary, type PackagingLibrary } from '@/data/packaging';
import type { CatalogLine } from '@/engine/catalog';
import { codeSeedLoans, seedFixedCostLines, type FixedCostLineDef, type LoanDef } from '@/data/finance';
import type { TimeStudyDoc } from '@/data/time-studies';
import { NUTRIENT_SOLUTIONS, type NutrientSolutionDef } from '@/data/inputs-catalog';

const clone = <T,>(v: T): T => structuredClone(v);

function sectionEquals(
  a: FarmScenarioConfig,
  b: FarmScenarioConfig,
  section: ScenarioSection,
): boolean {
  return JSON.stringify(a[section] ?? {}) === JSON.stringify(b[section] ?? {});
}

export interface ScenarioStore {
  /** The current working draft overlay. */
  config: FarmScenarioConfig;
  /** Defaults + draft, engine-shaped. Recomputes on every edit. */
  resolved: ResolvedInputs;
  /** The live master the session loaded (applied scenario, or {} = defaults). */
  baseline: FarmScenarioConfig;
  /** Sections where the draft differs from the baseline. */
  dirtySections: ScenarioSection[];
  isDirty: boolean;

  // Typed setters (undefined clears the override back to the default).
  setAssumption: <G extends keyof AssumptionsOverlay>(
    group: G,
    key: keyof NonNullable<AssumptionsOverlay[G]>,
    value: number | undefined,
  ) => void;
  setCapacity: (key: keyof CapacityOverlay, value: number | undefined) => void;
  /** Edit one crew's fields in place (keyed by crew id); empty rows are pruned. */
  setCrew: (id: string, fn: (draft: CrewOverlay) => void) => void;
  /** Add a crew to this scenario; returns its id. */
  addCrew: (defaults: NewCrewDefaults) => string;
  /** Take a crew out of this scenario (a seeded crew is marked removed; an added one is dropped). */
  removeCrew: (id: string) => void;
  /** The crop plan library as loaded (no scenario edits) — the standard the edits are measured against. */
  library: GrowPlanDef[];
  /** The Nutrients & Supplements library as loaded; the seed list when the server passed none. */
  nutrients: NutrientSolutionDef[];
  setPhase: (phase: number, key: keyof PhaseOverlay, value: number | undefined) => void;
  setPhaseProfile: (
    phase: number,
    key: keyof PhaseProfileOverlay,
    value: number | undefined,
  ) => void;
  setCapexFinance: (key: string, value: number | undefined) => void;
  /** Edit one loan on this scenario, keyed by its stable key (Roadmap N1). */
  setLoan: (key: string, patch: Partial<{ principalCents: number; apr: number; termMonths: number; startDate: string; status: 'planned' | 'funded' }>) => void;
  /** Edit one fixed-cost line on this scenario, keyed by its stable key (Roadmap N1). */
  setFixedCostLine: (key: string, patch: Partial<{ monthlyAmountCents: number; status: 'planned' | 'in_force'; startDate: string | null; endDate: string | null; householdAmountCents: number | null; allocationShare: number | null; householdQuantity: number | null }>) => void;
  /** Edit one leasehold line on this scenario; `counted: false` keeps it on record, out of the rollup. */
  setLeasehold: (key: string, patch: Partial<{ extended: number; counted: boolean }>) => void;
  /** Choose the LCA basis for one input (undefined = study mean). Super admins only. */
  setInputBasis: (name: string, optionId: string | undefined) => void;
  /** Edit any sustainability activity input in place; empty sub-objects are pruned. */
  setSustainability: (fn: (draft: SustainabilityOverlay) => void) => void;
  /** Link a typed activity input to the document it came from (undefined unlinks). */
  setDocumentLink: (key: string, sourceId: string | undefined) => void;
  /** Edit one distribution pickup point's links and overrides (keyed by pickup point id). */
  setPickupPoint: (pickupPointId: string, fn: (draft: PickupPointOverlay) => void) => void;
  /** Edit one prospect's links (keyed by prospect prospect id). */
  setSales: (prospectId: string, fn: (draft: SalesOverlay) => void) => void;
  /** Edit what the forecast is built from (Roadmap N4a); empty entries are pruned. */
  setForecast: (fn: (draft: ForecastOverlay) => void) => void;
  /** Edit one route step of a crop plan (keyed by crop plan code and step id); undefined fields are cleared. */
  setRouteStep: (cropPlanCode: string, stepId: string, fn: (draft: RouteStepOverlay) => void) => void;
  /** Edit one unit's resource attributes (keyed by equipment key); undefined fields are cleared. */
  setResource: (key: string, fn: (draft: ResourceOverlay) => void) => void;
  /** Set one schedule policy field (undefined clears it back to the default). */
  setSchedulePolicy: <K extends keyof SchedulePolicyOverlay>(key: K, value: SchedulePolicyOverlay[K] | undefined) => void;
  /** Whether the signed-in admin may apply the live model and edit the LCA basis. */
  isSuperAdmin: boolean;

  /** Revert one section to the live master. */
  resetSection: (section: ScenarioSection) => void;
  /** Revert the whole draft to the live master. */
  resetAll: () => void;
  /** Clear every override back to plan-data defaults (empty overlay). */
  clearAll: () => void;
  /** Replace the whole draft (e.g. loading a saved forecast). */
  loadConfig: (config: FarmScenarioConfig) => void;
  /** Rebase the baseline after a successful Save/Apply (next checkpoint). */
  commitBaseline: (config: FarmScenarioConfig) => void;
}

const ScenarioContext = createContext<ScenarioStore | null>(null);

export function ScenarioProvider({
  initialConfig,
  library,
  subscribers,
  closures,
  equipment,
  packaging,
  catalog,
  loans,
  fixedCostLines,
  leasehold,
  timeStudies,
  nutrients,
  isSuperAdmin = false,
  children,
}: {
  /** The open scenario's config the server loaded; omit for plan-data defaults. */
  initialConfig?: FarmScenarioConfig;
  /** The crop plan library the server loaded; omit for the seed list. */
  library?: GrowPlanDef[];
  /** The subscriber library the server loaded; omit for the seed placeholders. */
  subscribers?: SubscriberDef[];
  /** Farm closures from the production calendar; production days per year count off them. */
  closures?: DateRange[];
  /** The equipment library the server loaded; omit for the seed. */
  equipment?: EquipmentLine[];
  /** The packaging library the server loaded; omit for the seed. */
  packaging?: PackagingLibrary;
  /** Supplier catalog lines by supplier id; omit when no catalog is on file. */
  catalog?: Record<string, CatalogLine[]>;
  /** The loans the server loaded; omit for the seed. */
  loans?: LoanDef[];
  /** The fixed-cost lines the server loaded; omit for the seed. */
  fixedCostLines?: FixedCostLineDef[];
  /** The leasehold schedule the server loaded; omit for the seed. */
  leasehold?: LeaseholdLine[];
  /** The time-study library the server loaded; omit and each crop plan's labor is its code estimate (Roadmap N3). */
  timeStudies?: TimeStudyDoc[];
  /** The Nutrients & Supplements library the server loaded; omit for the seed list. */
  nutrients?: NutrientSolutionDef[];
  isSuperAdmin?: boolean;
  children: ReactNode;
}) {
  const seed = useMemo(() => initialConfig ?? {}, [initialConfig]);
  const lib = useMemo(() => library ?? [], [library]);
  const custs = useMemo(() => subscribers ?? [], [subscribers]);
  const cal = useMemo(() => closures ?? [], [closures]);
  const equip = useMemo(() => equipment ?? [], [equipment]);
  const pack = useMemo(() => packaging ?? seedPackagingLibrary(), [packaging]);
  const cat = useMemo(() => catalog ?? {}, [catalog]);
  const loanLib = useMemo(() => loans ?? codeSeedLoans(), [loans]);
  const fixedLib = useMemo(() => fixedCostLines ?? seedFixedCostLines(), [fixedCostLines]);
  const leaseLib = useMemo(() => leasehold ?? leaseholdSeed, [leasehold]);
  const studyLib = useMemo(() => timeStudies ?? null, [timeStudies]);
  const nutrientLib = useMemo(() => nutrients ?? [...NUTRIENT_SOLUTIONS], [nutrients]);
  const [baseline, setBaseline] = useState<FarmScenarioConfig>(() => clone(seed));
  const [config, setConfig] = useState<FarmScenarioConfig>(() => clone(seed));

  const resolved = useMemo(
    () => resolveScenarioInputs(config, lib, custs, cal, undefined, equip, pack, cat, undefined, loanLib, fixedLib, leaseLib, studyLib),
    [config, lib, custs, cal, equip, pack, cat, loanLib, fixedLib, leaseLib, studyLib],
  );

  const dirtySections = useMemo(
    () => SCENARIO_SECTIONS.filter((s) => !sectionEquals(config, baseline, s)),
    [config, baseline],
  );

  // Generic immutable mutate — clone, apply, prune empty sub-objects, set.
  const mutate = useCallback((fn: (draft: FarmScenarioConfig) => void) => {
    setConfig((prev) => {
      const next = clone(prev);
      fn(next);
      return next;
    });
  }, []);

  const setNested = useCallback(
    (
      section: 'assumptions',
      group: keyof AssumptionsOverlay,
      key: string,
      value: number | undefined,
    ) => {
      mutate((d) => {
        const sec = (d.assumptions ??= {});
        const grp = ((sec[group] ??= {}) as Record<string, number>);
        if (value === undefined) delete grp[key];
        else grp[key] = value;
      });
    },
    [mutate],
  );

  const setAssumption = useCallback<ScenarioStore['setAssumption']>(
    (group, key, value) => setNested('assumptions', group, key as string, value),
    [setNested],
  );

  const setCapacity = useCallback<ScenarioStore['setCapacity']>(
    (key, value) => {
      mutate((d) => {
        const sec = (d.capacity ??= {}) as Record<string, number>;
        if (value === undefined) delete sec[key];
        else sec[key] = value;
      });
    },
    [mutate],
  );

  const setCrew = useCallback<ScenarioStore['setCrew']>(
    (id, fn) => {
      mutate((d) => {
        const all = (d.crews ??= {});
        const row = (all[id] ??= {});
        fn(row);
        if (Object.keys(row).length === 0) delete all[id];
        if (Object.keys(all).length === 0) delete d.crews;
      });
    },
    [mutate],
  );

  const addCrew = useCallback<ScenarioStore['addCrew']>((defaults) => {
    let id = '';
    mutate((d) => {
      const all = (d.crews ??= {});
      let n = 1;
      while (all[`crew-${n}`] || seedCrews.some((c) => c.id === `crew-${n}`)) n += 1;
      id = `crew-${n}`;
      all[id] = { label: `Proposed crew ${n}`, ...defaults };
    });
    return id;
  }, [mutate]);

  const removeCrew = useCallback<ScenarioStore['removeCrew']>(
    (id) => {
      mutate((d) => {
        const all = (d.crews ??= {});
        if (seedCrews.some((c) => c.id === id) || id in LEGACY_SEED_CREWS) all[id] = { removed: true };
        else delete all[id];
        if (Object.keys(all).length === 0) delete d.crews;
      });
    },
    [mutate],
  );

  const setPhase = useCallback<ScenarioStore['setPhase']>(
    (phase, key, value) => {
      mutate((d) => {
        const phases = (d.phases ??= {});
        const row = ((phases[phase] ??= {}) as Record<string, number>);
        if (value === undefined) delete row[key];
        else row[key] = value;
        if (Object.keys(row).length === 0) delete phases[phase];
      });
    },
    [mutate],
  );

  const setPhaseProfile = useCallback<ScenarioStore['setPhaseProfile']>(
    (phase, key, value) => {
      mutate((d) => {
        const profiles = (d.phaseProfiles ??= {});
        const row = ((profiles[phase] ??= {}) as Record<string, number>);
        if (value === undefined) delete row[key];
        else row[key] = value;
        if (Object.keys(row).length === 0) delete profiles[phase];
      });
    },
    [mutate],
  );

  const setCapexFinance = useCallback<ScenarioStore['setCapexFinance']>(
    (key, value) => {
      mutate((d) => {
        const capex = (d.capex ??= {});
        const fp = ((capex.financeParams ??= {}) as Record<string, number>);
        if (value === undefined) delete fp[key];
        else fp[key] = value;
      });
    },
    [mutate],
  );

  const setLoan = useCallback<ScenarioStore['setLoan']>(
    (key, patch) => {
      mutate((d) => {
        const capex = (d.capex ??= {});
        const loans = (capex.loans ??= {});
        loans[key] = { ...(loans[key] ?? {}), ...patch };
      });
    },
    [mutate],
  );

  const setFixedCostLine = useCallback<ScenarioStore['setFixedCostLine']>(
    (key, patch) => {
      mutate((d) => {
        const capex = (d.capex ??= {});
        const lines = (capex.fixedCostLines ??= {});
        lines[key] = { ...(lines[key] ?? {}), ...patch };
      });
    },
    [mutate],
  );

  const setLeasehold = useCallback<ScenarioStore['setLeasehold']>(
    (key, patch) => {
      mutate((d) => {
        const capex = (d.capex ??= {});
        const lines = (capex.leasehold ??= {});
        lines[key] = { ...(lines[key] ?? {}), ...patch };
      });
    },
    [mutate],
  );

  const setInputBasis = useCallback<ScenarioStore['setInputBasis']>(
    (name, optionId) => {
      mutate((d) => {
        const sus = (d.sustainability ??= {});
        const basis = (sus.inputBasis ??= {});
        if (optionId === undefined) delete basis[name];
        else basis[name] = optionId;
        if (Object.keys(basis).length === 0) delete sus.inputBasis;
        if (Object.keys(sus).length === 0) delete d.sustainability;
      });
    },
    [mutate],
  );

  const setSustainability = useCallback<ScenarioStore['setSustainability']>(
    (fn) => {
      mutate((d) => {
        const sus = (d.sustainability ??= {});
        fn(sus);
        for (const k of Object.keys(sus) as (keyof SustainabilityOverlay)[]) {
          const v = sus[k];
          if (v && typeof v === 'object' && Object.keys(v).length === 0) delete sus[k];
        }
        if (Object.keys(sus).length === 0) delete d.sustainability;
      });
    },
    [mutate],
  );

  const setDocumentLink = useCallback<ScenarioStore['setDocumentLink']>(
    (key, sourceId) => {
      mutate((d) => {
        const sus = (d.sustainability ??= {});
        const docs = (sus.documents ??= {});
        if (sourceId === undefined) delete docs[key];
        else docs[key] = sourceId;
        if (Object.keys(docs).length === 0) delete sus.documents;
        if (Object.keys(sus).length === 0) delete d.sustainability;
      });
    },
    [mutate],
  );

  const setPickupPoint = useCallback<ScenarioStore['setPickupPoint']>(
    (pickupPointId, fn) => {
      mutate((d) => {
        const all = (d.pickupPoints ??= {});
        const row = (all[pickupPointId] ??= {});
        fn(row);
        if (Object.keys(row).length === 0) delete all[pickupPointId];
        if (Object.keys(all).length === 0) delete d.pickupPoints;
      });
    },
    [mutate],
  );

  const setSales = useCallback<ScenarioStore['setSales']>(
    (prospectId, fn) => {
      mutate((d) => {
        const all = (d.sales ??= {});
        const row = (all[prospectId] ??= {});
        fn(row);
        if (row.cropPlanCodes && row.cropPlanCodes.length === 0) delete row.cropPlanCodes;
        if (Object.keys(row).length === 0) delete all[prospectId];
        if (Object.keys(all).length === 0) delete d.sales;
      });
    },
    [mutate],
  );

  const setForecast = useCallback<ScenarioStore['setForecast']>(
    (fn) => {
      mutate((d) => {
        const f = (d.forecast ??= {});
        fn(f);
        for (const k of ['subscribers', 'services', 'flatPlans', 'equipment'] as const) {
          const all = f[k] as Record<string, object> | undefined;
          if (!all) continue;
          for (const [id, row] of Object.entries(all)) {
            if (Array.isArray(row)) continue;
            for (const [field, v] of Object.entries(row)) if (v === undefined) delete (row as Record<string, unknown>)[field];
            if (Object.keys(row).length === 0) delete all[id];
          }
          if (Object.keys(all).length === 0) delete f[k];
        }
        if (f.startDate === undefined) delete f.startDate;
        if (f.horizonYears === undefined || f.horizonYears === 1) delete f.horizonYears;
        if (Object.keys(f).length === 0) delete d.forecast;
      });
    },
    [mutate],
  );

  const setRouteStep = useCallback<ScenarioStore['setRouteStep']>(
    (cropPlanCode, stepId, fn) => {
      mutate((d) => {
        const all = (d.routing ??= {});
        const k = routeKey(cropPlanCode, stepId);
        const row = (all[k] ??= {});
        fn(row);
        for (const f of Object.keys(row) as (keyof RouteStepOverlay)[]) if (row[f] === undefined) delete row[f];
        if (Object.keys(row).length === 0) delete all[k];
        if (Object.keys(all).length === 0) delete d.routing;
      });
    },
    [mutate],
  );

  const setResource = useCallback<ScenarioStore['setResource']>(
    (key, fn) => {
      mutate((d) => {
        const all = (d.resources ??= {});
        const row = (all[key] ??= {});
        fn(row);
        for (const f of Object.keys(row) as (keyof ResourceOverlay)[]) if (row[f] === undefined) delete row[f];
        if (Object.keys(row).length === 0) delete all[key];
        if (Object.keys(all).length === 0) delete d.resources;
      });
    },
    [mutate],
  );

  const setSchedulePolicy = useCallback<ScenarioStore['setSchedulePolicy']>(
    (key, value) => {
      mutate((d) => {
        const sec = (d.schedulePolicy ??= {}) as Record<string, unknown>;
        if (value === undefined) delete sec[key];
        else sec[key] = value;
        if (Object.keys(sec).length === 0) delete d.schedulePolicy;
      });
    },
    [mutate],
  );

  const resetSection = useCallback<ScenarioStore['resetSection']>(
    (section) => {
      setConfig((prev) => {
        const next = clone(prev);
        if (baseline[section] === undefined) delete next[section];
        else (next as Record<string, unknown>)[section] = clone(baseline[section]);
        return next;
      });
    },
    [baseline],
  );

  const resetAll = useCallback(() => setConfig(clone(baseline)), [baseline]);
  const clearAll = useCallback(() => setConfig({}), []);
  const loadConfig = useCallback<ScenarioStore['loadConfig']>(
    (next) => setConfig(clone(next)),
    [],
  );
  const commitBaseline = useCallback<ScenarioStore['commitBaseline']>((next) => {
    const c = clone(next);
    setBaseline(c);
    setConfig(clone(c));
  }, []);

  const value = useMemo<ScenarioStore>(
    () => ({
      config,
      resolved,
      baseline,
      dirtySections,
      isDirty: dirtySections.length > 0,
      setAssumption,
      setCapacity,
      setCrew,
      addCrew,
      removeCrew,
      setPhase,
      setPhaseProfile,
      setCapexFinance,
      setLoan,
      setFixedCostLine,
      setLeasehold,
      setInputBasis,
      setSustainability,
      setDocumentLink,
      setPickupPoint,
      setSales,
      setForecast,
      setRouteStep,
      setResource,
      setSchedulePolicy,
      library: lib,
      nutrients: nutrientLib,
      isSuperAdmin,
      resetSection,
      resetAll,
      clearAll,
      loadConfig,
      commitBaseline,
    }),
    [
      config,
      resolved,
      baseline,
      dirtySections,
      lib,
      nutrientLib,
      custs,
      setForecast,
      setAssumption,
      setCapacity,
      setCrew,
      addCrew,
      removeCrew,
      setPhase,
      setPhaseProfile,
      setCapexFinance,
      setLoan,
      setFixedCostLine,
      setLeasehold,
      setInputBasis,
      setSustainability,
      setDocumentLink,
      setPickupPoint,
      setSales,
      setRouteStep,
      setResource,
      setSchedulePolicy,
      isSuperAdmin,
      resetSection,
      resetAll,
      clearAll,
      loadConfig,
      commitBaseline,
    ],
  );

  return <ScenarioContext.Provider value={value}>{children}</ScenarioContext.Provider>;
}

/** Read the scenario store. Throws if used outside <ScenarioProvider>. */
export function useScenario(): ScenarioStore {
  const ctx = useContext(ScenarioContext);
  if (!ctx) {
    throw new Error('useScenario must be used within a <ScenarioProvider>.');
  }
  return ctx;
}
