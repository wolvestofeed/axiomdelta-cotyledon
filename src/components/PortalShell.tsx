import Link from 'next/link';
import Image from 'next/image';
import logo from '@/assets/cotyledon-header.png';
import { farmFontVars } from '@/components/fonts';
import { BRAND_LINE } from '@/components/ui';

/**
 * A portal's own shell (Roadmap P1b): the brand, the portal's name and its own links — nothing links into
 * the OS. External portals carry the review policy.
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
  /** Suppliers, subscribers and parents: the review policy shows under the header. */
  external?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={`farm-root ${farmFontVars}`}>
      <div className="farm-floor-shell">
        <div className="farm-floor-top">
          <span className="farm-floor-brand">
            <Image src={logo} alt="Cotyledon, powered by Ember OS" className="farm-floor-logo" priority sizes="10rem" />
          </span>
          <span className="farm-brand-sub">{portal}</span>
          <nav className="farm-kpi-sub inline-flex! gap-[0.9rem]! flex-wrap!" aria-label={portal}>
            {links.map((l) => (
              <Link key={l.href} className="farm-link" href={l.href}>{l.label}</Link>
            ))}
          </nav>
          <span className="farm-kpi-sub ml-auto!">{who}</span>
        </div>
        {external && <ReviewPolicy />}
        <div className="farm-floor-content">{children}</div>
        <footer className="farm-footer">{BRAND_LINE}</footer>
      </div>
    </div>
  );
}

/** The policy on every external portal. */
export function ReviewPolicy() {
  return (
    <div role="note" className="border-b border-b-[color:var(--farm-line)] bg-[color:var(--farm-surface-2)] py-[0.55rem] px-5 farm-fs-sm farm-c-soft">
      New accounts, orders and supplier submissions are reviewed by the farm&rsquo;s staff before they are committed to production. Please call the farm for faster service.
    </div>
  );
}
