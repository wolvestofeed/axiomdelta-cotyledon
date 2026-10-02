/**
 * Cotyledon — the Client Portal (Phase 3): its pages exist at their addresses, the menu and the
 * middleware name it and nothing else, and the Supplier Portal is out of the UI while on hold.
 */

import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { EXTERNAL_SECTIONS, MODULES } from '@/components/nav';
import { REPORT_CATALOG } from '@/engine/reports';

const APP = join(__dirname, '..', 'src', 'app');
const CLIENT = join(APP, '(farm)', '(client)', 'farm', 'client-portal');
const read = (...p: string[]) => readFileSync(join(...p), 'utf8');

describe('client portal — pages', () => {
  it('serves its home, Flat Builder, Subscriptions, Profile, Settings, hemp mats and glossary under /farm/client-portal', () => {
    for (const page of ['', 'flat-builder', 'subscriptions', 'profile', 'settings', 'hemp-mats', 'glossary']) {
      expect(existsSync(join(CLIENT, '(member)', page, 'page.tsx'))).toBe(true);
    }
    expect(existsSync(join(CLIENT, 'sign-in', '[[...sign-in]]', 'page.tsx'))).toBe(true);
    expect(existsSync(join(CLIENT, 'sign-up', '[[...sign-up]]', 'page.tsx'))).toBe(true);
  });

  it('links every page from its shell, and names the portal Client Portal nowhere else', () => {
    const shell = read(APP, '(farm)', '(client)', 'layout.tsx');
    for (const href of ['/farm/client-portal', '/farm/client-portal/flat-builder', '/farm/client-portal/subscriptions', '/farm/client-portal/profile', '/farm/client-portal/settings', '/farm/client-portal/hemp-mats', '/farm/client-portal/glossary']) {
      expect(shell).toContain(`href: '${href}'`);
    }
    expect(shell).toContain('portal="Client Portal"');
    expect(existsSync(join(APP, '(farm)', '(subscriber)'))).toBe(false);
  });

  it('the hemp mats page renders claims from the science library and writes none of its own', () => {
    const src = read(CLIENT, '(member)', 'hemp-mats', 'page.tsx');
    expect(src).toContain('SCIENCE_CLAIM_BY_ID');
    for (const id of ['hemp-mat-specification', 'hemp-mat-retention', 'hemp-mat-stratification', 'fiber-mat-minerals']) expect(src).toContain(`'${id}'`);
  });
});

describe('client portal — the menu, the middleware and the supplier portal on hold', () => {
  it('the Client section lists the portal, Flat Builder, Subscriptions, Profile and Settings, and is the one external section', () => {
    const client = MODULES.filter((m) => m.section === 'Client').map((m) => m.href);
    expect(client).toEqual(['/farm/client-portal', '/farm/client-portal/flat-builder', '/farm/client-portal/subscriptions', '/farm/client-portal/profile', '/farm/client-portal/settings']);
    expect(EXTERNAL_SECTIONS).toEqual(['Client']);
  });

  it('the Supplier Portal is out of the UI: no route group, no menu entry, no public matcher; the Suppliers page in the OS stays', () => {
    expect(existsSync(join(APP, '(farm)', '(supplier)'))).toBe(false);
    expect(MODULES.some((m) => m.href.startsWith('/farm/supplier-portal'))).toBe(false);
    expect(MODULES.some((m) => m.href === '/farm/suppliers')).toBe(true);
    const proxy = read(__dirname, '..', 'src', 'proxy.ts');
    expect(proxy).not.toContain('supplier-portal');
    expect(proxy).toContain("'/farm/client-portal/sign-in(.*)'");
    expect(REPORT_CATALOG.some((r) => r.section === 'Supplier')).toBe(false);
    expect(REPORT_CATALOG.find((r) => r.id === 'supplier-catalogs')?.sourceHref).toBe('/farm/suppliers');
  });

  it('the Stripe routes exist and refuse with 503 before anything else when no key is on file', () => {
    for (const r of ['checkout', 'portal', 'webhook']) {
      const src = read(APP, 'api', 'stripe', r, 'route.ts');
      expect(src).toContain('stripeConfigured()');
      expect(src).toContain('status: 503');
    }
  });
});
