/**
 * Cotyledon — the private preview gate: a password on file, a signed cookie, the paths it lets through.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { constantTimeEqual, isGateExempt, issuePreviewToken, passwordMatches, previewGate, previewPassword, safeNextPath, verifyPreviewToken } from '@/server/preview-gate';
import { devBypass } from '@/server/dev-bypass';

const ENV = { ...process.env };
afterEach(() => {
  process.env = { ...ENV };
});

describe('preview gate — the password on file', () => {
  it('no password, no gate; a blank password is no password', () => {
    delete process.env['FARM_PREVIEW_PASSWORD'];
    expect(previewGate()).toBe(false);
    process.env['FARM_PREVIEW_PASSWORD'] = '   ';
    expect(previewGate()).toBe(false);
    expect(previewPassword()).toBeNull();
  });
  it('a password set makes the gate, and the deployment runs as the workspace admin in any environment', () => {
    process.env['FARM_PREVIEW_PASSWORD'] = 'cotyledon-preview';
    process.env['FARM_DEV_BYPASS_AUTH'] = '';
    (process.env as Record<string, string | undefined>)['NODE_ENV'] = 'production';
    expect(previewGate()).toBe(true);
    expect(devBypass()).toBe(true);
  });
  it('compares in constant time and ignores surrounding whitespace', () => {
    expect(passwordMatches(' open-sesame ', 'open-sesame')).toBe(true);
    expect(passwordMatches('open-sesame!', 'open-sesame')).toBe(false);
    expect(constantTimeEqual('abc', 'abd')).toBe(false);
    expect(constantTimeEqual('', '')).toBe(true);
  });
});

describe('preview gate — the signed cookie', () => {
  const now = Date.parse('2026-10-02T12:00:00Z');
  it('a token verifies with the password it was signed with until it expires', async () => {
    const t = await issuePreviewToken('pw', now);
    expect(t).toMatch(/^\d+\.[0-9a-f]{64}$/);
    expect(await verifyPreviewToken(t, 'pw', now)).toBe(true);
    expect(await verifyPreviewToken(t, 'pw', now + 29 * 86_400_000)).toBe(true);
    expect(await verifyPreviewToken(t, 'pw', now + 31 * 86_400_000)).toBe(false);
  });
  it('a changed password, a tampered expiry or signature, or no cookie at all is refused', async () => {
    const t = await issuePreviewToken('pw', now);
    expect(await verifyPreviewToken(t, 'new-pw', now)).toBe(false);
    const [exp, sig] = t.split('.');
    expect(await verifyPreviewToken(`${Number(exp) + 86_400_000 * 365}.${sig}`, 'pw', now)).toBe(false);
    expect(await verifyPreviewToken(`${exp}.${'0'.repeat(64)}`, 'pw', now)).toBe(false);
    expect(await verifyPreviewToken(`${exp}.${sig.slice(0, 63)}`, 'pw', now)).toBe(false);
    expect(await verifyPreviewToken('', 'pw', now)).toBe(false);
    expect(await verifyPreviewToken(undefined, 'pw', now)).toBe(false);
    expect(await verifyPreviewToken('garbage', 'pw', now)).toBe(false);
  });
});

describe('preview gate — what passes and where a visitor goes', () => {
  it('lets through its own page, the Stripe webhook and the browser\'s own fetches, nothing else', () => {
    for (const p of ['/enter', '/api/stripe/webhook', '/favicon.ico', '/robots.txt', '/_next/static/x.js']) expect(isGateExempt(p), p).toBe(true);
    for (const p of ['/', '/farm', '/farm/sustainability/water', '/api/stripe/checkout', '/farm/client-portal', '/enter/other']) expect(isGateExempt(p), p).toBe(false);
  });
  it('sends a visitor on to a path on this host only', () => {
    expect(safeNextPath('/farm/orders?x=1')).toBe('/farm/orders?x=1');
    expect(safeNextPath(undefined)).toBe('/farm');
    expect(safeNextPath('https://evil.example/')).toBe('/farm');
    expect(safeNextPath('//evil.example/')).toBe('/farm');
    expect(safeNextPath('/\\evil.example')).toBe('/farm');
    expect(safeNextPath('/enter?next=%2Ffarm')).toBe('/farm');
  });
});
