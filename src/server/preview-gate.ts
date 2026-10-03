/**
 * Cotyledon — the private preview gate.
 *
 * Pre-revenue, the software is shown to people Rob chooses. One password he programs
 * (`FARM_PREVIEW_PASSWORD`) opens the whole deployment: no Clerk sign-up, no organization, every
 * visitor is the admin of the one workspace, exactly as the local development bypass runs. A
 * correct password sets a signed cookie: the expiry and an HMAC of it keyed on the password, so a
 * cookie cannot be forged by hand and changing the password signs everyone out at once. The gate is
 * a courtesy lock for a preview, not security: anyone holding the password can pass it on, and
 * nothing records who did what. It comes down the day a second tenant or a real subscriber signs in.
 *
 * No `server-only` import: `proxy.ts` runs this on the edge, and the tests run it under node.
 */

export const PREVIEW_COOKIE = 'cotyledon_preview';
export const PREVIEW_TTL_DAYS = 30;

/** The password on file, or null when no gate is set (the deployment then runs on Clerk). */
export function previewPassword(): string | null {
  const p = process.env['FARM_PREVIEW_PASSWORD']?.trim();
  return p ? p : null;
}

/** True when the deployment is a gated private preview. */
export function previewGate(): boolean {
  return previewPassword() !== null;
}

const enc = new TextEncoder();

async function hmacHex(password: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Equal length and content, without an early exit on the first differing byte. */
export function constantTimeEqual(a: string, b: string): boolean {
  const x = enc.encode(a);
  const y = enc.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

export function passwordMatches(submitted: string, expected: string): boolean {
  return constantTimeEqual(submitted.trim(), expected);
}

/** `<expiry ms>.<hmac>`: the cookie a correct password earns. */
export async function issuePreviewToken(password: string, now: number = Date.now(), ttlDays: number = PREVIEW_TTL_DAYS): Promise<string> {
  const exp = now + ttlDays * 86_400_000;
  return `${exp}.${await hmacHex(password, `preview:${exp}`)}`;
}

/** True for an unexpired token signed with this password. */
export async function verifyPreviewToken(token: string | null | undefined, password: string, now: number = Date.now()): Promise<boolean> {
  if (!token) return false;
  const dot = token.indexOf('.');
  if (dot <= 0) return false;
  const expText = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!/^\d+$/.test(expText) || sig.length !== 64) return false;
  const exp = Number(expText);
  if (!(exp > now)) return false;
  return constantTimeEqual(sig, await hmacHex(password, `preview:${exp}`));
}

/** Paths the gate lets through: its own page, Stripe's webhook, and what a browser fetches on its own. */
export function isGateExempt(pathname: string): boolean {
  return pathname === '/enter' || pathname === '/api/stripe/webhook' || pathname === '/robots.txt' || pathname === '/favicon.ico' || pathname.startsWith('/_next/');
}

/** Where to send a visitor after the gate: a path on this host only, never an outside address. */
export function safeNextPath(next: string | null | undefined): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\') || next.includes('://')) return '/farm';
  if (next === '/enter' || next.startsWith('/enter?')) return '/farm';
  return next;
}
