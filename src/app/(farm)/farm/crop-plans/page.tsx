import { loadStandards } from '@/server/standards';
import { CropPlansClient } from '@/app/(farm)/farm/crop-plans/CropPlansClient';
import { withWorkspace } from '@/server/workspace';

export const dynamic = 'force-dynamic';

/** The crop plan library, with the approved standard-cost versions (Roadmap J5) loaded server-side. */
export default async function CropPlansPage() {
  return withWorkspace(() => CropPlansPageInner());
}

async function CropPlansPageInner() {
  const standards = await loadStandards();
  const today = new Date().toISOString().slice(0, 10);
  return <CropPlansClient standards={standards} today={today} />;
}
