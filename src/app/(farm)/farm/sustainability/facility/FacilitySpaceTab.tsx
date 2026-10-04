'use client';

import { Card, Kpi, StatusBadge, num } from '@/components/ui';
import { FACILITY_ZONES, SPINE_LENGTH_FACTOR, SPINE_WIDTH_FT, STRUCTURAL_GROSS_UP, SUPPORT_NET_TO_GROSS, SUPPORT_PROGRAM_PSM, ZONE_FACTORS } from '@/data/facility-design';
import type { FacilityView } from '@/app/(farm)/farm/sustainability/facility/facility-view';

const r0 = (v: number) => num(Math.round(v));
const r1 = (v: number) => v.toFixed(1);

/**
 * Space: the five layers by cumulative build phase (facility-design roadmap
 * §3, §6–§8), every figure computed from the library as the open forecast
 * phases it. The PSM figure is a what-if on this page: the support program is
 * the only thing it sizes.
 */
export function FacilitySpaceTab({ view }: { view: FacilityView }) {
  const { requirement, psm, setPsm } = view;
  const phases = requirement.phases;
  const full = phases[phases.length - 1]!;
  const first = phases[0]!;
  const zoneNames = FACILITY_ZONES.filter((z) => phases.some((p) => p.floor.zones.some((l) => l.zone === z)));

  return (
    <>
      <div className="grid gap-3 farm-autofit-11">
        <Kpi value={`${r0(first.floor.productionFloorSqFt)} sq ft`} label="Phase 1 production floor" sub="Equipment, aisles, clearances and the cart spine" />
        <Kpi value={`${r0(full.buildingGrossSqFt)} sq ft`} label="Full-build building gross" sub="The figure that sizes a lease" />
        <Kpi value={`${r1(full.hoodFt)} ft`} label="Type I hood, full build" sub={`${r1(first.hoodFt)} ft at Phase 1`} />
        <Kpi value={`${(first.equipmentShare * 100).toFixed(0)}%`} label="Equipment share of the floor" sub="Against the single published rule of thumb of 30%" />
      </div>

      <Card title="The answer — Layers A to E, cumulative by build phase" className="mt-4">
        <div className="farm-scroll-x">
          <table className="farm-table compact">
            <thead>
              <tr>
                <th>Cumulative through</th>
                <th className="num">A · Equipment envelope</th>
                <th className="num">B · Zone gross</th>
                <th className="num">Spine</th>
                <th className="num">C · Production floor</th>
                <th className="num">C × {STRUCTURAL_GROSS_UP}</th>
                <th className="num">D · Support gross</th>
                <th className="num">E · Building gross</th>
                <th className="num">Hood <span className="farm-unit">ft</span></th>
              </tr>
            </thead>
            <tbody>
              {phases.map((p) => (
                <tr key={p.phase} className={p.phase === 3 ? 'total' : undefined}>
                  <td className="font-medium!">Phase {p.phase === 1 ? '1' : p.phase === 2 ? '1+2' : '1+2+3'}</td>
                  <td className="num">{r1(p.envelopeSqFt)}</td>
                  <td className="num">{r1(p.floor.zoneGrossSqFt)}</td>
                  <td className="num">{r0(p.floor.spineSqFt)} <span className="farm-c-faint farm-fs-xs">({SPINE_WIDTH_FT} × {r0(p.floor.spineFt)} ft)</span></td>
                  <td className="num font-semibold!">{r0(p.floor.productionFloorSqFt)}</td>
                  <td className="num">{r0(p.floorGrossedSqFt)}</td>
                  <td className="num">{r0(p.support.grossSqFt)}</td>
                  <td className="num font-semibold!">{r0(p.buildingGrossSqFt)}</td>
                  <td className="num">{r1(p.hoodFt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="farm-kpi-sub mt-2">
          Square feet. A is plan area × quantity, warewash excluded (it is counted once, as the warewash room in D). B applies each zone&rsquo;s circulation factor, or a unit&rsquo;s published clearances, or a walk-in&rsquo;s box and apron. C adds a {SPINE_WIDTH_FT} ft cart spine whose length is {SPINE_LENGTH_FACTOR} × the side of a square block of B. D is the support program at the PSM figure × {SUPPORT_NET_TO_GROSS} net-to-gross. E is C × {STRUCTURAL_GROSS_UP} for walls, columns and partitions, plus D. Phase 1 carries {r0(requirement.idle.grossSqFt)} sq ft of the full-build shell idle, {(requirement.idle.share * 100).toFixed(0)}%, until Phase 2 equipment lands. Mechanical and electrical room area is excluded and is not zero.
        </p>
      </Card>

      <Card title="Layer B — zone gross by phase" className="mt-4">
        <div className="farm-scroll-x">
          <table className="farm-table compact">
            <thead>
              <tr><th>Zone</th><th className="num">Factor</th><th>Derivation</th>{phases.map((p) => <th key={p.phase} className="num">Phase {p.phase === 1 ? '1' : p.phase === 2 ? '1+2' : '1+2+3'}</th>)}</tr>
            </thead>
            <tbody>
              {zoneNames.map((z) => {
                const zf = ZONE_FACTORS.find((f) => f.zone === z)!;
                const lines = phases.map((p) => p.floor.zones.find((l) => l.zone === z) ?? null);
                const direct = lines[lines.length - 1]?.direct ?? [];
                return (
                  <tr key={z} className={`${z === 'Warewash' ? 'farm-c-soft' : ''}`}>
                    <td className="font-medium!">
                      {z}{z === 'Warewash' ? ' (in the support program)' : ''}
                      {direct.length > 0 && <div className="farm-c-faint farm-fs-xs">{direct.map((d) => `${d.item}: ${r1(d.unitGrossSqFt)} each`).join(' · ')}</div>}
                    </td>
                    <td className="num">{zf.factor === 1 && z === 'Walk-in' ? '—' : zf.factor.toFixed(2)}</td>
                    <td className="farm-c-soft farm-fs-xs max-w-104!">{zf.derivation}</td>
                    {lines.map((l, i) => <td key={i} className="num">{l ? r1(l.grossSqFt) : '—'}</td>)}
                  </tr>
                );
              })}
              {requirement.extraRooms.length > 0 && (
                <tr><td className="font-medium!">Potential rooms</td><td className="num">—</td><td className="farm-c-soft">From the Design and Build plan</td>{phases.map((p) => <td key={p.phase} className="num">{r1(p.floor.extraRoomsSqFt)}</td>)}</tr>
              )}
              <tr className="total"><td>Zone gross on the floor</td><td className="num">—</td><td /> {phases.map((p) => <td key={p.phase} className="num">{r1(p.floor.zoneGrossSqFt)}</td>)}</tr>
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Layer D — the support program" className="mt-4">
        <div className="flex flex-wrap gap-3 items-center mb-3!">
          <label className="farm-field flex-row! items-center! gap-2!">
            <span>Peak Single Units</span>
            <input type="number" className="farm-input min-w-28! w-28!" min={0} step={100} value={psm} aria-label="Peak Single Units the support program is sized against" onChange={(ev) => setPsm(Math.max(0, Number(ev.target.value) || 0))} />
          </label>
          <StatusBadge status={SUPPORT_PROGRAM_PSM.status} title={SUPPORT_PROGRAM_PSM.note} />
          {psm !== SUPPORT_PROGRAM_PSM.value && <button type="button" className="farm-btn ghost" onClick={() => setPsm(SUPPORT_PROGRAM_PSM.value)}>Back to {num(SUPPORT_PROGRAM_PSM.value)}</button>}
          <span className="farm-c-faint farm-fs-xs">{SUPPORT_PROGRAM_PSM.note} A what-if on this page, not a saved input.</span>
        </div>
        <div className="farm-scroll-x">
          <table className="farm-table compact">
            <thead><tr><th>Space</th><th className="num">Phase 1 net</th><th className="num">Phase 1+2 net</th><th>Basis</th><th>Status</th></tr></thead>
            <tbody>
              {first.support.lines.map((l, i) => {
                const l2 = phases[1]!.support.lines[i]!;
                return (
                  <tr key={l.key}>
                    <td className="font-medium!">{l.space}</td>
                    <td className="num">{r0(l.netSqFt)}</td>
                    <td className="num">{r0(l2.netSqFt)}</td>
                    <td className="farm-c-soft farm-fs-xs max-w-120!">{l.basis}</td>
                    <td><StatusBadge status={l.status} /></td>
                  </tr>
                );
              })}
              <tr className="total"><td>Support net</td><td className="num">{r0(first.support.netSqFt)}</td><td className="num">{r0(phases[1]!.support.netSqFt)}</td><td colSpan={2} className="farm-c-soft">Phase 3 adds no support space: the a la carte line is production floor and its hardware is bench-mounted.</td></tr>
              <tr className="total"><td>Support gross × {SUPPORT_NET_TO_GROSS}</td><td className="num">{r0(first.support.grossSqFt)}</td><td className="num">{r0(phases[1]!.support.grossSqFt)}</td><td colSpan={2} className="farm-c-soft">DoD Space Planning Criteria Ch. 510, net to department gross for Food and Nutrition Service.</td></tr>
            </tbody>
          </table>
        </div>
        <p className="farm-kpi-sub mt-2">
          Dock lanes: {first.support.dockLanes} at Phase 1, {phases[1]!.support.dockLanes} through Phase 2 (one receiving lane plus one per distribution van on the list). Office, lounge, lockers and toilets scale on FTE; no staffing count is decided, so they hold at the minimums. Per unit at {num(psm)} PSM, full build: {requirement.perUnit.floorSqFt.toFixed(2)} sq ft of production floor and {requirement.perUnit.grossSqFt.toFixed(2)} sq ft of building gross. The published prospect-farm benchmarks (0.9–1.0 sq ft per unit) describe a pickupPoint farm that receives and serves, not a facility that blackouts, packages, holds and ships.
        </p>
      </Card>

      <Card title="The hood" className="mt-4">
        <div className="farm-scroll-x">
          <table className="farm-table compact">
            <thead><tr><th>Run</th><th>Units under the canopy</th><th className="num">Length <span className="farm-unit">ft</span></th><th className="num">Cumulative <span className="farm-unit">ft</span></th></tr></thead>
            <tbody>
              {full.hoodRuns.map((run) => (
                <tr key={run.phase}>
                  <td className="font-medium!">Phase {run.phase}</td>
                  <td className="farm-c-soft farm-fs-sm">{run.units.map((u) => (u.qty > 1 ? `${u.item} × ${u.qty}` : u.item)).join(' · ')}</td>
                  <td className="num">{r1(run.lengthFt)}</td>
                  <td className="num">{r1(phases[run.phase - 1]!.hoodFt)}</td>
                </tr>
              ))}
              {full.hoodRuns.length === 0 && <tr><td colSpan={4} className="farm-c-soft">No unit on the list is marked under a hood.</td></tr>}
            </tbody>
          </table>
        </div>
        <p className="farm-kpi-sub mt-2">One canopy run per build phase&rsquo;s hot units: the sum of their widths plus 6 in overhang at each open end (IMC §507.4.1). The exhaust hood and fire suppression, and HVAC and makeup air, leasehold lines were authored before any run was laid out; both are flagged for re-quote against this length.</p>
      </Card>
    </>
  );
}
