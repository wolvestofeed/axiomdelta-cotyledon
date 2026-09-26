'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Card, Kpi, StatusBadge, money, num } from '../_components/ui';
import type { StatusTag } from '../_data/tagged';
import { useOperationsWorld } from '../_state/ledger';
import { createStaff, updateStaff, punch, addManualPunch, deletePunch } from '../_lib/payroll-actions';
import {
  CLOCK_STATE_LABELS,
  NEXT_PUNCHES,
  PUNCH_KIND_LABELS,
  clockStateOf,
  hoursRun,
  hoursByRole,
  WORK_ROLES,
  WORK_ROLE_LABELS,
  kitchenTimeToIso,
  loadedFromClosedPeriod,
  localClock,
  localDate,
  payPeriodFor,
  payPeriodsOverlapping,
  shiftsFrom,
  type ClosedPayrollPeriodDoc,
  type PayCalendar,
  type PunchDoc,
  type PunchKind,
  type StaffDoc,
  type WorkRole,
} from '../_engine/payroll';
import { isoAddDays } from '../_engine/orders';

type Msg = { kind: 'ok' | 'err'; text: string } | null;
const cents = (c: number) => money(c / 100, 2);

interface StaffForm {
  id: string | null;
  name: string;
  role: string;
  roles: WorkRole[];
  employeeRef: string;
  email: string;
  status: 'active' | 'inactive';
  startedOn: string;
}

const emptyStaff = (): StaffForm => ({ id: null, name: '', role: '', roles: ['operator'], employeeRef: '', email: '', status: 'active', startedOn: '' });

