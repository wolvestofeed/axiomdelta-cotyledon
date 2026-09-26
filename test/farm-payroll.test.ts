import { describe, it, expect } from 'vitest';
import {
  payPeriodFor,
  payPeriodsOverlapping,
  payPeriodsPaidBetween,
  clockStateOf,
  punchRefusal,
  shiftsFrom,
  hoursWorked,
  hoursRun,
  earnedShareThrough,
  localDate,
  workweekOf,
  DEFAULT_PAY_CALENDAR,
  type ClosedPayrollPeriodDoc,
  type PunchDoc,
  type StaffDoc,
} from '@/engine/payroll';
import { weekdayOf } from '@/engine/orders';
import { postActuals } from '@/engine/actuals-ledger';

const cal = DEFAULT_PAY_CALENDAR;

// Austin is UTC−6 in winter (CST): 07:00 local = 13:00Z.
const at = (date: string, hhmm: string) => new Date(`${date}T${hhmm}:00-06:00`).toISOString();

let seq = 0;
const p = (staffId: string, kind: PunchDoc['kind'], ts: string): PunchDoc => ({ id: `p${String(++seq).padStart(4, '0')}`, staffId, kind, punchedAt: ts, source: 'clock', reason: null, recordedBy: null });

const sow: StaffDoc = { id: 's1', name: 'Sow A', role: 'Sow', employeeRef: 'CT-0001', email: null, roles: ['operator'], status: 'active', startedOn: '2027-01-04', notes: null };

/** A shift of `hours` worked from 07:00 with a 30-minute break. */
function day(staffId: string, date: string, hours: number): PunchDoc[] {
  const startMin = 7 * 60;
  const endMin = startMin + hours * 60 + 30;
  const hm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  return [p(staffId, 'in', at(date, hm(startMin))), p(staffId, 'break_start', at(date, '11:00')), p(staffId, 'break_end', at(date, '11:30')), p(staffId, 'out', at(date, hm(endMin)))];
}

/** A pay period closed in Staffing: totals by account, $1,932.00 loaded. */
const closed = (over: Partial<ClosedPayrollPeriodDoc> = {}): ClosedPayrollPeriodDoc => ({
  id: 'pp1',
  staffingRef: 'CT-PP-2027-01-18',
  periodStart: '2027-01-18',
  periodEnd: '2027-01-31',
  payDate: '2027-02-05',
  wagesCents: 160_000,
  payrollTaxesCents: 13_600,
  workersCompCents: 5_200,
  benefitsCents: 14_400,
  regularHours: 80,
  overtimeHours: 0,
  receivedAt: '2027-02-01T12:00:00.000Z',
  ...over,
});
const LOADED = 160_000 + 13_600 + 5_200 + 14_400;

describe('K5 — pay periods: Monday through the second Sunday, paid the Friday after', () => {
  it('the period containing a date, its pay date five days after the end', () => {
    const q = payPeriodFor('2027-01-20', cal);
    expect(q).toEqual({ start: '2027-01-18', end: '2027-01-31', payDate: '2027-02-05' });
    expect(weekdayOf(q.start)).toBe(1);
    expect(weekdayOf(q.end)).toBe(0);
    expect(weekdayOf(q.payDate)).toBe(5);
  });

  it('the sequence runs back from the anchor too', () => {
    expect(payPeriodFor('2027-01-01', cal)).toEqual({ start: '2026-12-21', end: '2027-01-03', payDate: '2027-01-08' });
  });

  it('twenty-six periods overlap a year starting on the anchor; pay dates are found by month', () => {
    expect(payPeriodsOverlapping('2027-01-04', '2027-12-31', cal)).toHaveLength(26);
    expect(payPeriodsPaidBetween('2027-02-01', '2027-02-28', cal).map((x) => x.payDate)).toEqual(['2027-02-05', '2027-02-19']);
  });
});

