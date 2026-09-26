import { Card, PageHeader } from '../_components/ui';
import { getFarmAccess } from '../_lib/access';
import { getResolvedActiveInputs } from '../_lib/scenarios';
import { loadClosedPayrollPeriods, loadTimeClock } from '../_lib/working-capital';
import { payrollCalendar } from '../_data/working-capital';
import { StaffingClient } from './StaffingClient';

export const dynamic = 'force-dynamic';

/**
 * Staffing: admins see everyone's clock, shifts, hours and pay periods. An operator
 * sees their own record only, matched by the sign-in email on the register. Admin-only
 * data is loaded and passed here only for an admin, so it never reaches an operator's
 * browser. Staff notes are withheld from non-admins the same way.
 */
export default async function StaffingPage() {
  const access = await getFarmAccess();
  const isAdmin = access.isSuperAdmin;
  if (!isAdmin && !access.staffId) {
    return (
      <>
        <PageHeader title="HR" purpose="Check your own punches, shifts and hours." status="partial" />
        <Card title="Your record">
          <p className="farm-kpi-sub">Your sign-in{access.email ? ` (${access.email})` : ''} is not the email of an active person on the staff register, so there is no record to show. An admin adds the email on the register.</p>
        </Card>
      </>
    );
  }
  const [{ inputs }, clock, payrollPeriods] = await Promise.all([
    getResolvedActiveInputs(),
    loadTimeClock(),
    isAdmin ? loadClosedPayrollPeriods() : Promise.resolve(null),
  ]);
  const staff = isAdmin ? clock.staff : clock.staff.filter((s) => s.id === access.staffId).map((s) => ({ ...s, employeeRef: null, email: null, notes: null }));
  const punches = isAdmin ? clock.punches : clock.punches.filter((p) => p.staffId === access.staffId);
  const today = new Date().toISOString().slice(0, 10);
  return (
    <>
      <PageHeader
        title="Staffing"
        purpose={isAdmin ? 'Track clock punches, shifts and hours for everyone.' : 'Check your own punches, shifts and hours.'}
        functions={isAdmin ? ['On the clock', 'Hours', 'Shifts', 'Staff register', 'Payroll'] : ['On the clock', 'Hours', 'Shifts', 'Punches', 'Your record']}
        connects={[
          { href: '/farm/grow-room', dir: 'from' },
        ]}
        howItWorks={
          isAdmin ? (
            <ul>
              <li>Everyone on staff clocks in, starts and ends a break, and clocks out on the Grow Room.</li>
              <li>Shifts and hours come from the punches.</li>
              <li>Overtime is hours past 40 in a Monday–Sunday workweek.</li>
              <li>A pay period runs Monday through the second Sunday, paid the Friday five days later.</li>
              <li>Pay, payroll, burden, benefits and personal details are shown to admins only.</li>
            </ul>
          ) : (
            <ul>
              <li>Your punches are taken on the Grow Room, and your shifts and hours come from them.</li>
              <li>Overtime is hours past 40 in a Monday–Sunday workweek.</li>
              <li>A pay period runs Monday through the second Sunday, paid the Friday five days later.</li>
              <li>Pay and personal details are shown to admins only.</li>
            </ul>
          )
        }
        status="partial"
      />
      <StaffingClient
        today={today}
        isAdmin={isAdmin}
        canRecord={access.isOperator}
        staff={staff}
        punches={punches}
        calendar={inputs.payCalendar}
        anchorStatus={payrollCalendar.firstPeriodStart.status}
        payrollPeriods={payrollPeriods}
      />
    </>
  );
}
