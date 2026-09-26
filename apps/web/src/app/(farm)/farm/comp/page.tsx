import { redirect } from 'next/navigation';

/** Comp merged into HR (Roadmap O1); the roster, wages and burden are Staffing's. */
export default function CompPage() {
  redirect('/farm/staffing');
}
