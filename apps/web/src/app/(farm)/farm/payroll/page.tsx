import { redirect } from 'next/navigation';

/** Time & Payroll merged into HR (Roadmap O1); pay is Staffing's. */
export default function PayrollPage() {
  redirect('/farm/staffing');
}
