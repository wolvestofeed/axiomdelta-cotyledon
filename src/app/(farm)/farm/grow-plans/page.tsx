import { loadStandards } from '@/server/standards';
import { GrowPlansClient } from '@/app/(farm)/farm/grow-plans/GrowPlansClient';
import { withWorkspace } from '@/server/workspace';

export const dynamic = 'force-dynamic';

/** The grow plan library, with the approved standard-cost versions (Roadmap J5) loaded server-side. */
export default async function GrowPlansPage() {
  return withWorkspace(() => GrowPlansPageInner());
}

async function GrowPlansPageInner() {
  const standards = await loadStandards();
  const today = new Date().toISOString().slice(0, 10);
  return <GrowPlansClient standards={standards} today={today} />;
}
