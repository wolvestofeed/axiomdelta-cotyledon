'use client';

import Link from 'next/link';
import { Kpi, num } from '@/components/ui';
import { clock, type CrewShift } from '@/data/crews';
import { scheduledHeadcountAt, type LaborRequirement, type StaffingCheck } from '@/engine/staffing';

const hrs = (h: number) => (Math.round(h * 10) / 10).toFixed(1);

/**
 * The labor a plan requires, and proposed crews checked against it. The
 * requirement comes off the placed sowings; crews only produce findings. The
 * ceiling is the plant's and nothing here moves it. On the grow model (`grow`)
 * there is no rack to place tasks on: the requirement is each plan's sowing-stream
 * lines, and the Day Schedule places them on the clock.
 */
export function StaffingPanel({ labor, staffing, crews, grow = false }: { labor: LaborRequirement; staffing: StaffingCheck; crews: readonly CrewShift[]; grow?: boolean }) {
  const busy = labor.intervals.filter((i) => i.staffHours > 0);
  const mostOnATask = labor.unplaced.reduce((m, t) => Math.max(m, t.staff), 0);
  return (
    <div>
      <div className="grid gap-3 farm-autofit-11">
        {grow ? (
          <Kpi value={`${hrs(labor.totalStaffHours)} h`} label="Staff-hours required" sub={`The sowing stream for ${num(labor.units)} trays in ${num(labor.sowings)} ${labor.sowings === 1 ? 'sowing' : 'sowings'}`} />
        ) : (
          <Kpi value={`${hrs(labor.totalStaffHours)} h`} label="Staff-hours required" sub={`${hrs(labor.placedStaffHours)} h placed at the rack · ${hrs(labor.unplacedStaffHours)} h not yet placed`} />
        )}
        {grow ? (
          <Kpi value={num(mostOnATask)} label="Most people on one task" sub="From the plans' labor standards" />
        ) : (
          <Kpi value={num(labor.peakHeadcount)} label="Most people at once, placed tasks" sub={labor.peakAtMin === null ? 'Nothing placed' : `First at ${clock(labor.peakAtMin)}`} />
        )}
        <Kpi value={staffing.checked ? num(staffing.crews) : 'None'} label="Crews proposed" sub={staffing.checked ? `${hrs(staffing.crewStaffHours)} staff-hours, ${num(staffing.proposedFloorHeadcount)} people` : 'Nothing is checked until a crew is entered'} />
        <Kpi value={staffing.checked ? num(staffing.findings.length) : '—'} label="Staffing findings" sub={staffing.checked ? 'Against the placed tasks and the day’s staff-hours' : 'No crew proposed'} />
      </div>

      {!grow && (<>
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

      {busy.length > 0 && !grow && (
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

      </>)}

      <div className="farm-scroll-x mt-3">
        <table className="farm-table">
          <thead>
            <tr><th>{grow ? 'Sowing-stream task' : 'Task not yet placed on the clock'}</th><th className="num">People at once</th><th className="num">Staff-hours for the day</th><th>Scales with</th><th>CONTROL POINT</th></tr>
          </thead>
          <tbody>
            {labor.unplaced.map((t) => (
              <tr key={t.task}>
                <td>{t.task}<div className="farm-c-faint farm-fs-xs">{t.station}</div></td>
                <td className="num">{t.staff}</td>
                <td className="num">{(t.laborMinutes / 60).toFixed(2)}</td>
                <td>{t.scalesWith === 'fixed' ? `sowings (${labor.sowings})` : `${grow ? 'trays' : 'units'} (${num(labor.units)})`}</td>
                <td>{t.controlPoint ?? '—'}</td>
              </tr>
            ))}
            <tr className="total"><td>{grow ? 'Sowing stream' : 'Not placed'}</td><td /><td className="num">{hrs(labor.unplacedStaffHours)}</td><td colSpan={2} /></tr>
          </tbody>
        </table>
      </div>
      <p className="farm-kpi-sub mt-2">
        {grow ? (
          <>Each plan&rsquo;s sowing-stream lines from its labor standard: a fixed line once per sowing, a per-tray line on the study&rsquo;s sowing size times the trays sown. The <Link className="farm-link" href="/farm/production-planning/schedule">Day Schedule</Link> places them on the clock; here their hours are checked against the crews&rsquo; staff-hours only.</>
        ) : (
          <>These time-study tasks carry staff and minutes but no clock placement or precedence until the scheduler routes the day (Roadmap L5). Their hours count toward the day&rsquo;s requirement; their times are not checked against crews.</>
        )}
      </p>

      <div className="mt-3">
        {!staffing.checked ? (
          <p className="farm-kpi-sub">No crew is proposed. The requirement above stands on its own and nothing is checked against it.</p>
        ) : staffing.findings.length === 0 ? (
          <p className="farm-kpi-sub">{grow ? 'No findings: the proposed crews cover the day’s staff-hours.' : 'No findings: every placed task has its headcount scheduled, no blackout completes unstaffed, and the proposed crews cover the day’s staff-hours.'}</p>
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
