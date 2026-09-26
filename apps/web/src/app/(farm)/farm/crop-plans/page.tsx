import { loadStandards } from '../_lib/standards';
import { CropPlansClient } from './CropPlansClient';

export const dynamic = 'force-dynamic';

/** The crop plan library, with the approved standard-cost versions (Roadmap J5) loaded server-side. */
export default async function CropPlansPage() {
  const standards = await loadStandards();
  const today = new Date().toISOString().slice(0, 10);
  return <CropPlansClient standards={standards} today={today} />;
}
