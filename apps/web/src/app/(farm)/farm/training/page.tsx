import Link from 'next/link';
import { PageHeader, Card, Kpi, PreviewBanner, num } from '../_components/ui';
import { RecordedLinkList } from '../_components/RecordedLinks';
import { trainingCourses } from '../_data/seed-invented';
import { roster } from '../_data/plan-data';
import { getFarmAccess } from '../_lib/access';
import { TrainingDocs } from '../_components/TrainingDocs';
import { listTrainingDocs, listTrainingAssignments, listActiveStaff, syncOrientationAssignments } from '../_lib/training';
import { activeVersions } from '../_engine/training';
import { formatBytes } from '../_engine/sources';
import { linksFrom, manyPerFrom } from '../_lib/entity-links';
import { hydrateEntityRefs } from '../_lib/entity-directory';
import { entityRef, type LeanEntity } from '../_engine/entity-links';
import { withWorkspace } from '@/app/(farm)/farm/_lib/workspace';

export const dynamic = 'force-dynamic';

export default async function TrainingPage() {
  return withWorkspace(() => TrainingPageInner());
}

async function TrainingPageInner() {
  const access = await getFarmAccess();
  // Assignment follows the register: joining it IS the assignment, so a new
  // hire's orientation list exists without anyone remembering to create it.
  await syncOrientationAssignments();
  const [trainingDocs, trainingAssignments, staff] = await Promise.all([
    listTrainingDocs(),
    listTrainingAssignments(),
    listActiveStaff(),
  ]);
  const activeTrainingDocs = activeVersions(trainingDocs);
  const totalLessons = trainingCourses.reduce((s, c) => s + c.lessons, 0);
  const roles = roster.map((r) => r.title);

  // An assignment is a fact of record: this role takes this course, and holds
  // this certificate. Neither changes with a forecast, so both are rows rather
  // than scenario edits.
  const edges = await linksFrom('role', roles);
  const assigned = manyPerFrom(edges, 'assigned');
  const certificates = manyPerFrom(edges, 'certificate');
  const byRef = await hydrateEntityRefs(edges.map((e) => entityRef(e.toKind as never, e.toId)));
  const resolve = (list: typeof edges | undefined): LeanEntity[] =>
    (list ?? []).flatMap((e) => {
      const found = byRef[entityRef(e.toKind as never, e.toId)];
      return found ? [found] : [];
    });

  const rolesWithCourse = roles.filter((r) => (assigned[r] ?? []).length > 0).length;
  const rolesWithCert = roles.filter((r) => (certificates[r] ?? []).length > 0).length;
  const headcount = roster.reduce((s, r) => s + r.headcount, 0);

  // The reverse view: which roles each course is assigned to.
  const rolesByCourse = new Map<string, string[]>();
  for (const e of edges) {
    if (e.relation !== 'assigned' || e.toKind !== 'course') continue;
    const list = rolesByCourse.get(e.toId) ?? [];
    list.push(e.fromId);
    rolesByCourse.set(e.toId, list);
  }

  return (
    <>
      <PageHeader
        title="Training"
        purpose="Track who has read each training document, and the certificates each role holds."
        functions={['Documents in force', 'Yours to read', 'Training documents', 'Course catalog', 'Roster']}
        howItWorks={
          <ul>
            <li>Every person on the register reads the documents in force, and a read is recorded against the version.</li>
            <li>A replaced document keeps each version on file, timestamped in and out of active status.</li>
            <li>A new hire completes the versions in force during orientation.</li>
            <li>The course catalog and the certificates on file per role sit below the documents.</li>
          </ul>
        }
        status="partial"
      />

      <TrainingDocs
        docs={trainingDocs}
        assignments={trainingAssignments}
        staff={staff}
        myStaffId={access.staffId ?? null}
        isSuperAdmin={access.isSuperAdmin}
      />

      <PreviewBanner>
        Training DOCUMENTS below are real records — versioned, assigned and acknowledged. The course
        model, fixed-sequence distribution and assessment are still in layout, and the course catalog is
        illustrative; role assignments and certificates are real records.
      </PreviewBanner>

      <div className="grid gap-3 mt-4 farm-autofit-11">
        <Kpi value={trainingCourses.length} label="Courses (placeholder)" sub={`${num(totalLessons)} lessons across courses · the ${num(activeTrainingDocs.length)} document${activeTrainingDocs.length === 1 ? '' : 's'} in force are real`} />
        <Kpi value={`${rolesWithCourse} / ${roles.length}`} label="Roles with a course assigned" sub={`${num(headcount)} people across the roster`} />
        <Kpi value={`${rolesWithCert} / ${roles.length}`} label="Roles with a certificate on file" sub="Documents in the registry" />
        <Kpi value="Fixed sequence" label="Distribution model" sub="Video/audio + assessment" />
      </div>

      <Card title="Roster — courses assigned and certificates on file" className="mt-4">
        <div className="farm-scroll-x">
          <table className="farm-table">
            <thead>
              <tr>
                <th>Role</th><th className="num">Headcount</th><th>Shift</th>
                <th>Courses assigned</th><th>Certificates on file</th>
              </tr>
            </thead>
            <tbody>
              {roster.map((r) => (
                <tr key={r.title}>
                  <td className="font-medium!">{r.title}</td>
                  <td className="num">{r.headcount}</td>
                  <td className="farm-c-soft farm-fs-sm">{r.shift}</td>
                  <td>
                    <RecordedLinkList
                      edge={{ fromKind: 'role', fromId: r.title, toKind: 'course', relation: 'assigned' }}
                      linked={resolve(assigned[r.title])}
                      canEdit={access.isSuperAdmin}
                      addLabel="Assign a course"
                      ariaLabel={`Assign a course to ${r.title}`}
                      placeholder="Search course title, format, audience…"
                      emptyText="None assigned"
                    />
                  </td>
                  <td>
                    <RecordedLinkList
                      edge={{ fromKind: 'role', fromId: r.title, toKind: 'source', relation: 'certificate' }}
                      linked={resolve(certificates[r.title])}
                      canEdit={access.isSuperAdmin}
                      addLabel="Link a certificate"
                      ariaLabel={`Link a certificate document for ${r.title}`}
                      placeholder="Search title, publisher, kind…"
                      emptyText="None on file"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="farm-kpi-sub mt-2">
          Roles are the plan&apos;s position titles, placeholders until Staffing&apos;s roster is connected
          (<Link className="farm-link" href="/farm/staffing">HR</Link>) — no real person appears. A certificate is a document registered on{' '}
          <Link className="farm-link" href="/farm/sources">Sources</Link>, the same registry the factors
          and invoices resolve to. Assignments are facts of record, held outside any scenario.
        </p>
      </Card>

      <Card title="Course catalog" className="mt-4">
        <div className="farm-scroll-x">
          <table className="farm-table">
            <thead>
              <tr><th>Course</th><th className="num">Lessons</th><th>Format</th><th>Audience</th><th>Assigned to</th></tr>
            </thead>
            <tbody>
              {/* The documents in force are real entries, listed first and marked
                  as such. Everything below them is the illustrative catalog. */}
              {activeTrainingDocs.map((d) => (
                <tr key={d.id}>
                  <td className="font-medium!">
                    <a className="farm-link" href={`/farm/training/${d.id}/file`} target="_blank" rel="noreferrer">{d.title}</a>
                    <div className="farm-kpi-sub farm-fs-2xs">
                      Training document · v{d.version} · in force since {(d.publishedAt ?? '').slice(0, 10)}
                    </div>
                  </td>
                  <td className="num farm-c-faint">—</td>
                  <td className="farm-c-soft">Document ({d.fileMime === 'application/pdf' ? 'PDF' : d.fileMime}, {formatBytes(d.fileSize)})</td>
                  <td className="farm-c-soft">{d.requiredAtOrientation ? 'All staff, at orientation' : 'All staff'}</td>
                  <td className="farm-fs-xs">
                    Everyone on the staff register
                    <div className="farm-kpi-sub farm-fs-2xs">
                      {staff.length === 0
                        ? 'nobody on the register yet, so no one has completed it'
                        : `${num(trainingAssignments.filter((a) => a.docId === d.id && a.completedAt).length)} of ${num(staff.length)} have completed it`}
                    </div>
                  </td>
                </tr>
              ))}
              {trainingCourses.map((c) => {
                const takers = rolesByCourse.get(c.id) ?? [];
                return (
                  <tr key={c.id}>
                    <td className="font-medium!">
                      {c.title}
                      <div className="farm-kpi-sub farm-fs-2xs">Placeholder course</div>
                    </td>
                    <td className="num">{c.lessons}</td>
                    <td className="farm-c-soft">{c.format}</td>
                    <td className="farm-c-soft">{c.audience}</td>
                    <td className="farm-fs-xs farm-c-soft">
                      {takers.length === 0
                        ? <span className="farm-c-faint">no role assigned</span>
                        : takers.join(' · ')}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="farm-kpi-sub mt-2">
          The training documents at the top are real: in force, assigned to everyone on the staff
          register, and acknowledged person by person above. The courses below them are placeholders
          for the sequenced video model, which is still a port — the control-point-2 two-stage cooling course
          maps directly onto the control-point-2 control on{' '}
          <Link className="farm-link" href="/farm/produce-safety">Produce Safety</Link>. For a placeholder
          course, Audience is the catalog&apos;s own description and Assigned-to is what has actually
          been recorded against a role.
        </p>
      </Card>
    </>
  );
}
