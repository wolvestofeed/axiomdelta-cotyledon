'use client';

import { Card, Kpi, StatusBadge, num } from '@/components/ui';
import { APPROVED_CONFIGURATION, DESIGN_ROOMS, OPEN_DECISIONS, WHAT_MOVES_THE_NUMBER } from '@/data/facility-design';
import { designRoomZoneSqFt } from '@/engine/facility';
import type { FacilityView } from '@/app/(farm)/farm/sustainability/facility/facility-view';

const sq = (v: number) => `${num(Math.round(v))} sq ft`;

/**
 * The Facility Design and Build plan: the master document of the approved
 * configuration and the potential design and build-out options. A potential room is documented here with its area, cost, impact
 * and risk. It is not an equipment row, not a forecast input, and never in the
 * Plan or Actual ledger; what it would add to the shell is computed live from
 * its geometry and shown beside the baseline.
 */
export function FacilityDesignTab({ view }: { view: FacilityView }) {
  const { requirement, configurations } = view;
  const full = requirement.phases[requirement.phases.length - 1]!;
  const first = requirement.phases[0]!;
  const potential = DESIGN_ROOMS.filter((r) => r.status === 'potential');
  const cfgOf = (label: string) => configurations.find((c) => c.label === label);

  return (
    <>
      <div className="grid gap-3 farm-autofit-11">
        <Kpi value={sq(first.buildingGrossSqFt)} label="Phase 1 building gross" sub="Baseline: current equipment, ambient packaging, 7-day hold" />
        <Kpi value={sq(full.buildingGrossSqFt)} label="Full-build building gross" sub="Phases 1+2+3; the shell is leased once" />
        <Kpi value={sq(requirement.idle.grossSqFt)} label="Carried idle at open" sub={`${(requirement.idle.share * 100).toFixed(0)}% of the shell until Phase 2 lands`} />
        <Kpi value={`${configurations[0]!.shelfLifeDays} days`} label="Shelf life, baseline" sub="Food Code 3-502.12(D)(c), 41°F or less" />
      </div>

      <Card title="Approved configuration — Phase 1 baseline" className="mt-4">
        <div className="farm-scroll-x">
          <table className="farm-table compact">
            <thead><tr><th>What</th><th>Value</th><th>Why</th></tr></thead>
            <tbody>
              {APPROVED_CONFIGURATION.map((a) => (
                <tr key={a.item}><td className="font-medium!">{a.item}</td><td>{a.value}</td><td className="farm-c-soft">{a.why}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="farm-kpi-sub mt-2">
          The baseline figures describe this configuration, read from the equipment library as {view.basis === 'forecast' ? `the open forecast "${view.scenarioLabel}"` : 'the plan of record'} phases it. The Peak Single Units figure sizes only the support program; it is not a demand or capacity input anywhere in the platform.
        </p>
      </Card>

      <Card title="The shell under each configuration" className="mt-4">
        <div className="farm-scroll-x">
          <table className="farm-table compact">
            <thead>
              <tr>
                <th>Configuration</th>
                <th className="num">Phase 1 floor</th>
                <th className="num">Phase 1 gross</th>
                <th className="num">1+2 floor</th>
                <th className="num">1+2 gross</th>
                <th className="num">1+2+3 floor</th>
                <th className="num">1+2+3 gross</th>
                <th className="num">Shelf life</th>
              </tr>
            </thead>
            <tbody>
              {configurations.map((c) => (
                <tr key={c.label} className={c.rooms.length === 0 ? 'total' : undefined}>
                  <td className={`${(c.rooms.length === 0 ? 'font-semibold!' : 'font-medium!')}`}>{c.label}</td>
                  {c.requirement.phases.flatMap((p) => [
                    <td key={`${p.phase}f`} className="num">{num(Math.round(p.floor.productionFloorSqFt))}</td>,
                    <td key={`${p.phase}g`} className="num">{num(Math.round(p.buildingGrossSqFt))}</td>,
                  ])}
                  <td className="num">{c.shelfLifeDays} days</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="farm-kpi-sub mt-2">
          Square feet, cumulative through each build phase. The full spread between the baseline and every potential room at full build is {sq(configurations[configurations.length - 1]!.requirement.phases[2]!.buildingGrossSqFt - full.buildingGrossSqFt)}, about {((configurations[configurations.length - 1]!.requirement.phases[2]!.buildingGrossSqFt / full.buildingGrossSqFt - 1) * 100).toFixed(0)}%. Neither room is a square-footage decision; each is a capital, refrigeration and compliance decision that occupies floor.
        </p>
      </Card>

      {potential.map((room) => {
        const cfg = cfgOf(`+ ${room.name}`);
        const zoneAdd = designRoomZoneSqFt(room);
        return (
          <Card key={room.id} title={`Potential room — ${room.name}`} className="mt-4">
            <div className="grid gap-3 farm-autofit-11">
              <Kpi value="Potential" label="Status" sub={room.buildPhase} />
              <Kpi value={sq(zoneAdd)} label="Zone gross it adds" sub={room.geometry.kind === 'walk_in' ? `${room.geometry.widthFt} × ${room.geometry.depthFt} ft box, panel clearance and apron` : 'Over the ambient packaging zone'} />
              <Kpi value={cfg ? `+${sq(cfg.requirement.phases[2]!.buildingGrossSqFt - full.buildingGrossSqFt)}` : '—'} label="Building gross it adds" sub="Full build, spine and structure recomputed" />
              <Kpi value={<span className="inline-flex items-center gap-2">{room.cost.value === null ? 'No quote' : `$${num(room.cost.value)}`}<StatusBadge status={room.cost.status} title={room.cost.note} /></span>} label="Cost" sub={room.shelfLifeDays ? `Shelf life ${room.shelfLifeDays} days` : 'No change to shelf life'} />
            </div>
            <p className="mt-3 farm-fs-base leading-[1.5]!">{room.statusNote}</p>
            <p className="mt-2 farm-c-soft farm-fs-sm leading-[1.5]!"><span className="font-semibold farm-c-ink">Area. </span>{room.geometry.note}</p>
            <p className="mt-2 farm-c-soft farm-fs-sm leading-[1.5]!"><span className="font-semibold farm-c-ink">Cost. </span>{room.cost.note}</p>
            <p className="mt-2 farm-c-soft farm-fs-sm leading-[1.5]!"><span className="font-semibold farm-c-ink">Authority. </span>{room.authority}</p>
            <div className="grid gap-3 mt-3 farm-autofit-18">
              <div>
                <div className="farm-card-title">Impact</div>
                <ul className="m-0! pl-[1.1rem] farm-fs-sm leading-[1.5]">{room.impact.map((t) => <li key={t}>{t}</li>)}</ul>
              </div>
              <div>
                <div className="farm-card-title">Risk</div>
                <ul className="m-0! pl-[1.1rem] farm-fs-sm leading-[1.5]">{room.risk.map((t) => <li key={t}>{t}</li>)}</ul>
              </div>
            </div>
            <p className="farm-kpi-sub mt-3">Documented on this plan only. Not an equipment row, not a forecast input, not in the Plan or Actual ledger. Capital and financing do not read it.</p>
          </Card>
        );
      })}

      <Card title="Open decisions the block plan needs" className="mt-4">
        <div className="farm-scroll-x">
          <table className="farm-table compact">
            <thead><tr><th>Question</th><th>What turns on it</th></tr></thead>
            <tbody>
              {OPEN_DECISIONS.map((d) => (
                <tr key={d.question}><td className="font-medium! min-w-64!">{d.question}</td><td className="farm-c-soft">{d.consequence}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="What would move the number" className="mt-4">
        <ul className="m-0! pl-[1.1rem] farm-fs-base leading-[1.55]">{WHAT_MOVES_THE_NUMBER.map((t) => <li key={t} className="mb-[0.3rem]!">{t}</li>)}</ul>
        <p className="farm-c-faint farm-fs-xs mt-[0.6rem]!">Mechanical and electrical room area is excluded from every figure on this page: no published foodservice allowance exists for it, and it is not zero.</p>
      </Card>
    </>
  );
}
