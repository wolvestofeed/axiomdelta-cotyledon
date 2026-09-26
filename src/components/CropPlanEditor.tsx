'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createCropPlan, updateCropPlan } from '@/server/crop-plan-actions';
import { nextCropPlanCode } from '@/engine/crop-plan-library';
import { costGrowPlan, defaultGrowCostContext, fixtureFor } from '@/engine/grow-costing';
import { CROP_PLAN_STATUS_LABELS, type CropPlanStatus } from '@/data/plan-data';
import { codePrefixFor, growPlanProblems, seedLineFor, type GrowPlanDef, type GrowPlanLine, type SeedLine } from '@/data/grow-plan';
import { VARIETIES, VARIETY_BY_KEY } from '@/data/varieties';
import { GROWING_MEDIA, LIGHT_REGIMES, NUTRIENT_SOLUTIONS, type LightRegimeKey, type MediumKey, type NutrientKey } from '@/data/inputs-catalog';
import { PLAN_FORMATS, TRAY_FORMAT_BY_KEY, type TrayFormatKey } from '@/data/tray-formats';
import { STAGES, SPROUT_STAGES, type StageKey } from '@/data/stage-schedule';
import { tagged } from '@/data/tagged';
import { money, num } from '@/components/ui';

/**
 * Add / Edit grow plan — writes to the LIBRARY, not the forecast.
 *
 * A plan saved here is a library plan from that moment: it can be selected on Unit Economics and
 * Capacity, costed and sowing-sized like any other. The code is the lead variety's code and the
 * next serial; a plan with two or more seed lines is a mixed tray under MIX. A blank quantity on a
 * medium, nutrient or light line reads the catalog or the variety record and keeps that record's
 * tag; a typed figure is STATED by this editor. The variety's light and media notes sit beside the
 * light and medium lines.
 */

/** The editor's working copy: plain numbers, null where a line defers to the catalog. */
interface DraftSeed { kind: 'seed'; varietyKey: string; gramsPerTray: number; share: number }
interface DraftMedium { kind: 'medium'; mediumKey: MediumKey; qtyPerTray: number | null }
interface DraftNutrient { kind: 'nutrient'; nutrientKey: NutrientKey; mlPerL: number | null; startsAt: StageKey }
interface DraftLight { kind: 'light'; regimeKey: LightRegimeKey; ppfd: number | null; startsAt: StageKey }
type DraftLine = DraftSeed | DraftMedium | DraftNutrient | DraftLight;

interface Draft {
  code: string;
  name: string;
  status: CropPlanStatus;
  channels: number[];
  format: TrayFormatKey;
  note: string;
  lines: DraftLine[];
}

function toDraftLine(l: GrowPlanLine): DraftLine {
  switch (l.kind) {
    case 'seed':
      return { kind: 'seed', varietyKey: l.varietyKey, gramsPerTray: l.gramsPerTray.value, share: l.share };
    case 'medium':
      return { kind: 'medium', mediumKey: l.mediumKey, qtyPerTray: l.qtyPerTray?.value ?? null };
    case 'nutrient':
      return { kind: 'nutrient', nutrientKey: l.nutrientKey, mlPerL: l.mlPerL?.value ?? null, startsAt: l.startsAt };
    case 'light':
      return { kind: 'light', regimeKey: l.regimeKey, ppfd: l.ppfd?.value ?? null, startsAt: l.startsAt };
  }
}

const EDITOR = 'Typed in the grow plan editor';

/** The draft as a plan, for the live cost and the problems list. */
function toPlan(d: Draft): GrowPlanDef {
  return {
    code: d.code,
    name: d.name,
    status: d.status,
    channels: d.channels,
    format: d.format,
    stageDays: null,
    note: d.note,
    lines: d.lines.map((l): GrowPlanLine => {
      switch (l.kind) {
        case 'seed':
          return { kind: 'seed', varietyKey: l.varietyKey, gramsPerTray: tagged(l.gramsPerTray, 'STATED', 'g', EDITOR), share: l.share };
        case 'medium':
          return { kind: 'medium', mediumKey: l.mediumKey, qtyPerTray: l.qtyPerTray === null ? null : tagged(l.qtyPerTray, 'STATED', 'per tray', EDITOR) };
        case 'nutrient':
          return { kind: 'nutrient', nutrientKey: l.nutrientKey, mlPerL: l.mlPerL === null ? null : tagged(l.mlPerL, 'STATED', 'ml/L', EDITOR), startsAt: l.startsAt };
        case 'light':
          return { kind: 'light', regimeKey: l.regimeKey, ppfd: l.ppfd === null ? null : tagged(l.ppfd, 'STATED', 'µmol/m²/s', EDITOR), startsAt: l.startsAt };
      }
    }),
  };
}

