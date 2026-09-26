'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { SOURCE_KINDS, MAX_UPLOAD_BYTES } from '@/engine/sources';

/** Super-admin upload form. Posts multipart to the upload route. */
export function SourceUpload() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    const file = data.get('file');
    if (file instanceof File && file.size > MAX_UPLOAD_BYTES) {
      setMsg({ kind: 'err', text: `That file is ${(file.size / 1048576).toFixed(1)} MB; in-app uploads are limited to ${MAX_UPLOAD_BYTES / 1048576} MB. Larger documents load with pnpm farm:sources.` });
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch('/farm/sources/upload', { method: 'POST', body: data });
      const json = (await res.json()) as { ok: boolean; id?: string; error?: string; duplicate?: boolean };
      if (json.ok && json.id) {
        setMsg({ kind: 'ok', text: json.duplicate ? 'That document is already registered; opening it.' : 'Registered.' });
        form.reset();
        router.push(`/farm/sources/${json.id}`);
        router.refresh();
      } else {
        setMsg({ kind: 'err', text: json.error ?? 'Upload failed.' });
      }
    } catch {
      setMsg({ kind: 'err', text: 'Upload failed.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="farm-card mt-4" encType="multipart/form-data">
      <div className="farm-card-title">Register a document</div>
      <div className="grid gap-3 farm-autofit-14">
        <label className="farm-field">
          <span className="farm-kpi-label">File</span>
          <input type="file" name="file" required accept=".pdf,.xlsx,.docx,.csv,.txt,.md" />
        </label>
        <label className="farm-field">
          <span className="farm-kpi-label">Title</span>
          <input name="title" required maxLength={300} className="farm-input" />
        </label>
        <label className="farm-field">
          <span className="farm-kpi-label">Kind</span>
          <select name="kind" className="farm-input" defaultValue="study">
            {SOURCE_KINDS.map((k) => (
              <option key={k.kind} value={k.kind}>{k.label}</option>
            ))}
          </select>
        </label>
        <label className="farm-field">
          <span className="farm-kpi-label">Authors</span>
          <input name="authors" maxLength={300} className="farm-input" />
        </label>
        <label className="farm-field">
          <span className="farm-kpi-label">Publisher</span>
          <input name="publisher" maxLength={200} className="farm-input" />
        </label>
        <label className="farm-field">
          <span className="farm-kpi-label">Year</span>
          <input name="year" type="number" min={1900} max={2100} className="farm-input" />
        </label>
        <label className="farm-field">
          <span className="farm-kpi-label">Citation</span>
          <input name="citation" maxLength={500} className="farm-input" />
        </label>
        <label className="farm-field">
          <span className="farm-kpi-label">URL or DOI</span>
          <input name="sourceUrl" type="url" maxLength={500} className="farm-input" />
        </label>
        <label className="farm-field">
          <span className="farm-kpi-label">Licence note</span>
          <input name="licenceNote" maxLength={500} className="farm-input" />
        </label>
        <label className="farm-field col-span-full!">
          <span className="farm-kpi-label">Notes</span>
          <textarea name="notes" maxLength={2000} rows={2} className="farm-input" />
        </label>
      </div>
      <div className="flex items-center gap-3 mt-3! flex-wrap">
        <button type="submit" className="farm-btn" disabled={busy}>{busy ? 'Uploading…' : 'Register'}</button>
        <span className="farm-kpi-sub">PDF, XLSX, DOCX, CSV, TXT or MD up to {MAX_UPLOAD_BYTES / 1048576} MB. Larger documents load from the research folder with pnpm farm:sources.</span>
        {msg ? <span className={`farm-kpi-sub ${(msg.kind === 'ok' ? 'farm-c-sourced' : 'farm-c-over')}`}>{msg.text}</span> : null}
      </div>
    </form>
  );
}
