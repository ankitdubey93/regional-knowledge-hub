import { useEffect, useState, type ChangeEvent } from 'react';
import { useParams } from 'react-router-dom';
import { Button, Callout, Card, Field, PageHeader, TableScroll, TextLink } from '../../components/ui';
import { ApiError, apiJson } from '../../lib/api';
import type { ClientRecord } from '../../lib/entity';
import { DOCUMENT_ACCEPT, deleteDocument, documentFileUrl, formatBytes, listDocuments, uploadDocument, type DocumentView } from '../../lib/documents';

type LoadState =
  | { status: 'loading' }
  | { status: 'missing' }
  | { status: 'error'; message: string }
  | { status: 'ready'; client: ClientRecord };

const KIND_LABELS: Record<DocumentView['kind'], string> = {
  pdf: 'PDF',
  docx: 'Word',
  xlsx: 'Excel',
  csv: 'CSV',
  text: 'Text',
  markdown: 'Markdown',
};

const PRIVACY_NOTE =
  "Before a document reaches the AI, emails, phone numbers, bank, tax and NI numbers and your clients' names are replaced. Other people's names (staff, directors) are not caught. Documents are context only: answers never cite them.";

const linkClass = 'font-medium text-accent underline underline-offset-2 hover:text-accent-hover';

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

export function EntityDocuments() {
  const { id = '' } = useParams();
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [docs, setDocs] = useState<DocumentView[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    apiJson<{ client: ClientRecord }>(`/clients/${id}`)
      .then(async (body) => {
        const list = await listDocuments(id);
        if (cancelled) return;
        setDocs(list);
        setState({ status: 'ready', client: body.client });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 404) {
          setState({ status: 'missing' });
        } else {
          setState({ status: 'error', message: errorMessage(err, 'Could not load the client') });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  async function refresh() {
    try {
      setDocs(await listDocuments(id));
    } catch (err) {
      setError(errorMessage(err, 'Could not reload the documents'));
    }
  }

  async function onPick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      await uploadDocument(id, file);
      await refresh();
    } catch (err) {
      setError(errorMessage(err, 'Could not upload the document'));
    } finally {
      setUploading(false);
    }
  }

  async function onDelete(doc: DocumentView) {
    if (!window.confirm('Delete this document? It will be removed from every chat it is attached to.')) return;
    try {
      await deleteDocument(id, doc.id);
      await refresh();
    } catch (err) {
      setError(errorMessage(err, 'Could not delete the document'));
    }
  }

  if (state.status === 'loading') {
    return (
      <div className="space-y-6">
        <TextLink to="/workspace">Back to workspace</TextLink>
        <p className="text-muted">Loading…</p>
      </div>
    );
  }
  if (state.status === 'missing') {
    return (
      <div className="space-y-6">
        <TextLink to="/workspace">Back to workspace</TextLink>
        <p>Client not found.</p>
      </div>
    );
  }
  if (state.status === 'error') {
    return (
      <div className="space-y-6">
        <TextLink to="/workspace">Back to workspace</TextLink>
        <p role="alert" className="text-sm text-bad">
          {state.message}
        </p>
      </div>
    );
  }

  const c = state.client;
  return (
    <div className="space-y-6">
      <TextLink to={`/entities/${c.id}`}>{`Back to ${c.name}`}</TextLink>
      <PageHeader title="Documents" lead={`Files for ${c.name}. Attach them to a chat on the entity's dashboard.`} />

      <Callout tone="warn">{PRIVACY_NOTE}</Callout>

      <Card>
        <Field label="Upload a document" hint="PDF, Word (.docx), Excel (.xlsx), CSV, text or Markdown, up to 20 MB">
          <input
            type="file"
            accept={DOCUMENT_ACCEPT}
            disabled={uploading}
            onChange={(e) => void onPick(e)}
            className="mt-2 block w-full text-sm text-ink file:mr-3 file:min-h-10 file:rounded-lg file:border file:border-line file:bg-panel-2 file:px-4 file:py-2"
          />
        </Field>
        {uploading && (
          <p role="status" className="mt-3 text-sm text-muted">
            Uploading…
          </p>
        )}
      </Card>

      {error !== null && <Callout tone="bad">{error}</Callout>}

      <Card>
        <h2 className="font-semibold">Library</h2>
        {docs.length === 0 ? (
          <p className="mt-3 text-sm text-muted">No documents yet.</p>
        ) : (
          <TableScroll>
            <table className="mt-3 w-full text-left text-sm">
              <thead>
                <tr>
                  <th scope="col" className="border-b border-line px-2 py-1 font-medium">Name</th>
                  <th scope="col" className="border-b border-line px-2 py-1 font-medium">Type</th>
                  <th scope="col" className="border-b border-line px-2 py-1 font-medium">Size</th>
                  <th scope="col" className="border-b border-line px-2 py-1 font-medium">Uploaded</th>
                  <th scope="col" className="relative border-b border-line px-2 py-1 font-medium">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {docs.map((d) => (
                  <tr key={d.id}>
                    <td className="border-b border-line px-2 py-1">
                      {d.originalName}
                      {d.fromClientLink && <span className="block text-xs text-muted">From the client's upload link</span>}
                      {d.supersedesId !== null && <span className="block text-xs text-muted">Replaces an earlier upload</span>}
                      {d.truncated && ' (only the first part is used)'}
                    </td>
                    <td className="border-b border-line px-2 py-1">{KIND_LABELS[d.kind]}</td>
                    <td className="border-b border-line px-2 py-1">{formatBytes(d.byteSize)}</td>
                    <td className="border-b border-line px-2 py-1">{new Date(d.createdAt).toLocaleDateString()}</td>
                    <td className="border-b border-line px-2 py-1">
                      <div className="flex flex-wrap items-center gap-3">
                        <a href={documentFileUrl(c.id, d.id)} download aria-label={`Download ${d.originalName}`} className={linkClass}>
                          Download
                        </a>
                        <Button variant="secondary" aria-label={`Delete ${d.originalName}`} onClick={() => void onDelete(d)}>
                          Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        )}
      </Card>
    </div>
  );
}
