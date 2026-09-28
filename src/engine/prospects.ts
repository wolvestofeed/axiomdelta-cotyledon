/**
 * Cotyledon — prospect query + pipeline stats (server-side).
 *
 * Filters the seeded prospect list by segment / status / free-text search and
 * summarizes the sales pipeline. Read-only over the compiled dataset.
 */

import { prospectRecords, type ProspectRecord, type ProspectSegment } from '@/data/prospects';

export interface ProspectFilters {
  segment: ProspectSegment | 'all';
  status: string; // exact status label or 'all'
  q: string;
}

function haystack(s: ProspectRecord): string {
  return [s.name, s.location, s.model, s.pointOfContact, s.currentProgram, s.grades]
    .join(' ')
    .toLowerCase();
}

export function queryProspects(records: ProspectRecord[], f: ProspectFilters): ProspectRecord[] {
  const q = f.q.trim().toLowerCase();
  return records.filter((s) => {
    if (f.segment !== 'all' && s.segment !== f.segment) return false;
    if (f.status !== 'all' && s.status !== f.status) return false;
    if (q && !haystack(s).includes(q)) return false;
    return true;
  });
}

export interface PipelineStats {
  total: number;
  byStatus: Record<string, number>;
  bySegment: Record<string, number>;
  totalStudents: number; // sum of known enrollments in the set
}

export function pipelineStats(records: ProspectRecord[]): PipelineStats {
  const byStatus: Record<string, number> = {};
  const bySegment: Record<string, number> = {};
  let totalStudents = 0;
  for (const s of records) {
    byStatus[s.status] = (byStatus[s.status] ?? 0) + 1;
    bySegment[s.segment] = (bySegment[s.segment] ?? 0) + 1;
    if (s.headcount) totalStudents += s.headcount;
  }
  return { total: records.length, byStatus, bySegment, totalStudents };
}

export { prospectRecords };
