import { redirect } from 'next/navigation';

/** Comp merged into HR (Roadmap O1); the roster, wages and burden are CompTable's. */
export default function CompPage() {
  redirect('/muse/hr');
}
