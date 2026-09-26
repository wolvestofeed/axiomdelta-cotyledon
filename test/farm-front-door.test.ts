/**
 * MicroFarm — the front door (Roadmap P7): `/farm` is the welcome page, the Dashboard lives at
 * `/farm/dashboard`, and the router sends each person by the list their email is on.
 */

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { LANDING_HREF, landingFor } from '@/engine/front-door';
import { EXTERNAL_SECTIONS, MODULES, SECTIONS, modulesFor } from '@/components/nav';

const ROOT = join(__dirname, '..', 'src', 'app', '(farm)');
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), 'utf8');

describe('landingFor', () => {
  it('sends an admin to the Admin Dashboard, whatever work roles they hold', () => {
    expect(landingFor({ isSuperAdmin: true, isOperator: true, staffRoles: [] })).toBe('admin');
    expect(landingFor({ isSuperAdmin: true, isOperator: true, staffRoles: ['operator', 'sales'] })).toBe('admin');
    expect(LANDING_HREF.admin).toBe('/farm/dashboard');
  });

  it('gives staff holding both work roles the chooser', () => {
    expect(landingFor({ isSuperAdmin: false, isOperator: true, staffRoles: ['operator', 'sales'] })).toBe('choose');
  });

  it('sends Operator to the Grow Room and Sales to the Sales Portal', () => {
    expect(landingFor({ isSuperAdmin: false, isOperator: true, staffRoles: ['operator'] })).toBe('growRoom');
    expect(landingFor({ isSuperAdmin: false, isOperator: true, staffRoles: ['sales'] })).toBe('sales');
    // A named operator not on the register holds operator access.
    expect(landingFor({ isSuperAdmin: false, isOperator: true, staffRoles: [] })).toBe('growRoom');
    expect(LANDING_HREF.growRoom).toBe('/farm/grow-room');
    expect(LANDING_HREF.sales).toBe('/farm/sales-portal');
  });

  it('puts anyone on no list under review', () => {
    expect(landingFor({ isSuperAdmin: false, isOperator: false, staffRoles: [] })).toBe('review');
  });
});

describe('routes', () => {
  it('serves /farm from the front-door group and the Dashboard at /farm/dashboard', () => {
    expect(existsSync(join(ROOT, 'farm', 'page.tsx'))).toBe(false);
    expect(read('(front)', 'farm', 'page.tsx')).toContain('Welcome to the operating system built specifically for regenerative, scratch farms');
    expect(read('(front)', 'farm', 'page.tsx')).toMatch(/>\s*Login\s*</);
    expect(existsSync(join(ROOT, 'farm', 'dashboard', 'page.tsx'))).toBe(true);
  });

  it('the sign-in links to the front door sign-up, and both return to the router', () => {
    expect(read('(front)', 'farm', 'sign-in', '[[...sign-in]]', 'page.tsx')).toContain('href="/farm/sign-up">Create account</Link>');
    const auth = readFileSync(join(__dirname, '..', 'src', 'components', 'PortalAuth.tsx'), 'utf8');
    expect(auth).toContain('path="/farm/sign-up"');
    expect(auth.match(/forceRedirectUrl="\/farm\/enter"/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it('the router redirects before rendering and reads the lists server-side', () => {
    const src = read('(front)', 'farm', 'enter', 'page.tsx');
    expect(src).toContain('const landing = landingFor(access);');
    expect(src).toContain("if (!access.userId) redirect('/farm/sign-in');");
  });

  it('the menu links the Dashboard at /farm/dashboard, first, and names it the Admin Dashboard for admins', () => {
    expect(MODULES[0].href).toBe('/farm/dashboard');
    expect(modulesFor(true)[0].label).toBe('Admin Dashboard');
    expect(modulesFor(false)[0].label).toBe('Dashboard');
    expect(MODULES.some((m) => m.href === '/farm')).toBe(false);
  });
});

describe('menu order', () => {
  it('ends the OS sections with Sales then Distribution, and puts Subscriber, Supplier last', () => {
    expect(SECTIONS.slice(-4)).toEqual(['Sales', 'Distribution', ...EXTERNAL_SECTIONS]);
    expect(EXTERNAL_SECTIONS).toEqual(['Subscriber', 'Supplier']);
    expect(SECTIONS).toContain('Supply Chain');
    expect(SECTIONS).not.toContain('Supply');
  });

  it('draws the thin rule under the top links and the OS rule above the portals', () => {
    const src = readFileSync(join(__dirname, '..', 'src', 'components', 'FarmSidebar.tsx'), 'utf8');
    expect(src).toContain('<hr className="farm-nav-rule" />');
    expect(src).toContain('<hr className="farm-nav-rule os" />');
    // Sources is last, after the portals; the foot shows the signed-in person and nothing else.
    expect(src.indexOf('{bottom.map(')).toBeGreaterThan(src.indexOf('{externalSections.map(renderSection)}'));
    expect(src).toContain('<span className="farm-user-pill" title={userEmail ?? undefined}>{userName}</span>');
    expect(src).not.toContain('Private preview');
  });
});
