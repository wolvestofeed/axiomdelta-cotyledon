'use client';

import { useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, Kpi, Notice, num } from '@/components/ui';
import {
  activeVersions,
  completionFor,
  completionHeadline,
  docState,
  outstandingFor,
  versionsOf,
  TRAINING_STATE_LABELS,
  type TrainingAssignmentDoc,
  type TrainingDocDoc,
} from '@/engine/training';
import { formatBytes } from '@/engine/sources';
import {
  archiveTrainingDoc,
  completeTraining,
  deleteTrainingDraft,
  publishTrainingDoc,
  setDraftRecompletion,
} from '@/server/training-actions';

/**
 * Training documents: what is in force, who has read it, and every version that
 * came before with the moment it went in and out of active status.
 *
 * An operator sees what they still have to read and records that they have read
 * it. A super admin sees the whole register, uploads a revision and publishes it.
 */

interface Staff {
  id: string;
  name: string;
  role: string | null;
  startedOn: string | null;
}

type Msg = { kind: 'ok' | 'err'; text: string } | null;

const when = (iso: string | null): string => (iso ? iso.slice(0, 16).replace('T', ' ') : '—');

export function TrainingDocs({
  docs,
  assignments,
  staff,
  myStaffId,
  isSuperAdmin,
}: {
  docs: TrainingDocDoc[];
  assignments: TrainingAssignmentDoc[];
  staff: Staff[];
  myStaffId: string | null;
  isSuperAdmin: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<Msg>(null);
  const [openHistory, setOpenHistory] = useState<string | null>(null);

  const staffIds = useMemo(() => staff.map((s) => s.id), [staff]);
  const byStaff = useMemo(() => new Map(staff.map((s) => [s.id, s])), [staff]);
  const active = useMemo(() => activeVersions(docs), [docs]);
  const drafts = useMemo(() => docs.filter((d) => docState(d) === 'draft'), [docs]);
  const families = useMemo(() => [...new Set(docs.map((d) => d.docKey))], [docs]);
  const mine = useMemo(
    () => (myStaffId ? outstandingFor(myStaffId, docs, assignments) : []),
    [myStaffId, docs, assignments],
  );

  function run(fn: () => Promise<{ ok: true } | { ok: false; error: string }>, okText: string) {
    start(async () => {
      const res = await fn();
      if (res.ok) {
        setMsg({ kind: 'ok', text: okText });
        router.refresh();
      } else setMsg({ kind: 'err', text: res.error });
    });
  }

  // Completion across every document in force. With nobody on the register
  // these are all zero, which must never be reported as "everyone is current".
  const totals = active.reduce(
    (acc, d) => {
      const c = completionFor(d.id, assignments, staffIds);
      return { assigned: acc.assigned + c.assigned, completed: acc.completed + c.completed, outstanding: acc.outstanding + c.outstanding };
    },
    { assigned: 0, completed: 0, outstanding: 0 },
  );
  const registerEmpty = staff.length === 0;

  return (
    <>
      {msg && <div className={`farm-scenariobar-msg ${msg.kind} mt-4`} role="status">{msg.text}</div>}

      {active.length > 0 && registerEmpty ? (
        <Notice title="Assigned to everyone — and there is no one on the register yet">
          {active.length === 1 ? 'The document below is' : 'The documents below are'} in force and assigned to
          every active person on the staff register. The register is empty, so nobody holds it and no one
          has completed it. Add people on <Link className="farm-link" href="/farm/staffing">HR</Link> and it
          assigns itself to each of them — assignment follows the register, so there is nothing to
          assign by hand.
        </Notice>
      ) : null}

      <div className="grid gap-3 mt-4 farm-autofit-11">
        <Kpi value={num(active.length)} label="Documents in force" sub={`${num(docs.length)} version${docs.length === 1 ? '' : 's'} on file, none overwritten`} />
        <Kpi
          value={active.length > 0 ? 'Everyone' : '—'}
          label="Assigned to"
          sub={registerEmpty ? 'Every active person on the register — nobody is on it yet' : `Every active person on the register · ${num(staff.length)} today`}
        />
        <Kpi
          value={totals.completed === 0 ? 'No one' : `${num(totals.completed)} / ${num(totals.assigned)}`}
          label="Have completed it"
          sub={
            active.length === 0
              ? 'Nothing is in force'
              : totals.completed === 0
                ? registerEmpty
                  ? 'No one has completed it — nobody is on the register'
                  : `No one has completed it — ${num(totals.outstanding)} outstanding`
                : `${num(totals.outstanding)} still to read`
          }
        />
        <Kpi value={myStaffId ? num(mine.length) : '—'} label="Outstanding for you" sub={myStaffId ? 'Your own orientation list' : 'Your sign-in is not matched to a staff record'} />
      </div>

      {mine.length > 0 && (
        <Card title="Yours to read" className="mt-4">
          <table className="farm-table">
            <tbody>
              {mine.map((d) => (
                <tr key={d.id}>
                  <td>
                    <span className="font-medium">{d.title}</span>{' '}
                    <span className="farm-kpi-sub">v{d.version} · in force since {when(d.publishedAt)}</span>
                  </td>
                  <td className="num whitespace-nowrap!">
                    <a className="farm-link" href={`/farm/training/${d.id}/file`} target="_blank" rel="noreferrer">
                      Open the document
                    </a>{' '}
                    <button
                      type="button"
                      className="farm-btn primary farm-fs-xs"
                      disabled={pending}
                      onClick={() => run(() => completeTraining({ docId: d.id }), `Recorded: you have read ${d.title} v${d.version}.`)}
                    >
                      I have read this
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="farm-kpi-sub mt-2">
            Recording this is your own act and no one can record it for you. It is stamped against the
            version above, so it stays true when a later version publishes.
          </p>
        </Card>
      )}

      {active.length === 0 && drafts.length === 0 ? (
        <Card title="Training documents" className="mt-4">
          <p className="farm-kpi-sub mt-0!">
            Nothing on file yet. {isSuperAdmin ? 'Upload a document below; it lands as a draft and takes effect when published.' : 'An admin publishes the documents orientation requires.'}
          </p>
        </Card>
      ) : null}

      {active.map((d) => {
        const c = completionFor(d.id, assignments, staffIds);
        const history = versionsOf(docs, d.docKey);
        return (
          <Card key={d.id} title={d.title} className="mt-4">
            <div className="farm-kpi-sub mt-0!">
              Version {d.version} · in force since {when(d.publishedAt)} · {d.fileName} ({formatBytes(d.fileSize)})
              {d.requiredAtOrientation ? ' · required at orientation' : ''}
            </div>
            {d.summary ? <p className="farm-fs-base mt-2!">{d.summary}</p> : null}

            <div className="flex gap-[0.6rem] items-center flex-wrap my-[0.7rem]! mx-0!">
              <a className="farm-btn" href={`/farm/training/${d.id}/file`} target="_blank" rel="noreferrer">Open the document</a>
              <span className="farm-kpi-sub">{completionHeadline(c)}</span>
              <button type="button" className="farm-btn farm-fs-xs" onClick={() => setOpenHistory(openHistory === d.docKey ? null : d.docKey)}>
                {history.length} version{history.length === 1 ? '' : 's'} on file
              </button>
              {isSuperAdmin ? (
                <button
                  type="button"
                  className="farm-btn farm-fs-xs"
                  disabled={pending}
                  onClick={() => run(() => archiveTrainingDoc({ docKey: d.docKey }), `${d.title} archived. Nothing is in force for it now.`)}
                >
                  Archive without replacing
                </button>
              ) : null}
            </div>

            {isSuperAdmin ? (
              <div className="farm-scroll-x">
                <table className="farm-table">
                  <thead><tr><th>Person</th><th>Role</th><th>Assigned</th><th>Read</th></tr></thead>
                  <tbody>
                    {c.rows.map((r) => {
                      const p = byStaff.get(r.staffId);
                      return (
                        <tr key={r.staffId} className={`${r.completedAt ? '' : 'farm-c-soft'}`}>
                          <td className="font-medium!">{p?.name ?? r.staffId}</td>
                          <td className="farm-c-soft">{p?.role ?? '—'}</td>
                          <td className="farm-mono farm-fs-xs">{when(r.assignedAt)}</td>
                          <td className="farm-mono farm-fs-xs">
                            {r.completedAt ? when(r.completedAt) : <span className="farm-pill">outstanding</span>}
                          </td>
                        </tr>
                      );
                    })}
                    {c.rows.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="farm-kpi-sub">
                          Nobody is on the active staff register. This document is assigned to everyone on
                          it, so the moment a person is added on <Link className="farm-link" href="/farm/staffing">HR</Link> they
                          hold it and appear here as outstanding.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            ) : null}

            {openHistory === d.docKey ? (
              <div className="farm-scroll-x mt-[0.8rem]!">
                <table className="farm-table">
                  <thead><tr><th>Version</th><th>Status</th><th>In force from</th><th>Archived</th><th>Replaced by</th><th>On publish</th></tr></thead>
                  <tbody>
                    {history.map((v) => (
                      <tr key={v.id}>
                        <td>
                          <a className="farm-link" href={`/farm/training/${v.id}/file`} target="_blank" rel="noreferrer">v{v.version}</a>
                        </td>
                        <td>{TRAINING_STATE_LABELS[docState(v)]}</td>
                        <td className="farm-mono farm-fs-xs">{when(v.publishedAt)}</td>
                        <td className="farm-mono farm-fs-xs">{when(v.archivedAt)}</td>
                        <td className="farm-c-soft">
                          {v.supersededBy ? `v${docs.find((x) => x.id === v.supersededBy)?.version ?? '—'}` : '—'}
                        </td>
                        <td className="farm-c-soft farm-fs-xs">
                          {v.requiresRecompletion ? 'everyone re-completed' : 'completions carried forward'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="farm-kpi-sub mt-2">
                  Every version stays on file and readable. A version is archived at the same instant
                  its replacement takes effect, so the record shows no gap and never two in force.
                </p>
              </div>
            ) : null}
          </Card>
        );
      })}

      {isSuperAdmin && drafts.length > 0 ? (
        <Card title="Drafts — uploaded, not yet in force" className="mt-4">
          <table className="farm-table">
            <thead><tr><th>Document</th><th>Version</th><th>On publish</th><th /></tr></thead>
            <tbody>
              {drafts.map((d) => (
                <tr key={d.id}>
                  <td>
                    <span className="font-medium">{d.title}</span>
                    <div className="farm-kpi-sub farm-fs-2xs">{d.fileName} ({formatBytes(d.fileSize)})</div>
                  </td>
                  <td>v{d.version}</td>
                  <td>
                    <label className="inline-flex! items-center! gap-[0.35rem]! farm-fs-xs">
                      <input
                        type="checkbox"
                        checked={d.requiresRecompletion}
                        disabled={pending}
                        onChange={(e) =>
                          run(
                            () => setDraftRecompletion({ id: d.id, requiresRecompletion: e.target.checked }),
                            e.target.checked ? 'Everyone will re-complete this version.' : 'Completions of the previous version will carry forward.',
                          )
                        }
                      />
                      Everyone re-completes
                    </label>
                  </td>
                  <td className="num whitespace-nowrap!">
                    <a className="farm-link" href={`/farm/training/${d.id}/file`} target="_blank" rel="noreferrer">Open</a>{' '}
                    <button
                      type="button"
                      className="farm-btn primary farm-fs-xs"
                      disabled={pending}
                      onClick={() =>
                        start(async () => {
                          const res = await publishTrainingDoc({ id: d.id });
                          if (res.ok) {
                            setMsg({ kind: 'ok', text: `${d.title} v${d.version} is in force. ${res.reason}` });
                            router.refresh();
                          } else setMsg({ kind: 'err', text: res.error });
                        })
                      }
                    >
                      Publish
                    </button>{' '}
                    <button
                      type="button"
                      className="farm-btn farm-fs-xs"
                      disabled={pending}
                      onClick={() => run(() => deleteTrainingDraft({ id: d.id }), 'Draft discarded.')}
                    >
                      Discard
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="farm-kpi-sub mt-2">
            Publishing archives the version it replaces at that instant and assigns the new one.
            &ldquo;Everyone re-completes&rdquo; is on by default: a revision carries technical content.
            Turn it off and the people who completed the previous version are not asked again — either
            way the choice is recorded on the version.
          </p>
        </Card>
      ) : null}

      {isSuperAdmin ? <UploadPanel families={families} docs={docs} /> : null}
    </>
  );
}

function UploadPanel({ families, docs }: { families: string[]; docs: TrainingDocDoc[] }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const [title, setTitle] = useState('');
  const [docKey, setDocKey] = useState('');
  const [summary, setSummary] = useState('');
  const [requiresRecompletion, setRequiresRecompletion] = useState(true);

  const titleFor = (key: string) => docs.find((d) => d.docKey === key)?.title ?? key;

  async function submit() {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setMsg({ kind: 'err', text: 'Choose a file.' });
      return;
    }
    const effectiveTitle = title.trim() || (docKey ? titleFor(docKey) : '');
    if (!effectiveTitle) {
      setMsg({ kind: 'err', text: 'Give the document a title.' });
      return;
    }
    setBusy(true);
    try {
      const body = new FormData();
      body.set('file', file);
      body.set('title', effectiveTitle);
      if (docKey) body.set('docKey', docKey);
      if (summary.trim()) body.set('summary', summary.trim());
      body.set('requiresRecompletion', String(requiresRecompletion));
      const res = await fetch('/farm/training/upload', { method: 'POST', body });
      const json = (await res.json()) as { ok: boolean; error?: string; version?: number };
      if (json.ok) {
        setMsg({ kind: 'ok', text: `Uploaded as v${json.version}, held as a draft until you publish it.` });
        setTitle('');
        setSummary('');
        if (fileRef.current) fileRef.current.value = '';
        router.refresh();
      } else setMsg({ kind: 'err', text: json.error ?? 'Upload failed.' });
    } catch {
      setMsg({ kind: 'err', text: 'Upload failed.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Upload a training document" className="mt-4">
      <div className="flex gap-4 flex-wrap items-start">
        <div className="flex-[1_1_20rem] min-w-72">
          <label className="farm-kpi-label" htmlFor="training-file">The file</label>
          <input id="training-file" ref={fileRef} type="file" accept=".pdf,.docx,.xlsx,.csv,.txt,.md" className="block! mt-[0.35rem]! farm-fs-sm" />
          <span className="farm-kpi-sub">PDF, DOCX, XLSX, CSV, TXT or MD, up to 4 MB.</span>
        </div>
        <div className="flex-[1_1_18rem] min-w-64">
          <label className="farm-kpi-label" htmlFor="training-key">A new document, or a revision of one on file</label>
          <select id="training-key" className="farm-input block! mt-[0.3rem]! w-full!" value={docKey} onChange={(e) => setDocKey(e.target.value)}>
            <option value="">A new document</option>
            {families.map((k) => <option key={k} value={k}>Revision of: {titleFor(k)}</option>)}
          </select>
        </div>
      </div>

      <div className="flex gap-4 flex-wrap mt-[0.8rem]!">
        <div className="flex-[1_1_20rem] min-w-72">
          <label className="farm-kpi-label" htmlFor="training-title">Title</label>
          <input id="training-title" className="farm-input block! mt-[0.3rem]! w-full!" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={docKey ? titleFor(docKey) : 'Facility Farm Operations & Culinary Foundations'} />
        </div>
        <div className="flex-[1_1_20rem] min-w-72">
          <label className="farm-kpi-label" htmlFor="training-summary">What changed, or what it covers</label>
          <input id="training-summary" className="farm-input block! mt-[0.3rem]! w-full!" value={summary} onChange={(e) => setSummary(e.target.value)} />
        </div>
      </div>

      <label className="inline-flex! items-center! gap-[0.4rem]! farm-fs-sm mt-[0.8rem]!">
        <input type="checkbox" checked={requiresRecompletion} onChange={(e) => setRequiresRecompletion(e.target.checked)} />
        On publish, everyone re-completes it
      </label>

      <div className="flex gap-[0.6rem] items-center mt-[0.8rem]! flex-wrap">
        <button type="button" className="farm-btn primary" disabled={busy} onClick={submit}>
          {busy ? 'Uploading…' : 'Upload as a draft'}
        </button>
        {msg ? <span className={`farm-kpi-sub ${(msg.kind === 'ok' ? 'farm-c-sourced' : 'farm-c-over')}`}>{msg.text}</span> : null}
      </div>
      <p className="farm-kpi-sub mt-2">
        An upload never takes effect on its own. It is held as a draft until published, because
        publishing archives the version it replaces and can ask the whole crew to read it again.
      </p>
    </Card>
  );
}
