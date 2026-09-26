import 'server-only';
import { asc, eq } from 'drizzle-orm';
import { farmFiscalPeriods, farmCalendarClosures, farmPostingLog } from '@mf/db';
import { db } from '@/lib/db';
import { periodOf } from '../_engine/actuals';
import { postingRefusal, type CalendarClosure, type ClosureKind, type FiscalPeriod, type PostingAction, type PostingEntry } from '../_engine/periods';

/** MicroFarm — periods, calendar and posting-trail read layer (server-only). */

const iso = (d: string | Date | null): string | null => (d === null ? null : typeof d === 'string' ? d : d.toISOString());
const isoDay = (d: string | Date): string => (typeof d === 'string' ? d : d.toISOString().slice(0, 10));

export interface FarmCalendar {
  periods: FiscalPeriod[];
  closures: CalendarClosure[];
}

export async function loadCalendar(): Promise<FarmCalendar> {
  const [periods, closures] = await Promise.all([
    db.select().from(farmFiscalPeriods).orderBy(asc(farmFiscalPeriods.period)),
    db.select().from(farmCalendarClosures).orderBy(asc(farmCalendarClosures.startDate)),
  ]);
  return {
    periods: periods.map((r) => ({
      period: r.period,
      status: r.status === 'locked' ? 'locked' : 'open',
      lockedAt: iso(r.lockedAt),
      lockedBy: r.lockedBy,
      reopenedAt: iso(r.reopenedAt),
      reopenedBy: r.reopenedBy,
      notes: r.notes,
    })),
    closures: closures.map((r) => ({
      id: r.id,
      label: r.label,
      kind: r.kind as ClosureKind,
      startDate: isoDay(r.startDate),
      endDate: isoDay(r.endDate),
      notes: r.notes,
    })),
  };
}

/** The whole trail, seq ascending — verification walks it from the genesis hash. */
export async function loadPostingLog(): Promise<PostingEntry[]> {
  const rows = await db.select().from(farmPostingLog).orderBy(asc(farmPostingLog.seq));
  return rows.map((r) => ({
    seq: r.seq,
    occurredAt: r.occurredAt.toISOString(),
    actorUserId: r.actorUserId,
    actorEmail: r.actorEmail,
    action: r.action as PostingAction,
    recordKind: r.recordKind,
    recordId: r.recordId,
    period: r.period,
    detail: (r.detail ?? {}) as Record<string, unknown>,
    prevHash: r.prevHash,
    hash: r.hash,
  }));
}

/** The refusal for a posting dated `date`, or null when its period is open (Roadmap J3). */
export async function refuseIfLocked(date: string): Promise<string | null> {
  const rows = await db.select().from(farmFiscalPeriods).where(eq(farmFiscalPeriods.period, periodOf(date))).limit(1);
  const periods: FiscalPeriod[] = rows.map((r) => ({
    period: r.period,
    status: r.status === 'locked' ? 'locked' : 'open',
    lockedAt: iso(r.lockedAt),
    lockedBy: r.lockedBy,
    reopenedAt: iso(r.reopenedAt),
    reopenedBy: r.reopenedBy,
    notes: r.notes,
  }));
  return postingRefusal(date, periods);
}
