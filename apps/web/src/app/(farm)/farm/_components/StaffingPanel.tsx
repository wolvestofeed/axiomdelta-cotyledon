'use client';

import { Kpi, num } from './ui';
import { clock, type CrewShift } from '../_data/crews';
import { scheduledHeadcountAt, type LaborRequirement, type StaffingCheck } from '../_engine/staffing';

const hrs = (h: number) => (Math.round(h * 10) / 10).toFixed(1);

/**
 * The labor a plan requires, and proposed crews checked against it. The
 * requirement comes off the placed sowings; crews only produce findings. The
 * ceiling is the plant's and nothing here moves it.
 */
export function StaffingPanel({ labor, staffing, crews }: { labor: LaborRequirement; staffing: StaffingCheck; crews: readonly CrewShift[] }) {
  const busy = labor.intervals.filter((i) => i.staffHours > 0);
  return (
    <div>
      <div className="grid gap-3 farm-autofit-11">
        <Kpi value={`${hrs(labor.totalStaffHours)} h`} label="Staff-hours required" sub={`${hrs(labor.placedStaffHours)} h placed at the rack · ${hrs(labor.unplacedStaffHours)} h not yet placed`} />
        <Kpi value={num(labor.peakHeadcount)} label="Most people at once, placed tasks" sub={labor.peakAtMin === null ? 'Nothing placed' : `First at ${clock(labor.peakAtMin)}`} />
        <Kpi value={staffing.checked ? num(staffing.crews) : 'None'} label="Crews proposed" sub={staffing.checked ? `${hrs(staffing.crewStaffHours)} staff-hours, ${num(staffing.proposedFloorHeadcount)} people` : 'Nothing is checked until a crew is entered'} />
        <Kpi value={staffing.checked ? num(staffing.findings.length) : '—'} label="Staffing findings" sub={staffing.checked ? 'Against the placed tasks and the day’s staff-hours' : 'No crew proposed'} />
      </div>

      <div className="farm-scroll-x mt-3">
        <table className="farm-table">
          <thead>
            <tr><th className="num">Sowing</th><th>Task placed on the clock</th><th className="num">Start</th><th className="num">End</th><th className="num">People at once</th><th>CONTROL POINT</th></tr>
          </thead>
          <tbody>
            {labor.placed.length === 0 && <tr><td colSpan={6} className="farm-c-soft">No sowing is placed, so no task is on the clock.</td></tr>}
            {labor.placed.map((t) => (
              <tr key={t.key}>
                <td className="num">{t.seq}</td>
                <td>{t.task}<div className="farm-c-faint farm-fs-xs">{t.station}</div></td>
                <td className="num">{clock(t.startMin)}</td>
                <td className="num">{clock(t.endMin)}</td>
                <td className="num">{t.headcount}</td>
                <td>{t.controlPoint ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="farm-kpi-sub mt-2">
        The blackout stage between load and unload runs unattended and needs no one; the rack tasks around it do. Headcount per task is a placeholder capacity input seeded from the time study.
      </p>

      {busy.length > 0 && (
        <div className="farm-scroll-x mt-3">
          <table className="farm-table">
            <thead>
              <tr><th>Interval</th><th className="num">People at once</th><th className="num">Staff-hours</th>{staffing.checked && <th className="num">Scheduled at start</th>}</tr>
            </thead>
            <tbody>
              {busy.map((i) => {
                const scheduled = scheduledHeadcountAt(crews, i.startMin);
                return (
                  <tr key={i.startMin}>
                    <td>{clock(i.startMin)}–{clock(i.endMin)}</td>
                    <td className="num">{i.headcount}</td>
                    <td className="num">{i.staffHours.toFixed(2)}</td>
                    {staffing.checked && <td className={`num ${scheduled < i.headcount ? 'farm-c-over' : ''}`}>{scheduled}</td>}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="farm-scroll-x mt-3">
        <table className="farm-table">
          <thead>
            <tr><th>Task not yet placed on the clock</th><th className="num">People at once</th><th className="num">Staff-hours for the day</th><th>Scales with</th><th>CONTROL POINT</th></tr>
          </thead>
          <tbody>
            {labor.unplaced.map((t) => (
              <tr key={t.task}>
                <td>{t.task}<div className="farm-c-faint farm-fs-xs">{t.station}</div></td>
                <td className="num">{t.staff}</td>
                <td className="num">{(t.laborMinutes / 60).toFixed(2)}</td>
                <td>{t.scalesWith === 'fixed' ? `sowings (${labor.sowings})` : `units (${num(labor.units)})`}</td>
                <td>{t.controlPoint ?? '—'}</td>
              </tr>
            ))}
            <tr className="total"><td>Not placed</td><td /><td className="num">{hrs(labor.unplacedStaffHours)}</td><td colSpan={2} /></tr>
          </tbody>
        </table>
      </div>
      <p className="farm-kpi-sub mt-2">
        These time-study tasks carry staff and minutes but no clock placement or precedence until the scheduler routes the day (Roadmap L5). Their hours count toward the day&rsquo;s requirement; their times are not checked against crews.
      </p>

      <div className="mt-3">
        {!staffing.checked ? (
          <p className="farm-kpi-sub">No crew is proposed. The requirement above stands on its own and nothing is checked against it.</p>
        ) : staffing.findings.length === 0 ? (
          <p className="farm-kpi-sub">No findings: every placed task has its headcount scheduled, no blackout completes unstaffed, and the proposed crews cover the day&rsquo;s staff-hours.</p>
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
