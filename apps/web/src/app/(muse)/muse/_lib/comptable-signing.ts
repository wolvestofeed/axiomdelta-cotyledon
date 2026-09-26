import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Impact OS — signing the CompTable notices (Roadmap O4, contract version 1).
 *
 * Each notice body is signed with HMAC-SHA256 over `<unix seconds>.<raw body>`
 * and carried in one header, `t=<seconds>,v1=<hex>`. The receiver accepts a
 * signature made with any current secret (so a key can be rotated), refuses one
 * older or newer than the tolerance, and compares in constant time. The secrets
 * themselves do not exist yet: they are issued with the Muse Kitchen account in
 * CompTable.
 */

export const SIGNATURE_HEADER = 'x-muse-comptable-signature';
export const SIGNATURE_TOLERANCE_SECONDS = 300;

function digest(rawBody: string, secret: string, timestampSeconds: number): string {
  return createHmac('sha256', secret).update(`${timestampSeconds}.${rawBody}`).digest('hex');
}

export function signNotice(rawBody: string, secret: string, timestampSeconds: number): string {
  return `t=${timestampSeconds},v1=${digest(rawBody, secret, timestampSeconds)}`;
}

export type VerifyResult = { ok: true } | { ok: false; reason: 'malformed' | 'stale' | 'mismatch' };

export function verifyNotice(
  rawBody: string,
  header: string | null,
  secrets: readonly string[],
  nowSeconds: number,
  toleranceSeconds: number = SIGNATURE_TOLERANCE_SECONDS,
): VerifyResult {
  const parts = new Map((header ?? '').split(',').map((p) => p.trim().split('=', 2) as [string, string | undefined]));
  const t = Number(parts.get('t'));
  const v1 = parts.get('v1');
  if (!Number.isInteger(t) || !v1 || !/^[0-9a-f]{64}$/.test(v1) || secrets.length === 0) return { ok: false, reason: 'malformed' };
  if (Math.abs(nowSeconds - t) > toleranceSeconds) return { ok: false, reason: 'stale' };
  const given = Buffer.from(v1, 'hex');
  const matches = secrets.some((s) => timingSafeEqual(Buffer.from(digest(rawBody, s, t), 'hex'), given));
  return matches ? { ok: true } : { ok: false, reason: 'mismatch' };
}