export function HrClient({
  today,
  isAdmin,
  canRecord: canRecordRole,
  staff,
  punches: recordedPunches,
  calendar,
  anchorStatus,
  payrollPeriods,
}: {
  today: string;
  isAdmin: boolean;
  canRecord: boolean;
  staff: StaffDoc[];
  punches: PunchDoc[];
  calendar: PayCalendar;
  anchorStatus: StatusTag;
  /** Closed pay periods from CompTable — passed only to an admin; null for everyone else. */
  payrollPeriods: ClosedPayrollPeriodDoc[] | null;
}) {
  const router = useRouter();
  // Punches exist on Actual only — a forecast has none; the staff register edits in both worlds (Roadmap N6 slice 3).
  const { recording } = useOperationsWorld({});
  const punches = useMemo(() => (recording ? recordedPunches : []), [recording, recordedPunches]);
  const canRecord = canRecordRole && recording;
  const canCorrect = isAdmin && recording;
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<Msg>(null);
  const [periodStart, setPeriodStart] = useState(payPeriodFor(today, calendar).start);
  const [staffForm, setStaffForm] = useState<StaffForm | null>(null);
  const [manual, setManual] = useState({ staffId: '', kind: 'out' as PunchKind, role: 'operator' as WorkRole, date: today, time: '15:00', reason: '' });
  const [removeReason, setRemoveReason] = useState('');

  function run(fn: () => Promise<{ ok: true } | { ok: false; error: string }>, okText: string, after?: () => void) {
    start(async () => {
      const res = await fn();
      if (res.ok) {
        setMsg({ kind: 'ok', text: okText });
        after?.();
        router.refresh();
      } else setMsg({ kind: 'err', text: res.error });
    });
  }

  const periods = useMemo(() => payPeriodsOverlapping(isoAddDays(today, -98), isoAddDays(today, 14), calendar).reverse(), [today, calendar]);
  const period = periods.find((p) => p.start === periodStart) ?? payPeriodFor(periodStart, calendar);
  const hours = useMemo(() => hoursRun(period, staff, punches), [period, staff, punches]);
  const byRole = useMemo(() => hoursByRole(period, punches), [period, punches]);
  const replay = useMemo(() => shiftsFrom(punches), [punches]);
  const shifts = replay.shifts.filter((s) => s.workDate >= period.start && s.workDate <= period.end);
  const periodPunches = punches.filter((p) => { const d = localDate(p.punchedAt); return d >= period.start && d <= period.end; }).sort((a, b) => a.punchedAt.localeCompare(b.punchedAt));
  const nameOf = (id: string) => staff.find((s) => s.id === id)?.name ?? '—';
  const active = staff.filter((s) => s.status === 'active');

  function saveStaff() {
    if (!staffForm) return;
    const payload = {
      name: staffForm.name,
      role: staffForm.role || null,
      roles: staffForm.roles,
      employeeRef: staffForm.employeeRef || null,
      email: staffForm.email.trim() || null,
      status: staffForm.status,
      startedOn: staffForm.startedOn || null,
      notes: null,
    };
    run(() => (staffForm.id ? updateStaff({ ...payload, id: staffForm.id }) : createStaff(payload)), `Saved ${staffForm.name}.`, () => setStaffForm(null));
  }

  return (
    <>
      {msg && <div className={`muse-scenariobar-msg ${msg.kind} mb-3!`} role="status">{msg.text}</div>}

      {!recording && (
        <div className="mb-4 border! border-[color:var(--muse-line)]! bg-[color:var(--muse-surface-2)]! rounded-[0.6rem]! py-[0.6rem]! px-[1.1rem]! muse-fs-sm muse-c-soft" role="status">
          <strong className="muse-c-ink">Plan</strong> — a forecast has no punches. Switch to Actual in the forecast bar to see and record them. The staff register edits on either.
        </div>
      )}

      <Card title={`On the clock — ${today}`}>
        {active.length === 0 ? (
          <p className="muse-kpi-sub">No one is on the staff register.{isAdmin ? ' Add people on the register below.' : ''}</p>
        ) : (
          <div className="muse-scroll-x">
            <table className="muse-table">
              <thead><tr><th>Person</th><th>State</th><th>Last punch</th><th /></tr></thead>
              <tbody>
                {active.map((s) => {
                  const mine = punches.filter((p) => p.staffId === s.id);
                  const state = clockStateOf(mine);
                  const last = [...mine].sort((a, b) => b.punchedAt.localeCompare(a.punchedAt))[0];
                  return (
                    <tr key={s.id}>
                      <td>{s.name}{s.role ? <div className="muse-c-faint muse-fs-2xs">{s.role}</div> : null}</td>
                      <td>{CLOCK_STATE_LABELS[state]}</td>
                      <td>{last ? `${PUNCH_KIND_LABELS[last.kind]} · ${localDate(last.punchedAt)} ${localClock(last.punchedAt)}` : '—'}</td>
                      <td className="num">
                        {canRecord && NEXT_PUNCHES[state].map((k) => (
                          <button key={k} type="button" className="muse-btn py-[0.1rem]! px-2! ml-[0.3rem]!" disabled={pending} onClick={() => run(() => punch({ staffId: s.id, kind: k }), `${s.name}: ${PUNCH_KIND_LABELS[k]}.`)}>{PUNCH_KIND_LABELS[k]}</button>
                        ))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Hours — pay period" className="mt-4">
        <div className="flex flex-wrap gap-3 items-end">
          <label className="muse-kpi-sub">Period<br />
            <select className="muse-select" value={period.start} onChange={(e) => setPeriodStart(e.target.value)}>
              {periods.map((p) => <option key={p.start} value={p.start}>{p.start} to {p.end} · paid {p.payDate}</option>)}
            </select>
          </label>
          <span className="muse-kpi-sub">Pay periods count from Monday {calendar.firstPeriodStart} <StatusBadge status={anchorStatus} /></span>
        </div>
        <div className="grid gap-3 mt-3 muse-autofit-10">
          <Kpi value={num(hours.regularHours, 2)} label="Regular hours" />
          <Kpi value={num(hours.overtimeHours, 2)} label="Overtime hours" sub="Past 40 in the workweek" />
          <Kpi value={num(hours.lines.length)} label="People with hours" />
          <Kpi value={num(hours.openShifts)} label="Open shifts" sub="No clock-out yet" />
        </div>
        <div className="muse-scroll-x mt-3">
          <table className="muse-table">
            <thead><tr><th>Person</th><th className="num">Regular h</th><th className="num">Overtime h</th><th className="num">Open shifts</th></tr></thead>
            <tbody>
              {hours.lines.length === 0 ? (
                <tr><td colSpan={4} className="muse-c-soft">No hours in this period.</td></tr>
              ) : hours.lines.map((l) => (
                <tr key={l.staffId}>
                  <td>{nameOf(l.staffId)}</td>
                  <td className="num">{num(l.regularHours, 2)}</td>
                  <td className="num">{num(l.overtimeHours, 2)}</td>
                  <td className="num">{l.openShifts || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muse-kpi-sub mt-2">Overtime is counted per Monday–Sunday workweek (29 U.S.C. 207(a)(1)). An open shift counts no hours until its clock-out is punched or typed. The clock times go to CompTable, where pay is calculated.</p>
        <div className="muse-card-title mt-4!">Hours by work role</div>
        <div className="muse-scroll-x">
          <table className="muse-table">
            <thead><tr><th>Person</th><th>Role</th><th className="num">Hours</th><th className="num">Shifts</th></tr></thead>
            <tbody>
              {byRole.length === 0 ? (
                <tr><td colSpan={4} className="muse-c-soft">No closed shift in this period.</td></tr>
              ) : byRole.map((l) => (
                <tr key={`${l.staffId}-${l.role}`}>
                  <td>{nameOf(l.staffId)}</td>
                  <td>{WORK_ROLE_LABELS[l.role]}</td>
                  <td className="num">{num(l.hours, 2)}</td>
                  <td className="num">{l.shifts}</td>
                </tr>
              ))}
              {byRole.length > 0 && WORK_ROLES.map((r) => {
                const h = byRole.filter((l) => l.role === r).reduce((t, l) => t + l.hours, 0);
                return h > 0 ? <tr key={r} className="total"><td>All staff</td><td>{WORK_ROLE_LABELS[r]}</td><td className="num">{num(h, 2)}</td><td className="num">{byRole.filter((l) => l.role === r).reduce((t, l) => t + l.shifts, 0)}</td></tr> : null;
              })}
            </tbody>
          </table>
        </div>
        <p className="muse-kpi-sub mt-2">A shift counts under the role it was clocked in under — operator on the Floor, sales on the Sales portal. Hours by role go to payroll with the punches; overtime is per person across roles.</p>
      </Card>

      <Card title={`Shifts — ${period.start} to ${period.end}`} className="mt-4">
        {shifts.length === 0 && replay.orphans.length === 0 ? (
          <p className="muse-kpi-sub">No shift in this period.</p>
        ) : (
          <div className="muse-scroll-x">
            <table className="muse-table">
              <thead><tr><th>Person</th><th>Date</th><th>In</th><th>Out</th><th className="num">Break min</th><th className="num">Worked h</th><th>On the record</th></tr></thead>
              <tbody>
                {shifts.map((s) => (
                  <tr key={`${s.staffId}-${s.inAt}`}>
                    <td>{nameOf(s.staffId)}</td>
                    <td>{s.workDate}</td>
                    <td>{localClock(s.inAt)}</td>
                    <td>{s.outAt ? `${localDate(s.outAt) !== s.workDate ? `${localDate(s.outAt)} ` : ''}${localClock(s.outAt)}` : '—'}</td>
                    <td className="num">{num(s.breakMinutes)}</td>
                    <td className="num">{s.open ? '—' : num(s.workedMinutes / 60, 2)}</td>
                    <td>{s.issues.join(' ') || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {replay.orphans.length > 0 && <ul className="muse-kpi-sub mt-2 pl-[1.1rem]!">{replay.orphans.map((o) => <li key={o.punchId}>{nameOf(o.staffId)}: {o.reason}</li>)}</ul>}
          </div>
        )}
      </Card>

      <Card title={`Punches — ${periodPunches.length}`} className="mt-4">
        {periodPunches.length > 0 && (
          <div className="muse-scroll-x">
            <table className="muse-table">
              <thead><tr><th>Person</th><th>Punch</th><th>When</th><th>Source</th><th /></tr></thead>
              <tbody>
                {periodPunches.map((p) => (
                  <tr key={p.id}>
                    <td>{nameOf(p.staffId)}</td>
                    <td>{PUNCH_KIND_LABELS[p.kind]}</td>
                    <td>{localDate(p.punchedAt)} {localClock(p.punchedAt)}</td>
                    <td>{p.source === 'manual' ? `Typed — ${p.reason ?? ''}` : 'Clock'}{p.recordedBy ? ` · ${p.recordedBy}` : ''}</td>
                    <td className="num">{canCorrect && <button type="button" className="muse-btn py-[0.1rem]! px-[0.4rem]!" disabled={pending || removeReason.trim().length < 3} onClick={() => run(() => deletePunch({ id: p.id, reason: removeReason }), 'Removed the punch.')}>Remove</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {canCorrect && (
          <>
            <div className="flex flex-wrap gap-3 items-end mt-3!">
              <label className="muse-kpi-sub flex-1! min-w-56!">Reason for a removal<br /><input className="muse-input w-full!" value={removeReason} onChange={(e) => setRemoveReason(e.target.value)} /></label>
            </div>
            <div className="muse-card-title mt-4!">Type a punch</div>
            <div className="flex flex-wrap gap-3 items-end">
              <label className="muse-kpi-sub">Person<br />
                <select className="muse-select" value={manual.staffId} onChange={(e) => setManual({ ...manual, staffId: e.target.value })}>
                  <option value="">Choose…</option>
                  {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </label>
              <label className="muse-kpi-sub">Punch<br />
                <select className="muse-select" value={manual.kind} onChange={(e) => setManual({ ...manual, kind: e.target.value as PunchKind })}>
                  {(Object.keys(PUNCH_KIND_LABELS) as PunchKind[]).map((k) => <option key={k} value={k}>{PUNCH_KIND_LABELS[k]}</option>)}
                </select>
              </label>
              {manual.kind === 'in' && (
                <label className="muse-kpi-sub">Work role<br />
                  <select className="muse-select" value={manual.role} onChange={(e) => setManual({ ...manual, role: e.target.value as WorkRole })}>
                    {WORK_ROLES.map((r) => <option key={r} value={r}>{WORK_ROLE_LABELS[r]}</option>)}
                  </select>
                </label>
              )}
              <label className="muse-kpi-sub">Date<br /><input className="muse-input" type="date" value={manual.date} onChange={(e) => setManual({ ...manual, date: e.target.value })} /></label>
              <label className="muse-kpi-sub">Kitchen time<br /><input className="muse-input" type="time" value={manual.time} onChange={(e) => setManual({ ...manual, time: e.target.value })} /></label>
              <label className="muse-kpi-sub flex-1! min-w-56!">Reason<br /><input className="muse-input w-full!" value={manual.reason} onChange={(e) => setManual({ ...manual, reason: e.target.value })} /></label>
              <button type="button" className="muse-btn primary" disabled={pending || !manual.staffId || manual.reason.trim().length < 3} onClick={() => run(() => addManualPunch({ staffId: manual.staffId, kind: manual.kind, role: manual.role, punchedAt: kitchenTimeToIso(manual.date, manual.time), reason: manual.reason }), 'Typed the punch.', () => setManual({ ...manual, reason: '' }))}>Record</button>
            </div>
            <p className="muse-kpi-sub mt-2">A typed punch and a removal each state a reason and are entries on the posting trail. No punch is edited.</p>
          </>
        )}
      </Card>

      <Card title={isAdmin ? `Staff register — ${staff.length}` : 'Your record'} className="mt-4">
        <div className="muse-scroll-x">
          <table className="muse-table">
            <thead><tr><th>Name</th><th>Job title</th><th>Work roles</th>{isAdmin && <th>CompTable reference</th>}{isAdmin && <th>Sign-in email</th>}<th>Started</th><th>Status</th>{isAdmin && <th />}</tr></thead>
            <tbody>
              {staff.length === 0 && <tr><td colSpan={isAdmin ? 8 : 5} className="muse-c-soft">No one is on the staff register.</td></tr>}
              {staff.map((s) => (
                <tr key={s.id}>
                  <td>{s.name}</td>
                  <td>{s.role ?? '—'}</td>
                  <td>{s.roles.length ? s.roles.map((r) => (r === 'operator' ? 'Operator' : 'Sales')).join(', ') : '—'}</td>
                  {isAdmin && <td>{s.employeeRef ?? '—'}</td>}{isAdmin && <td>{s.email ?? '—'}</td>}
                  <td>{s.startedOn ?? '—'}</td>
                  <td>{s.status}</td>
                  {isAdmin && <td className="num"><button type="button" className="muse-btn py-[0.1rem]! px-[0.4rem]!" onClick={() => setStaffForm({ id: s.id, name: s.name, role: s.role ?? '', roles: s.roles, employeeRef: s.employeeRef ?? '', email: s.email ?? '', status: s.status, startedOn: s.startedOn ?? '' })}>Edit</button></td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {isAdmin && !staffForm && <button type="button" className="muse-btn mt-3" onClick={() => setStaffForm(emptyStaff())}>Add a person</button>}
        {isAdmin && staffForm && (
          <div className="flex flex-wrap gap-3 items-end mt-3!">
            <label className="muse-kpi-sub">Full name<br /><input className="muse-input" value={staffForm.name} onChange={(e) => setStaffForm({ ...staffForm, name: e.target.value })} /></label>
            <label className="muse-kpi-sub">Job title<br /><input className="muse-input" value={staffForm.role} onChange={(e) => setStaffForm({ ...staffForm, role: e.target.value })} /></label>
            <div className="muse-kpi-sub">Work roles<br />
              {WORK_ROLES.map((r) => (
                <label key={r} className="inline-flex! gap-[0.3rem]! items-center! mr-[0.8rem]!">
                  <input type="checkbox" checked={staffForm.roles.includes(r)} onChange={(e) => setStaffForm({ ...staffForm, roles: e.target.checked ? [...staffForm.roles, r] : staffForm.roles.filter((x) => x !== r) })} />{WORK_ROLE_LABELS[r]}
                </label>
              ))}
            </div>
            <label className="muse-kpi-sub">CompTable reference<br /><input className="muse-input" value={staffForm.employeeRef} onChange={(e) => setStaffForm({ ...staffForm, employeeRef: e.target.value })} /></label>
            <label className="muse-kpi-sub">Sign-in email<br /><input className="muse-input" type="email" value={staffForm.email} onChange={(e) => setStaffForm({ ...staffForm, email: e.target.value })} /></label>
            <label className="muse-kpi-sub">Started<br /><input className="muse-input" type="date" value={staffForm.startedOn} onChange={(e) => setStaffForm({ ...staffForm, startedOn: e.target.value })} /></label>
            <label className="muse-kpi-sub">Status<br />
              <select className="muse-select" value={staffForm.status} onChange={(e) => setStaffForm({ ...staffForm, status: e.target.value as 'active' | 'inactive' })}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </label>
            <button type="button" className="muse-btn primary" disabled={pending || !staffForm.name.trim()} onClick={saveStaff}>Save</button>
            <button type="button" className="muse-btn" onClick={() => setStaffForm(null)} disabled={pending}>Cancel</button>
          </div>
        )}
        <p className="muse-kpi-sub mt-2">The register holds the people who clock in: full name, role, start date and status. Pay and personal details are CompTable&rsquo;s{isAdmin ? '; the CompTable reference ties a person here to their record there, and the sign-in email lets an active person sign in as an operator and see their own record' : ''}.</p>
      </Card>

      {isAdmin && payrollPeriods && (
        <Card title="Payroll — closed pay periods from CompTable (admins)" className="mt-4">
          {payrollPeriods.length === 0 ? (
            <p className="muse-kpi-sub">No closed pay period has been received from CompTable. Payroll, burden and benefits are held there; each closed period arrives as totals by account once the connection is live, and the books accrue and pay payroll from it.</p>
          ) : (
            <div className="muse-scroll-x">
              <table className="muse-table">
                <thead><tr><th>Period</th><th>Paid</th><th className="num">Regular h</th><th className="num">Overtime h</th><th className="num">Wages</th><th className="num">Payroll taxes</th><th className="num">Workers&rsquo; comp</th><th className="num">Benefits</th><th className="num">Loaded</th></tr></thead>
                <tbody>
                  {[...payrollPeriods].reverse().map((p) => {
                    const l = loadedFromClosedPeriod(p);
                    return (
                      <tr key={p.id}>
                        <td>{p.periodStart} to {p.periodEnd}<div className="muse-c-faint muse-fs-2xs">{p.comptableRef}</div></td>
                        <td>{p.payDate}</td>
                        <td className="num">{num(p.regularHours, 2)}</td>
                        <td className="num">{num(p.overtimeHours, 2)}</td>
                        <td className="num">{cents(l.wagesCents)}</td>
                        <td className="num">{cents(l.payrollTaxesCents)}</td>
                        <td className="num">{cents(l.workersCompCents)}</td>
                        <td className="num">{cents(l.benefitsCents)}</td>
                        <td className="num">{cents(l.loadedCents)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {isAdmin && (
        <Card title="Pay and personal details (admins)" className="mt-4">
          <p className="muse-kpi-sub">Each person&rsquo;s pay, burden, benefits and personal details are held in CompTable and read from it when an admin opens this page; nothing is stored in Muse. The CompTable connection is designed, not live, so nothing is shown yet.</p>
        </Card>
      )}
    </>
  );
}
