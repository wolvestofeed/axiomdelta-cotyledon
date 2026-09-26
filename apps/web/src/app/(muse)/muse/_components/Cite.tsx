import Link from 'next/link';
import type { FactorProvenance } from '../_data/emission-factors';

/**
 * A citation link for any figure drawn from a registered source. The href
 * resolves the factor-library id through the sources registry: to the source
 * page and figure when registered, otherwise to the factor registry row on
 * Inventory & Audit.
 */
export function Cite({ p, label = 'Source' }: { p: FactorProvenance; label?: string }) {
  const tip = `${p.source} · ${p.version} · ${p.status.toLowerCase()}${p.note ? ` · ${p.note}` : ''}`;
  return (
    <Link className="muse-cite" href={`/muse/sources/by/${encodeURIComponent(p.id)}`} title={tip}>
      {label}
    </Link>
  );
}
