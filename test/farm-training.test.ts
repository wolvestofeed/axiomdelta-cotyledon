import { describe, it, expect } from 'vitest';
import {
  activeVersion,
  activeVersions,
  completionFor,
  completionHeadline,
  docKeyFrom,
  docState,
  nextVersion,
  outstandingFor,
  planPublish,
  versionsOf,
  type TrainingAssignmentDoc,
  type TrainingDocDoc,
} from '@/engine/training';

const doc = (over: Partial<TrainingDocDoc> & Pick<TrainingDocDoc, 'id' | 'version'>): TrainingDocDoc => ({
  docKey: 'facility-operations',
  title: 'Facility Farm Operations & Culinary Foundations',
  summary: null,
  requiredAtOrientation: true,
  requiresRecompletion: true,
  publishedAt: null,
  archivedAt: null,
  supersededBy: null,
  fileName: 'training.pdf',
  fileMime: 'application/pdf',
  fileSize: 1957_000,
  notes: null,
  ...over,
});

const assign = (docId: string, staffId: string, completedAt: string | null = null): TrainingAssignmentDoc => ({
  id: `${docId}:${staffId}`,
  docId,
  staffId,
  assignedAt: '2026-09-15T00:00:00.000Z',
  completedAt,
  note: null,
});

describe('training documents — versions are kept, never overwritten', () => {
  it('a version is a draft, active, or archived — and the state is read off the timestamps', () => {
    expect(docState(doc({ id: 'a', version: 1 }))).toBe('draft');
    expect(docState(doc({ id: 'a', version: 1, publishedAt: '2026-09-15T10:00:00.000Z' }))).toBe('active');
    expect(docState(doc({ id: 'a', version: 1, publishedAt: '2026-09-15T10:00:00.000Z', archivedAt: '2026-10-01T09:00:00.000Z' }))).toBe('archived');
  });

  it('exactly one version of a family is active, and the history keeps the rest', () => {
    const docs = [
      doc({ id: 'v1', version: 1, publishedAt: '2026-09-15T10:00:00.000Z', archivedAt: '2026-10-01T09:00:00.000Z', supersededBy: 'v2' }),
      doc({ id: 'v2', version: 2, publishedAt: '2026-10-01T09:00:00.000Z' }),
      doc({ id: 'v3', version: 3 }),
    ];
    expect(activeVersion(docs, 'facility-operations')?.id).toBe('v2');
    expect(activeVersions(docs).map((d) => d.id)).toEqual(['v2']);
    expect(versionsOf(docs, 'facility-operations').map((d) => d.version)).toEqual([3, 2, 1]);
    expect(nextVersion(docs, 'facility-operations')).toBe(4);
    expect(nextVersion(docs, 'produce-safety')).toBe(1);
  });

  it('the archived version went out at the same instant its replacement came in', () => {
    const v1 = doc({ id: 'v1', version: 1, publishedAt: '2026-09-15T10:00:00.000Z', archivedAt: '2026-10-01T09:00:00.000Z' });
    const v2 = doc({ id: 'v2', version: 2, publishedAt: '2026-10-01T09:00:00.000Z' });
    expect(v1.archivedAt).toBe(v2.publishedAt); // no gap, and never two in force
  });

  it('a title becomes a family key without inventing anything', () => {
    expect(docKeyFrom('Facility Farm Operations & Culinary Foundations')).toBe('facility-farm-operations-culinary-foundations');
    expect(docKeyFrom('  ')).toBe('training-document');
  });
});

