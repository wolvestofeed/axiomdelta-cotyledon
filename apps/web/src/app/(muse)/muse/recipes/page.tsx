import { loadStandards } from '../_lib/standards';
import { RecipesClient } from './RecipesClient';

export const dynamic = 'force-dynamic';

/** The recipe library, with the approved standard-cost versions (Roadmap J5) loaded server-side. */
export default async function RecipesPage() {
  const standards = await loadStandards();
  const today = new Date().toISOString().slice(0, 10);
  return <RecipesClient standards={standards} today={today} />;
}
