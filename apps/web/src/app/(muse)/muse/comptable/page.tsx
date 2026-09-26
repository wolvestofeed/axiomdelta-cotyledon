import { redirect } from 'next/navigation';

/** The CompTable connection moved onto HR, shown to admins (Roadmap O1). */
export default function CompTablePage() {
  redirect('/muse/hr');
}