describe('training documents — who has read what', () => {
  const staff = ['s1', 's2', 's3'];

  it('a person with no assignment row counts as outstanding, not as absent', () => {
    const c = completionFor('v1', [assign('v1', 's1', '2026-09-16T08:00:00.000Z'), assign('v1', 's2')], staff);
    expect(c.assigned).toBe(3);
    expect(c.completed).toBe(1);
    expect(c.outstanding).toBe(2);
    expect(c.rows.find((r) => r.staffId === 's3')).toMatchObject({ assignmentId: null, completedAt: null });
  });

  it('with nobody on the register the share is null, not zero', () => {
    expect(completionFor('v1', [], []).share).toBeNull();
  });

  it("a person's outstanding list is the active versions they have not completed", () => {
    const docs = [
      doc({ id: 'v1', version: 1, publishedAt: '2026-09-15T10:00:00.000Z', archivedAt: '2026-10-01T09:00:00.000Z' }),
      doc({ id: 'v2', version: 2, publishedAt: '2026-10-01T09:00:00.000Z' }),
    ];
    const assignments = [assign('v1', 's1'), assign('v2', 's1')];
    // The archived version is not chased, only what is in force.
    expect(outstandingFor('s1', docs, assignments).map((d) => d.id)).toEqual(['v2']);
    expect(outstandingFor('s1', docs, [assign('v2', 's1', '2026-10-02T08:00:00.000Z')])).toEqual([]);
  });
});

describe('training documents — what publishing does', () => {
  const staff = ['s1', 's2', 's3'];
  const published = doc({ id: 'v1', version: 1, publishedAt: '2026-09-15T10:00:00.000Z' });
  const assignments = [
    assign('v1', 's1', '2026-09-16T08:00:00.000Z'),
    assign('v1', 's2', '2026-09-17T08:00:00.000Z'),
    assign('v1', 's3'),
  ];

  it('the first version goes to everyone', () => {
    const plan = planPublish('facility-operations', [], [], staff, true);
    expect(plan.archives).toBeNull();
    expect(plan.version).toBe(1);
    expect(plan.assignTo).toEqual(staff);
    expect(plan.reason).toContain('First version');
  });

  it('everyone re-completes by default, including those who had read the last one', () => {
    const plan = planPublish('facility-operations', [published], assignments, staff, true);
    expect(plan.archives?.id).toBe('v1');
    expect(plan.version).toBe(2);
    expect(plan.assignTo).toEqual(staff);
    expect(plan.reason).toContain('must be read again');
  });

  it('with re-completion off, a completed reader is not asked again but an outstanding one still is', () => {
    const plan = planPublish('facility-operations', [published], assignments, staff, false);
    expect(plan.assignTo).toEqual(['s3']);
    expect(plan.reason).toContain('2 who completed v1');
  });

  it('a new hire who joined after the last version still gets the new one either way', () => {
    const withNewHire = [...staff, 's4'];
    expect(planPublish('facility-operations', [published], assignments, withNewHire, false).assignTo).toContain('s4');
    expect(planPublish('facility-operations', [published], assignments, withNewHire, true).assignTo).toContain('s4');
  });
});

describe('training documents — the report never says the opposite of the facts', () => {
  it('an empty register reads as an empty register, never as "everyone is current"', () => {
    const c = completionFor('v1', [], []);
    expect(c.assigned).toBe(0);
    expect(c.outstanding).toBe(0); // the trap: zero outstanding because zero assigned
    const line = completionHeadline(c);
    expect(line).toContain('Nobody is on the register yet');
    expect(line).toContain('no one has completed it');
    expect(line).not.toMatch(/current|complete\b(?!d)/i);
  });

  it('assigned but unread says so plainly', () => {
    const c = completionFor('v1', [assign('v1', 's1'), assign('v1', 's2')], ['s1', 's2']);
    expect(completionHeadline(c)).toBe('Assigned to all 2. No one has completed it yet.');
  });

  it('only a genuinely finished document reads as finished', () => {
    const done = completionFor('v1', [assign('v1', 's1', '2026-09-16T08:00:00.000Z')], ['s1']);
    expect(completionHeadline(done)).toBe('All 1 have completed it.');
    const part = completionFor('v1', [assign('v1', 's1', '2026-09-16T08:00:00.000Z'), assign('v1', 's2')], ['s1', 's2']);
    expect(completionHeadline(part)).toBe('1 of 2 have completed it; 1 outstanding.');
  });
});
