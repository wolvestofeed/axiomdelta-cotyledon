import Link from 'next/link';
import Image from 'next/image';
import logo from '../_assets/muse-kitchen-icon-512.png';
import { museFontVars } from './fonts';
import { BRAND_LINE } from './ui';

/**
 * A portal's own shell (Roadmap P1b): the brand, the portal's name and its own links — nothing links into
 * the OS. External portals carry the review policy (Robert, 2026-09-16).
 */
export function PortalShell({
  portal,
  links,
  who,
  external = false,
  children,
}: {
  portal: string;
  links: { href: string; label: string }[];
  /** The signed-in line, top right. */
  who: React.ReactNode;
  /** Suppliers, customers and parents: the review policy shows under the header. */
  external?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={`muse-root ${museFontVars}`}>
      <div className="muse-floor-shell">
        <div className="muse-floor-top">
          <span className="muse-floor-brand" aria-label="Muse Kitchen Impact OS">
            <Image src={logo} alt="" className="muse-brand-icon" priority sizes="4rem" />
            <span>
              <span className="muse-brand-wordmark">Muse Kitchen</span>
              <span className="muse-brand-tagline">Impact OS</span>
            </span>
          </span>
          <span className="muse-brand-sub">{portal}</span>
          <nav className="muse-kpi-sub inline-flex! gap-[0.9rem]! flex-wrap!" aria-label={portal}>
            {links.map((l) => (
              <Link key={l.href} className="muse-link" href={l.href}>{l.label}</Link>
            ))}
          </nav>
          <span className="muse-kpi-sub ml-auto!">{who}</span>
        </div>
        {external && <ReviewPolicy />}
        <div className="muse-floor-content">{children}</div>
        <footer className="muse-footer">{BRAND_LINE}</footer>
      </div>
    </div>
  );
}

/** The policy on every external portal (Robert, 2026-09-16). */
export function ReviewPolicy() {
  return (
    <div role="note" className="border-b border-b-[color:var(--muse-line)] bg-[color:var(--muse-surface-2)] py-[0.55rem] px-5 muse-fs-sm muse-c-soft">
      New accounts, orders and supplier submissions are reviewed by Muse Kitchen staff before they are committed to production. Please call the kitchen for faster service.
    </div>
  );
}
