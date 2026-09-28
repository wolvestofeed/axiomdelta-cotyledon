'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import logo from '@/assets/cotyledon-stacked.png';
import { usePathname } from 'next/navigation';
import { EXTERNAL_SECTIONS, MODULES, modulesFor, sectionsOf } from '@/components/nav';

const OVERVIEW = 'Overview';

/** Section titles too long for one line are set as stacked lines. */
const SECTION_LINES: Record<string, string[]> = {
  'Financials & Accounting': ['Financials &', 'Accounting'],
};

function isActivePath(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(href + '/');
}

function sectionForPath(pathname: string): string | null {
  const m = MODULES.find((x) => isActivePath(pathname, x.href));
  return m ? m.section : null;
}

export function FarmSidebar({ isAdmin, userName, userEmail }: { isAdmin: boolean; userName: string; userEmail: string | null }) {
  const modules = modulesFor(isAdmin);
  const pathname = usePathname();
  const activeSection = sectionForPath(pathname);

  // Sections are collapsed by default. The section holding the current page
  // opens when navigation lands in it; manual toggles persist for the session.
  const [open, setOpen] = useState<Record<string, boolean>>(() =>
    activeSection ? { [activeSection]: true } : {},
  );
  const [seenSection, setSeenSection] = useState(activeSection);
  if (activeSection !== seenSection) {
    setSeenSection(activeSection);
    if (activeSection && !open[activeSection]) setOpen({ ...open, [activeSection]: true });
  }

  const toggle = (section: string) => setOpen((o) => ({ ...o, [section]: !o[section] }));

  // Overview splits: the top links, and Sources, last in the menu.
  const overview = modules.filter((m) => m.section === OVERVIEW && !m.atBottom);
  const bottom = modules.filter((m) => m.atBottom);
  // The OS sections, then the external users' portals below a rule.
  const sections = sectionsOf(modules).filter((s) => s !== OVERVIEW);
  const osSections = sections.filter((s) => !EXTERNAL_SECTIONS.includes(s));
  const externalSections = sections.filter((s) => EXTERNAL_SECTIONS.includes(s));

  const renderSection = (section: string) => {
    const items = modules.filter((m) => m.section === section);
    const isOpen = !!open[section];
    const holdsActive = section === activeSection;
    return (
      <div key={section} className="farm-nav-group" data-open={isOpen}>
        <button
          type="button"
          className="farm-nav-section"
          onClick={() => toggle(section)}
          aria-expanded={isOpen}
          aria-controls={`farm-nav-${section.replace(/\W+/g, '-')}`}
          data-active={holdsActive}
        >
          <span className="farm-nav-section-label">
            {(SECTION_LINES[section] ?? [section]).map((line) => (
              <span key={line}>{line}</span>
            ))}
          </span>
          <span className="farm-nav-mark" aria-hidden="true">{isOpen ? '−' : '+'}</span>
        </button>
        {isOpen && (
          <div id={`farm-nav-${section.replace(/\W+/g, '-')}`} className="farm-nav-items">
            {items.map((m) => (
              <Link key={m.href} href={m.href} className="farm-nav-link" data-active={isActivePath(pathname, m.href)}>
                {m.label}
              </Link>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <aside className="farm-sidebar">
      <div className="farm-brand">
        <Link href="/farm/dashboard" aria-label="Cotyledon — Dashboard">
          <Image src={logo} alt="Cotyledon, powered by Ember OS" className="farm-brand-logo" priority sizes="12rem" />
        </Link>
      </div>

      <nav className="farm-nav">
        {overview.map((m) => (
          <Link key={m.href} href={m.href} className="farm-nav-link top" data-active={isActivePath(pathname, m.href)}>
            {m.label}
          </Link>
        ))}

        <hr className="farm-nav-rule" />

        {osSections.map(renderSection)}

        {externalSections.length > 0 && <hr className="farm-nav-rule os" />}
        {externalSections.map(renderSection)}

        {bottom.map((m) => (
          <Link key={m.href} href={m.href} className="farm-nav-link bottom" data-active={isActivePath(pathname, m.href)}>
            {m.label}
          </Link>
        ))}
      </nav>

      {/* The signed-in person, always in view at the foot of the menu. */}
      <div className="farm-sidebar-foot">
        <span className="farm-user-pill" title={userEmail ?? undefined}>{userName}</span>
      </div>
    </aside>
  );
}