describe('K5 — the clock', () => {
  it('accepts only the next punch the state allows', () => {
    expect(punchRefusal('out', 'in')).toBeNull();
    expect(punchRefusal('out', 'out')).toContain('not accepted');
    expect(punchRefusal('in', 'break_start')).toBeNull();
    expect(punchRefusal('on_break', 'out')).toContain('not accepted');
    const ps = [p('s1', 'in', at('2027-01-05', '07:00')), p('s1', 'break_start', at('2027-01-05', '11:00'))];
    expect(clockStateOf(ps)).toBe('on_break');
  });

  it('a shift is clock-in to clock-out less breaks, dated by the farm’s local date', () => {
    const { shifts, orphans } = shiftsFrom(day('s1', '2027-01-05', 8));
    expect(orphans).toEqual([]);
    expect(shifts).toHaveLength(1);
    expect(shifts[0]!.workedMinutes).toBe(480);
    expect(shifts[0]!.breakMinutes).toBe(30);
    expect(shifts[0]!.workDate).toBe('2027-01-05');
    expect(localDate(at('2027-01-05', '23:30'))).toBe('2027-01-05');
  });

  it('an open shift counts no hours; orphan punches are reported, not filled', () => {
    const { shifts, orphans } = shiftsFrom([p('s1', 'in', at('2027-01-05', '07:00')), p('s1', 'out', at('2027-01-06', '15:00')), p('s1', 'out', at('2027-01-06', '16:00')), p('s1', 'in', at('2027-01-07', '07:00'))]);
    expect(shifts.filter((s) => s.open)).toHaveLength(1);
    expect(shifts.find((s) => s.open)!.workedMinutes).toBe(0);
    expect(orphans).toHaveLength(1);
  });
});

describe('O1 — hours, with overtime past 40 hours in the workweek; no pay in Farm', () => {
  it('hours past 40 in a Monday–Sunday workweek are overtime', () => {
    const punches = ['2027-01-04', '2027-01-05', '2027-01-06', '2027-01-07', '2027-01-08'].flatMap((d) => day('s1', d, 9));
    const days = hoursWorked(punches, '2027-01-04', '2027-01-10');
    expect(days.reduce((t, e) => t + e.regularMinutes, 0) / 60).toBe(40);
    expect(days.reduce((t, e) => t + e.overtimeMinutes, 0) / 60).toBe(5);
    expect(workweekOf('2027-01-10')).toBe('2027-01-04');
  });

  it('overtime counts the whole week even when the range starts mid-week', () => {
    const punches = ['2027-01-04', '2027-01-05', '2027-01-06', '2027-01-07', '2027-01-08'].flatMap((d) => day('s1', d, 9));
    const fri = hoursWorked(punches, '2027-01-08', '2027-01-08');
    expect(fri[0]!.regularMinutes).toBe(4 * 60);
    expect(fri[0]!.overtimeMinutes).toBe(5 * 60);
  });

  it('a pay period’s hours run carries hours and open shifts per person, and no pay field', () => {
    const run = hoursRun(payPeriodFor('2027-01-05', cal), [sow], day('s1', '2027-01-05', 8));
    expect(run.regularHours).toBe(8);
    expect(run.lines).toHaveLength(1);
    expect(Object.keys(run.lines[0]!).sort()).toEqual(['openShifts', 'overtimeHours', 'regularHours', 'staffId']);
  });

  it('the staff register holds no pay', () => {
    expect(Object.keys(sow).sort()).toEqual(['email', 'employeeRef', 'id', 'name', 'notes', 'role', 'roles', 'startedOn', 'status']);
  });

  it('a closed period’s share earned through a date follows the hours on the clock, else calendar days', () => {
    const punches = [...['2027-01-25', '2027-01-26', '2027-01-27', '2027-01-28', '2027-01-29'].flatMap((d) => day('s1', d, 8)), ...['2027-02-01', '2027-02-02'].flatMap((d) => day('s1', d, 8))];
    const pp = { periodStart: '2027-01-25', periodEnd: '2027-02-07' };
    expect(earnedShareThrough(pp, punches, '2027-01-31')).toBeCloseTo(5 / 7, 10);
    expect(earnedShareThrough(pp, [], '2027-01-31')).toBeCloseTo(7 / 14, 10);
    expect(earnedShareThrough(pp, punches, '2027-01-24')).toBe(0);
    expect(earnedShareThrough(pp, punches, '2027-02-07')).toBe(1);
  });
});

