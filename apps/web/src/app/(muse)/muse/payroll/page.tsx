import { redirect } from 'next/navigation';

/** Time & Payroll merged into HR (Roadmap O1); pay is CompTable's. */
export default function PayrollPage() {
  redirect('/muse/hr');
}