const numOrNull = (s: string): number | null => (s.trim() === '' ? null : Number(s));

export function CropPlanEditor({
  mode,
  plan,
  cropPlanId,
  library,
  channels,
  onDone,
}: {
  mode: 'create' | 'edit';
  /** For edit: the library plan. For create: the plan to duplicate, every field copied under the next code, the name marked as a copy. */
  plan?: GrowPlanDef;
  cropPlanId?: string;
  library: { code: string }[];
  channels: { phase: number; market: string }[];
  onDone: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const codes = useMemo(() => library.map((r) => r.code), [library]);

  const initial: Draft = useMemo(() => {
    const first = VARIETIES[0]!;
    const base: Draft = plan
      ? { code: plan.code, name: plan.name, status: plan.status, channels: [...plan.channels], format: plan.format, note: plan.note, lines: plan.lines.map(toDraftLine) }
      : { code: '', name: first.name, status: 'developing', channels: [1], format: 'flat-1020', note: '', lines: [toDraftLine(seedLineFor(first, 'flat-1020')), { kind: 'medium', mediumKey: first.media.defaultMedium, qtyPerTray: null }, { kind: 'nutrient', nutrientKey: 'floragrow-npk', mlPerL: null, startsAt: 'light' }, { kind: 'light', regimeKey: first.light.defaultRegime, ppfd: null, startsAt: 'light' }] };
    if (mode === 'edit') return base;
    const prefix = codePrefixFor(toPlan(base));
    return { ...base, code: nextCropPlanCode(codes, prefix), name: plan ? `${plan.name} (copy)` : base.name, status: 'developing' };
  }, [mode, plan, codes]);
  const [d, setD] = useState<Draft>(initial);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));
  const setLine = (i: number, fn: (l: DraftLine) => DraftLine) => setD((x) => ({ ...x, lines: x.lines.map((l, li) => (li === i ? fn(l) : l)) }));
  const removeLine = (i: number) => setD((x) => ({ ...x, lines: x.lines.filter((_, li) => li !== i) }));
  const addLine = (line: DraftLine) => setD((x) => ({ ...x, lines: [...x.lines, line] }));

  const livePlan = useMemo(() => toPlan(d), [d]);
  const problems = useMemo(() => growPlanProblems(livePlan), [livePlan]);
  const costing = useMemo(() => (problems.length === 0 ? costGrowPlan(livePlan, defaultGrowCostContext({ fixture: fixtureFor(livePlan) })) : null), [livePlan, problems]);
  const stages = TRAY_FORMAT_BY_KEY[d.format].kind === 'sprout' ? SPROUT_STAGES : STAGES;
  const lead = d.lines.find((l): l is DraftSeed => l.kind === 'seed');
  const leadVariety = lead ? VARIETY_BY_KEY[lead.varietyKey] : undefined;
  const isSprout = TRAY_FORMAT_BY_KEY[d.format].kind === 'sprout';

  /** On create, the code follows the lead variety until someone types one. */
  const [codeTyped, setCodeTyped] = useState(mode === 'edit');
  function recode(next: Draft): Draft {
    if (codeTyped) return next;
    return { ...next, code: nextCropPlanCode(codes, codePrefixFor(toPlan(next))) };
  }

  function setVariety(i: number, key: string) {
    const v = VARIETY_BY_KEY[key];
    if (!v) return;
    setD((x) => {
      const lines = x.lines.map((l, li): DraftLine => (li === i && l.kind === 'seed' ? { ...l, varietyKey: key, gramsPerTray: (seedLineFor(v, x.format, l.share) as SeedLine).gramsPerTray.value } : l));
      const seeds = lines.filter((l) => l.kind === 'seed');
      const name = seeds.length === 1 && i === 0 && !x.name.includes('(copy)') ? v.name : x.name;
      return recode({ ...x, lines, name });
    });
  }

  function setFormat(format: TrayFormatKey) {
    setD((x) => {
      const sprout = TRAY_FORMAT_BY_KEY[format].kind === 'sprout';
      const lines = x.lines
        .filter((l) => !sprout || l.kind === 'seed')
        .map((l): DraftLine => (l.kind === 'seed' && VARIETY_BY_KEY[l.varietyKey] ? { ...l, gramsPerTray: (seedLineFor(VARIETY_BY_KEY[l.varietyKey]!, format, l.share) as SeedLine).gramsPerTray.value } : l));
      return { ...x, format, lines };
    });
  }

  function save() {
    setErr(null);
    start(async () => {
      const payload = { ...d, ...(mode === 'edit' && cropPlanId ? { id: cropPlanId } : {}) };
      const res = mode === 'edit' ? await updateCropPlan(payload) : await createCropPlan(payload);
      if (!res.ok) {
        setErr(res.error);
        return;
      }
      router.refresh();
      onDone();
    });
  }

  const lineCost = (i: number) => costing?.lines[i];

  return (
    <div className="farm-card mt-3!">
      <div className="farm-card-title">{mode === 'edit' ? `Edit grow plan — ${d.code} (library)` : plan ? `Duplicate grow plan — from ${plan.code}, saved to the library as ${d.code}` : `Add grow plan — saved to the library as ${d.code}`}</div>
      <div className="flex flex-wrap gap-3 items-end mb-3!">
        <label className="farm-kpi-sub">Code<br /><input className="farm-input w-32!" value={d.code} onChange={(e) => { setCodeTyped(true); set('code', e.target.value.toUpperCase()); }} /></label>
        <label className="farm-kpi-sub flex-1! min-w-56!">Name<br /><input className="farm-input w-full!" value={d.name} onChange={(e) => set('name', e.target.value)} /></label>
        <label className="farm-kpi-sub">Status<br />
          <select className="farm-select" value={d.status} onChange={(e) => set('status', e.target.value as CropPlanStatus)}>
            {(Object.keys(CROP_PLAN_STATUS_LABELS) as CropPlanStatus[]).map((s) => <option key={s} value={s}>{CROP_PLAN_STATUS_LABELS[s]}</option>)}
          </select>
        </label>
        <label className="farm-kpi-sub">Format<br />
          <select className="farm-select" value={d.format} onChange={(e) => setFormat(e.target.value as TrayFormatKey)}>
            {PLAN_FORMATS.map((f) => <option key={f.key} value={f.key}>{f.name}</option>)}
          </select>
        </label>
        <div className="farm-kpi-sub">Channels<br />
          <span className="inline-flex gap-[0.6rem] mt-[0.2rem]!">
            {channels.map((c) => (
              <label key={c.phase} className="inline-flex! gap-1! items-center!">
                <input type="checkbox" checked={d.channels.includes(c.phase)} onChange={(e) => set('channels', e.target.checked ? [...d.channels, c.phase].sort() : d.channels.filter((p) => p !== c.phase))} />
                {c.market}
              </label>
            ))}
          </span>
        </div>
      </div>
      <label className="farm-kpi-sub block mb-3!">Note<br /><input className="farm-input w-full!" value={d.note} onChange={(e) => set('note', e.target.value)} /></label>

      <div className="flex gap-2 items-center flex-wrap mb-2!">
        <span className="farm-card-title m-0!">Lines — one {TRAY_FORMAT_BY_KEY[d.format].name}</span>
        <button type="button" className="farm-btn" onClick={() => { const v = VARIETIES.find((x) => !d.lines.some((l) => l.kind === 'seed' && l.varietyKey === x.key)) ?? VARIETIES[0]!; const share = 1 / (d.lines.filter((l) => l.kind === 'seed').length + 1); setD((x) => recode({ ...x, lines: [...x.lines.map((l) => (l.kind === 'seed' ? { ...l, share } : l)), toDraftLine(seedLineFor(v, x.format, share))] })); }}>+ seed line</button>
        {!isSprout && !d.lines.some((l) => l.kind === 'medium') && <button type="button" className="farm-btn" onClick={() => addLine({ kind: 'medium', mediumKey: leadVariety?.media.defaultMedium ?? 'coco-coir', qtyPerTray: null })}>+ medium line</button>}
        {!isSprout && <button type="button" className="farm-btn" onClick={() => addLine({ kind: 'nutrient', nutrientKey: 'floragrow-npk', mlPerL: null, startsAt: 'light' })}>+ nutrient line</button>}
        {!isSprout && !d.lines.some((l) => l.kind === 'light') && <button type="button" className="farm-btn" onClick={() => addLine({ kind: 'light', regimeKey: leadVariety?.light.defaultRegime ?? 'balanced', ppfd: null, startsAt: 'light' })}>+ light line</button>}
      </div>
      <div className="farm-scroll-x">
        <table className="farm-table">
          <thead>
            <tr><th>Kind</th><th>What</th><th className="num">Quantity</th><th>Starts at</th><th>Reads from</th><th className="num">Cost per tray</th><th /></tr>
          </thead>
          <tbody>
            {d.lines.map((l, i) => {
              const c = lineCost(i);
              return (
                <tr key={i}>
                  <td>{l.kind === 'seed' ? 'Seed' : l.kind === 'medium' ? 'Medium' : l.kind === 'nutrient' ? 'Nutrient' : 'Light'}</td>
                  <td>
                    {l.kind === 'seed' && (
                      <select className="farm-select" value={l.varietyKey} onChange={(e) => setVariety(i, e.target.value)}>
                        {VARIETIES.map((v) => <option key={v.key} value={v.key}>{v.code} — {v.name}</option>)}
                      </select>
                    )}
                    {l.kind === 'medium' && (
                      <select className="farm-select" value={l.mediumKey} onChange={(e) => setLine(i, (x) => ({ ...(x as DraftMedium), mediumKey: e.target.value as MediumKey }))}>
                        {GROWING_MEDIA.map((m) => <option key={m.key} value={m.key}>{m.name}</option>)}
                      </select>
                    )}
                    {l.kind === 'nutrient' && (
                      <select className="farm-select" value={l.nutrientKey} onChange={(e) => setLine(i, (x) => ({ ...(x as DraftNutrient), nutrientKey: e.target.value as NutrientKey }))}>
                        {NUTRIENT_SOLUTIONS.map((n) => <option key={n.key} value={n.key}>{n.name}</option>)}
                      </select>
                    )}
                    {l.kind === 'light' && (
                      <select className="farm-select" value={l.regimeKey} onChange={(e) => setLine(i, (x) => ({ ...(x as DraftLight), regimeKey: e.target.value as LightRegimeKey }))}>
                        {LIGHT_REGIMES.map((r) => <option key={r.key} value={r.key}>{r.name}</option>)}
                      </select>
                    )}
                  </td>
                  <td className="num">
                    {l.kind === 'seed' && (
                      <span className="inline-flex gap-1 items-center">
                        <input className="farm-num-input" type="number" min={0} step={1} value={l.gramsPerTray} onChange={(e) => setLine(i, (x) => ({ ...(x as DraftSeed), gramsPerTray: Number(e.target.value) }))} /> g
                        {d.lines.filter((x) => x.kind === 'seed').length > 1 && <><input className="farm-num-input" type="number" min={0} max={1} step={0.05} title="Share of the tray" value={l.share} onChange={(e) => setLine(i, (x) => ({ ...(x as DraftSeed), share: Number(e.target.value) }))} /> share</>}
                      </span>
                    )}
                    {l.kind === 'medium' && <span className="inline-flex gap-1 items-center"><input className="farm-num-input" type="number" min={0} step={0.1} placeholder="catalog" value={l.qtyPerTray ?? ''} onChange={(e) => setLine(i, (x) => ({ ...(x as DraftMedium), qtyPerTray: numOrNull(e.target.value) }))} /> {GROWING_MEDIA.find((m) => m.key === l.mediumKey)?.unit ?? ''}</span>}
                    {l.kind === 'nutrient' && <span className="inline-flex gap-1 items-center"><input className="farm-num-input" type="number" min={0} step={0.1} placeholder="catalog" value={l.mlPerL ?? ''} onChange={(e) => setLine(i, (x) => ({ ...(x as DraftNutrient), mlPerL: numOrNull(e.target.value) }))} /> ml/L</span>}
                    {l.kind === 'light' && <span className="inline-flex gap-1 items-center"><input className="farm-num-input" type="number" min={0} step={5} placeholder="regime" value={l.ppfd ?? ''} onChange={(e) => setLine(i, (x) => ({ ...(x as DraftLight), ppfd: numOrNull(e.target.value) }))} /> µmol</span>}
                  </td>
                  <td>
                    {(l.kind === 'nutrient' || l.kind === 'light') && (
                      <select className="farm-select" value={l.startsAt} onChange={(e) => setLine(i, (x) => ({ ...(x as DraftNutrient | DraftLight), startsAt: e.target.value as StageKey }))}>
                        {stages.filter((s) => s.key !== 'packed').map((s) => <option key={s.key} value={s.key}>{s.name}</option>)}
                      </select>
                    )}
                  </td>
                  <td className="farm-kpi-sub">{c?.basis ?? ''}</td>
                  <td className="num">{c ? money(c.costPerTray) : '—'}</td>
                  <td><button type="button" className="farm-btn py-[0.1rem]! px-[0.4rem]!" onClick={() => removeLine(i)}>×</button></td>
                </tr>
              );
            })}
          </tbody>
          {costing && (
            <tfoot>
              <tr><td colSpan={5}>Consumables — tray set over its uses, sanitizer</td><td className="num">{money(costing.perTray.consumables)}</td><td /></tr>
              <tr><td colSpan={5}><strong>One {costing.format.name}</strong> · {num(costing.seedGramsPerTray, 0)} g seed · {num(costing.harvestGramsPerTray, 0)} g harvest ({costing.lines.some((l) => l.status === 'PLACEHOLDER') ? 'placeholder figures present' : 'every figure tagged'}) · {costing.cycleDays} cycle days</td><td className="num"><strong>{money(costing.perTray.total)}</strong></td><td /></tr>
            </tfoot>
          )}
        </table>
      </div>

      {leadVariety && !isSprout && (
        <div className="grid gap-2 mt-3! md:grid-cols-2">
          <div>
            <div className="farm-kpi-sub">{leadVariety.name} — light</div>
            <ul className="farm-kpi-sub list-disc pl-5">
              {leadVariety.light.ppfdRange && <li>Own range {leadVariety.light.ppfdRange.min} to {leadVariety.light.ppfdRange.max} µmol/m²/s (rows {leadVariety.light.ppfdRange.rows.join(', ')}).</li>}
              {leadVariety.light.notes.map((n, k) => <li key={k}>{n.text} (rows {n.rows.join(', ')})</li>)}
              {!leadVariety.light.ppfdRange && leadVariety.light.notes.length === 0 && <li>No studied light response on file; the regime target stands.</li>}
            </ul>
          </div>
          <div>
            <div className="farm-kpi-sub">{leadVariety.name} — medium</div>
            <ul className="farm-kpi-sub list-disc pl-5">
              {leadVariety.media.notes.map((n, k) => <li key={k}>{n.text}{n.rows.length ? ` (rows ${n.rows.join(', ')})` : ''}</li>)}
              {leadVariety.media.notes.length === 0 && <li>No studied media response on file; the default medium stands.</li>}
            </ul>
          </div>
        </div>
      )}

      {problems.length > 0 && <ul className="farm-kpi-sub mt-2 list-disc pl-5">{problems.map((p) => <li key={p}>{p}</li>)}</ul>}
      {err && <div className="farm-scenariobar-msg err mt-2" role="status">{err}</div>}
      <div className="flex gap-2 mt-3!">
        <button type="button" className="farm-btn primary" onClick={save} disabled={pending || problems.length > 0 || !d.name.trim()}>{mode === 'edit' ? 'Save to library' : 'Add to library'}</button>
        <button type="button" className="farm-btn" onClick={onDone} disabled={pending}>Cancel</button>
      </div>
    </div>
  );
}
