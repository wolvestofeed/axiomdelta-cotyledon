'use server';

import { cookies } from 'next/headers';
import { accessRefusal, requireMuseOperator } from './access';
import { noteViewed, parseRecent, reportDef, RECENT_REPORTS_COOKIE } from '../_engine/reports';

/**
 * Impact OS — the reader's most recently viewed reports (Roadmap Phase E). A
 * cookie, like the ledger selector: it follows the person, not the workspace,
 * and holds at most five report ids, most recent first. Nothing else is stored.
 */

type Result = { ok: true; recent: string[] } | { ok: false; error: string };

export async function noteReportViewed(id: unknown): Promise<Result> {
  if (typeof id !== 'string' || !reportDef(id)) return { ok: false, error: 'That report is not in the library.' };
  try {
    await requireMuseOperator();
  } catch (e) {
    const refused = accessRefusal(e);
    if (refused) return refused;
    throw e;
  }
  const jar = await cookies();
  const recent = noteViewed(parseRecent(jar.get(RECENT_REPORTS_COOKIE)?.value), id);
  jar.set(RECENT_REPORTS_COOKIE, JSON.stringify(recent), { path: '/muse', httpOnly: true, sameSite: 'lax', maxAge: 60 * 60 * 24 * 90 });
  return { ok: true, recent };
}
