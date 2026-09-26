/**
 * MicroFarm — the role matrix (Roadmap O5): admin and operator.
 *
 * Operators get no company financials: the Financials & Accounting entries are
 * removed from their navigation and every one of those pages is gated on the
 * server before it loads anything. Production Planning's run economics and the
 * channel allocation, and the admin dashboard, are shown to admins only. The
 * viewer role is gone from the route group.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { MODULES, modulesFor, sectionsOf } from '@/app/(farm)/farm/_components/nav';

const ROOT = join(__dirname, '..', 'src', 'app', '(farm)');
const FARM = join(ROOT, 'farm');
const read = (...p: string[]) => readFileSync(join(...p), 'utf8');

const ADMIN_ONLY = [
  '/farm/financials/unit-economics',
  '/farm/financials/pnl',
  '/farm/actuals',
  '/farm/receivables',
  '/farm/payables',
  '/farm/financials/cash-flow',
  '/farm/financials/balance-sheet',
  '/farm/financials/capital',
  '/farm/financials/ledger',
  '/farm/financials/plan-v-actual',
  // Facility: the Design and Build plan, footprints, space, conformance and the layout.
  '/farm/sustainability/facility',
];

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

describe('navigation by role', () => {
  it('the admin-only entries are exactly Financials & Accounting, plus Facility', () => {
    expect(MODULES.filter((m) => m.adminOnly).map((m) => m.href).sort()).toEqual([...ADMIN_ONLY].sort());
    expect(MODULES.filter((m) => m.section === 'Financials & Accounting').every((m) => m.adminOnly)).toBe(true);
  });

  it('operators get every other entry, admins get all of them', () => {
    const operator = modulesFor(false);
    expect(operator.some((m) => ADMIN_ONLY.includes(m.href))).toBe(false);
    expect(operator).toHaveLength(MODULES.length - ADMIN_ONLY.length);
    expect(sectionsOf(operator)).not.toContain('Financials & Accounting');
    // Admins open every module; their Dashboard is named the Admin Dashboard (Roadmap P7).
    expect(modulesFor(true).map((m) => m.href)).toEqual(MODULES.map((m) => m.href));
  });
});

describe('admin-only pages are gated on the server', () => {
  it('each server page returns the notice before it loads anything', () => {
    for (const page of ['financials/cash-flow', 'financials/balance-sheet', 'financials/ledger', 'financials/plan-v-actual', 'actuals', 'receivables', 'payables', 'receivables/invoices/[id]', 'sustainability/facility']) {
      const src = read(FARM, page, 'page.tsx');
      expect(src, page).not.toMatch(/^'use client'/);
      const body = src.slice(src.indexOf('export default async function'));
      const gate = body.indexOf('if (!(await getFarmAccess()).isSuperAdmin) return <AdminOnlyNotice');
      expect(gate, page).toBeGreaterThan(-1);
      expect(body.indexOf('await Promise.all') === -1 || gate < body.indexOf('await Promise.all'), page).toBe(true);
    }
  });

  it('the client pages under financials sit behind the financials layout gate', () => {
    for (const page of ['financials/pnl', 'financials/capital', 'financials/unit-economics']) {
      expect(read(FARM, page, 'page.tsx')).toMatch(/^'use client'/);
    }
    expect(read(FARM, 'financials', 'layout.tsx')).toContain('if (!access.isSuperAdmin) return <AdminOnlyNotice');
  });

  it('Production Planning shows run economics and the channel allocation to admins only', () => {
    expect(read(FARM, 'production-planning', 'page.tsx')).toContain('showFinancials={access.isSuperAdmin}');
    const client = read(FARM, 'production-planning', 'ProductionPlanningClient.tsx');
    expect(client).toContain('{showFinancials && (\n            <Card title={`Economics of');
    expect(client).toContain('{showFinancials && (\n            <>\n          <Card title="By channel');
  });

  it("the operator dashboard reads no company financials and no staff data", () => {
    const src = read(FARM, 'dashboard', 'page.tsx');
    const operator = src.slice(src.indexOf('async function OperatorDashboard'), src.indexOf('// ── Pieces'));
    const shared = src.slice(src.indexOf('async function loadOperatingPicture'), src.indexOf('// ── Admin'));
    for (const term of ['annualPnL', 'capexRollup', 'productionDayLedger', 'costPerUnit', 'monthlyBilled', 'loadActuals', 'actuals.', 'billBalances']) {
      expect(operator, term).not.toContain(term);
      expect(shared, term).not.toContain(term);
    }
    expect(src).toContain('return access.isSuperAdmin ? await AdminDashboard() : await OperatorDashboard({ staffId: access.staffId });');
    // The operator's own clock is read for their staff id only.
    expect(src).toContain('const mine = clock.punches.filter((p) => p.staffId === staffId);');
  });

  it('HR shows an operator their own record only, and nothing without a matched sign-in', () => {
    const src = read(FARM, 'staffing', 'page.tsx');
    expect(src).toContain('if (!isAdmin && !access.staffId) {');
    expect(src).toContain('clock.staff.filter((s) => s.id === access.staffId)');
    expect(src).toContain('clock.punches.filter((p) => p.staffId === access.staffId)');
  });
});

describe('the viewer role is gone', () => {
  it('no file in the route group refers to it', () => {
    for (const file of walk(ROOT).filter((f) => /\.(ts|tsx)$/.test(f))) {
      expect(read(file), file).not.toMatch(/isViewer|requireFarmViewer|farmViewer|not_viewer/);
    }
  });
});
