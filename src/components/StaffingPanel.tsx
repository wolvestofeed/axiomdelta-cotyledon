'use client';

import Link from 'next/link';
import { Kpi, num } from '@/components/ui';
import { clock } from '@/data/crews';
import type { LaborRequirement, StaffingCheck } from '@/engine/staffing';

const hrs = (h: number) => (Math.round(h * 10) / 10).toFixed(1);

/**
 * The labor a sow day requires, and proposed crews checked against it. The requirement is each
 * plan's sowing-stream lines from its labor standard; the Day Schedule places them on the clock.
 * Crews only produce findings: the ceiling is the grow units' and nothing here moves it.
 */
export function StaffingPanel({ labor, staffing }: { labor: LaborRequirement; staffing: StaffingCheck }) {
  const mostOnATask = labor.unplaced.reduce((m, t) => Math.max(m, t.staff), 0);
  return (
    <div>
      <div className="grid gap-3 farm-autofit-11">
        <Kpi value={`${hrs(labor.totalStaffHours)} h`} label="Staff-hours required" sub={`The sowing stream for ${num(labor.units)} trays in ${num(labor.sowings)} ${labor.sowings === 1 ? 'sowing' : 'sowings'}`} />
        <Kpi value={num(mostOnATask)} label="Most people on one task" sub="From the plans' labor standards" />
        <Kpi value={staffing.checked ? num(staffing.crews) : 'None'} label="Crews proposed" sub={staffing.checked ? `${hrs(staffing.crewStaffHours)} staff-hours, ${num(staffing.proposedFloorHeadcount)} people` : 'Nothing is checked until a crew is entered'} />
        <Kpi value={staffing.checked ? num(staffing.findings.length) : '—'} label="Staffing findings" sub={staffing.checked ? 'Against the day’s staff-hours' : 'No crew proposed'} />
      </div>

      <div className="farm-scroll-x mt-3">
        <table className="farm-table">
          <thead>
            <tr><th>Sowing-stream task</th><th className="num">People at once</th><th className="num">Staff-hours for the day</th><th>Scales with</th><th>CONTROL POINT</th></tr>
          </thead>
          <tbody>
            {labor.unplaced.map((t) => (
              <tr key={t.task}>
                <td>{t.task}<div className="farm-c-faint farm-fs-xs">{t.station}</div></td>
                <td className="num">{t.staff}</td>
                <td className="num">{(t.laborMinutes / 60).toFixed(2)}</td>
                <td>{t.scalesWith === 'fixed' ? `sowings (${labor.sowings})` : `trays (${num(labor.units)})`}</td>
                <td>{t.controlPoint ?? '—'}</td>
              </tr>
            ))}
            <tr className="total"><td>Sowing stream</td><td /><td className="num">{hrs(labor.unplacedStaffHours)}</td><td colSpan={2} /></tr>
          </tbody>
        </table>
      </div>
      <p className="farm-kpi-sub mt-2">
        Each plan&rsquo;s sowing-stream lines from its labor standard: a fixed line once per sowing, a per-tray line on the study&rsquo;s sowing size times the trays sown. The <Link className="farm-link" href="/farm/production-planning/schedule">Day Schedule</Link> places them on the clock; here their hours are checked against the crews&rsquo; staff-hours only.
      </p>

      <div className="mt-3">
        {!staffing.checked ? (
          <p className="farm-kpi-sub">No crew is proposed. The requirement above stands on its own and nothing is checked against it.</p>
        ) : staffing.findings.length === 0 ? (
          <p className="farm-kpi-sub">No findings: the proposed crews cover the day&rsquo;s staff-hours.</p>
        ) : (
          <div className="farm-scroll-x">
            <table className="farm-table">
              <thead><tr><th className="num">At</th><th>Staffing finding</th></tr></thead>
              <tbody>
                {staffing.findings.map((f, i) => (
                  <tr key={`${f.kind}-${i}`}>
                    <td className="num">{f.atMin === null ? '—' : clock(f.atMin)}</td>
                    <td>{f.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
