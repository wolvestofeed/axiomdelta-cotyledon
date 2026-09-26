/**
 * Impact OS — the front door (Roadmap P7): `/muse` is the welcome page, the Dashboard lives at
 * `/muse/dashboard`, and the router sends each person by the list their email is on.
 */

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { LANDING_HREF, landingFor } from '@/app/(muse)/muse/_engine/front-door';
import { EXTERNAL_SECTIONS, MODULES, SECTIONS, modulesFor } from '@/app/(muse)/muse/_components/nav';

const ROOT = join(__dirname, '..', 'src', 'app', '(muse)');
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), 'utf8');

describe('landingFor', () => {
  it('sends an admin to the Admin Dashboard, whatever work roles they hold', () => {
    expect(landingFor({ isSuperAdmin: true, isOperator: true, staffRoles: [] })).toBe('admin');
    expect(landingFor({ isSuperAdmin: true, isOperator: true, staffRoles: ['operator', 'sales'] })).toBe('admin');
    expect(LANDING_HREF.admin).toBe('/muse/dashboard');
  });

  it('gives staff holding both work roles the chooser', () => {
    expect(landingFor({ isSuperAdmin: false, isOperator: true, staffRoles: ['operator', 'sales'] })).toBe('choose');
  });

  it('sends Operator to the Floor and Sales to the Sales Portal', () => {
    expect(landingFor({ isSuperAdmin: false, isOperator: true, staffRoles: ['operator'] })).toBe('floor');
    expect(landingFor({ isSuperAdmin: false, isOperator: true, staffRoles: ['sales'] })).toBe('sales');
    // A named operator not on the register holds operator access.
    expect(landingFor({ isSuperAdmin: false, isOperator: true, staffRoles: [] })).toBe('floor');
    expect(LANDING_HREF.floor).toBe('/muse/floor');
    expect(LANDING_HREF.sales).toBe('/muse/sales-portal');
  });

  it('puts anyone on no list under review', () => {
    expect(landingFor({ isSuperAdmin: false, isOperator: false, staffRoles: [] })).toBe('review');
  });
});

describe('routes', () => {
  it('serves /muse from the front-door group and the Dashboard at /muse/dashboard', () => {
    expect(existsSync(join(ROOT, 'muse', 'page.tsx'))).toBe(false);
    expect(read('(front)', 'muse', 'page.tsx')).toContain('Welcome to the operating system built specifically for regenerative, scratch kitchens');
    expect(read('(front)', 'muse', 'page.tsx')).toMatch(/>\s*Login\s*</);
    expect(existsSync(join(ROOT, 'muse', 'dashboard', 'page.tsx'))).toBe(true);
  });

  it('the sign-in links to the front door sign-up, and both return to the router', () => {
    expect(read('(front)', 'muse', 'sign-in', '[[...sign-in]]', 'page.tsx')).toContain('href="/muse/sign-up">Create account</Link>');
    const auth = read('muse', '_components', 'PortalAuth.tsx');
    expect(auth).toContain('path="/muse/sign-up"');
    expect(auth.match(/forceRedirectUrl="\/muse\/enter"/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it('the router redirects before rendering and reads the lists server-side', () => {
    const src = read('(front)', 'muse', 'enter', 'page.tsx');
    expect(src).toContain('const landing = landingFor(access);');
    expect(src).toContain("if (!access.userId) redirect('/muse/sign-in');");
  });

  it('the menu links the Dashboard at /muse/dashboard, first, and names it the Admin Dashboard for admins', () => {
    expect(MODULES[0].href).toBe('/muse/dashboard');
    expect(modulesFor(true)[0].label).toBe('Admin Dashboard');
    expect(modulesFor(false)[0].label).toBe('Dashboard');
    expect(MODULES.some((m) => m.href === '/muse')).toBe(false);
  });
});

describe('menu order (Robert, 2026-09-16)', () => {
  it('ends the OS sections with Sales then Distribution, and puts Customer, Supplier, Parent last', () => {
    expect(SECTIONS.slice(-5)).toEqual(['Sales', 'Distribution', ...EXTERNAL_SECTIONS]);
    expect(EXTERNAL_SECTIONS).toEqual(['Customer', 'Supplier', 'Parent']);
    expect(SECTIONS).toContain('Supply Chain');
    expect(SECTIONS).not.toContain('Supply');
  });

  it('draws the thin rule under the top links and the OS rule above the portals', () => {
    const src = readFileSync(join(ROOT, 'muse', '_components', 'MuseSidebar.tsx'), 'utf8');
    expect(src).toContain('<hr className="muse-nav-rule" />');
    expect(src).toContain('<hr className="muse-nav-rule os" />');
    // Sources is last, after the portals; the foot shows the signed-in person and nothing else.
    expect(src.indexOf('{bottom.map(')).toBeGreaterThan(src.indexOf('{externalSections.map(renderSection)}'));
    expect(src).toContain('<span className="muse-user-pill" title={userEmail ?? undefined}>{userName}</span>');
    expect(src).not.toContain('Private preview');
  });
});