describe('O1 — payroll in the actuals ledger posts from Staffing’s closed pay periods', () => {
  const dates = ['2027-01-18', '2027-01-19', '2027-01-20', '2027-01-21', '2027-01-22', '2027-01-25', '2027-01-26', '2027-01-27', '2027-01-28', '2027-01-29'];
  const punches = dates.flatMap((d) => day('s1', d, 8));
  const base = { sowings: [], receipts: [], distributions: [], bills: [], staff: [sow], punches };
  const netOf = (entries: ReturnType<typeof postActuals>['entries'], code: string) => entries.flatMap((e) => e.lines).filter((l) => l.accountCode === code).reduce((t, l) => t + l.debitCents - l.creditCents, 0);

  it('January accrues the closed period; February’s pay date pays it; the liabilities clear', () => {
    const posted = postActuals({ ...base, payrollPeriods: [closed()] });
    expect(posted.balanced).toBe(true);
    const jan = posted.periods.find((x) => x.period === '2027-01')!;
    const feb = posted.periods.find((x) => x.period === '2027-02')!;
    expect(jan.payroll!.accruedLoadedCents).toBe(LOADED);
    expect(jan.payroll!.unassignedCents).toBe(LOADED);
    expect(jan.payroll!.uncoveredHours).toBe(0);
    expect(feb.payroll!.payDates).toEqual(['2027-02-05']);
    expect(feb.payroll!.paidCents).toBe(LOADED);
    for (const code of ['2110', '2120', '2130', '2140']) expect(netOf(posted.entries, code), code).toBe(0);
    expect(netOf(posted.entries, '5170')).toBe(LOADED);
  });

  it('a period across a month end is accrued by the hours worked on each side', () => {
    const across = [...['2027-01-25', '2027-01-26', '2027-01-27', '2027-01-28', '2027-01-29', '2027-02-01', '2027-02-02', '2027-02-03', '2027-02-04', '2027-02-05'].flatMap((d) => day('s1', d, 8))];
    const pp = closed({ periodStart: '2027-01-25', periodEnd: '2027-02-07', payDate: '2027-02-12' });
    const posted = postActuals({ ...base, punches: across, payrollPeriods: [pp] });
    const jan = posted.periods.find((x) => x.period === '2027-01')!;
    const feb = posted.periods.find((x) => x.period === '2027-02')!;
    expect(jan.payroll!.accruedLoadedCents).toBe(LOADED / 2);
    expect(feb.payroll!.accruedLoadedCents).toBe(LOADED / 2);
    expect(feb.payroll!.paidCents).toBe(LOADED);
  });

  it('with no closed period received, hours on the clock accrue no payroll and are reported as uncovered', () => {
    const posted = postActuals(base);
    expect(posted.entries.some((e) => e.id.startsWith('PAYROLL-'))).toBe(false);
    const jan = posted.periods.find((x) => x.period === '2027-01')!;
    expect(jan.payroll!.accruedLoadedCents).toBe(0);
    expect(jan.payroll!.uncoveredHours).toBe(80);
    expect(jan.notes.some((n) => n.includes('no closed pay period'))).toBe(true);
  });

  it('a pay date after the paid-through date is not posted, so the payroll stays accrued', () => {
    const posted = postActuals({ ...base, payrollPeriods: [closed()] }, undefined, undefined, { payrollPaidThrough: '2027-02-01' });
    expect(posted.periods.find((x) => x.period === '2027-02')?.payroll?.paidCents ?? 0).toBe(0);
  });
});

describe('P2 — hours by work role', () => {
  const withRole = (list: PunchDoc[], role: 'operator' | 'sales') => list.map((x) => (x.kind === 'in' ? { ...x, role } : { ...x, role }));

  it('counts each closed shift under the role it was clocked in under; a punch before roles reads as operator', async () => {
    const { hoursByRole, payPeriodFor } = await import('@/engine/payroll');
    const punches = [...day('s1', '2027-01-18', 8), ...withRole(day('s1', '2027-01-19', 6), 'sales'), ...withRole(day('s2', '2027-01-19', 4), 'sales')];
    const period = payPeriodFor('2027-01-19', cal);
    const lines = hoursByRole(period, punches);
    const get = (staffId: string, role: string) => lines.find((l) => l.staffId === staffId && l.role === role);
    expect(get('s1', 'operator')?.hours).toBeCloseTo(8, 9);
    expect(get('s1', 'sales')?.hours).toBeCloseTo(6, 9);
    expect(get('s2', 'sales')?.shifts).toBe(1);
    expect(get('s2', 'operator')).toBeUndefined();
  });

  it('the open shift carries its clock-in role to the punches that follow', async () => {
    const { roleOfOpenShift } = await import('@/engine/payroll');
    const open = [{ ...p('s1', 'in', at('2027-01-20', '07:00')), role: 'sales' as const }];
    expect(roleOfOpenShift(open)).toBe('sales');
    expect(roleOfOpenShift([])).toBeNull();
  });
});
