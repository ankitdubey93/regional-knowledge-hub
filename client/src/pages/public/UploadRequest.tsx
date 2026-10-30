import { useEffect, useState, type ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { formatDay } from '@chub/shared/utils/deadlines';
import { Button, Callout, Card, PageHeader } from '../../components/ui';
import { ApiError } from '../../lib/api';
import { DOCUMENT_ACCEPT } from '../../lib/documents';
import { getPublicRequest, uploadToRequest, type PublicItem, type PublicRequest } from '../../lib/requestLinks';

// The public upload page for a client's request link (C3). No account, no entity data beyond the API response.

type LoadState =
  | { status: 'loading' }
  | { status: 'invalid' }
  | { status: 'error'; message: string }
  | { status: 'ready'; request: PublicRequest };

interface Result {
  tone: 'good' | 'bad';
  text: string;
}

export function UploadRequest() {
  const { token = '' } = useParams();
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [items, setItems] = useState<PublicItem[]>([]);
  const [files, setFiles] = useState<Record<string, File | undefined>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, Result>>({});

  useEffect(() => {
    let cancelled = false;
    getPublicRequest(token)
      .then((request) => {
        if (cancelled) return;
        setItems(request.items);
        setState({ status: 'ready', request });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 404) {
          setState({ status: 'invalid' });
        } else {
          setState({ status: 'error', message: err instanceof ApiError ? err.message : 'Could not load this page' });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function onUpload(item: PublicItem) {
    const file = files[item.id];
    if (file === undefined) return;
    setBusyId(item.id);
    setResults((prev) => {
      const next = { ...prev };
      delete next[item.id];
      return next;
    });
    try {
      await uploadToRequest(token, item.id, file);
      setItems((prev) => prev.map((x) => (x.id === item.id ? { ...x, received: true } : x)));
      setResults((prev) => ({ ...prev, [item.id]: { tone: 'good', text: 'Uploaded. Thank you.' } }));
    } catch (err) {
      const text = err instanceof ApiError ? err.message : 'Could not upload the file';
      setResults((prev) => ({ ...prev, [item.id]: { tone: 'bad', text } }));
    } finally {
      setBusyId(null);
    }
  }

  let content: ReactNode;
  if (state.status === 'loading') {
    content = <p className="text-muted">Loading…</p>;
  } else if (state.status === 'invalid') {
    content = (
      <>
        <PageHeader title="This link is not valid" />
        <p>It may have expired or been withdrawn. Ask the firm that sent it for a new link.</p>
      </>
    );
  } else if (state.status === 'error') {
    content = (
      <>
        <PageHeader title="Documents requested" />
        <p role="alert" className="text-sm text-bad">
          {state.message}
        </p>
      </>
    );
  } else {
    const { request } = state;
    content = (
      <>
        <PageHeader
          title="Documents requested"
          lead={`${request.firmName} has asked you for the documents below. This link works until ${formatDay(request.expiresOn)}.`}
        />
        <Callout>
          Files go only to {request.firmName}. Upload a PDF, Word (.docx), Excel (.xlsx), CSV, text or Markdown file, up to 20 MB.
        </Callout>
        {items.length === 0 ? (
          <p className="text-muted">Nothing is waiting. You can close this page.</p>
        ) : (
          <div className="space-y-4">
            {items.map((item) => {
              const file = files[item.id];
              const result = results[item.id];
              const isBusy = busyId === item.id;
              return (
                <Card key={item.id}>
                  <h2 className="font-semibold">{item.label}</h2>
                  <p className="mt-1 text-sm text-muted">
                    {item.received ? 'Uploaded. You can upload a newer version if needed.' : 'Waiting for a file.'}
                  </p>
                  <form
                    aria-label={`Upload ${item.label}`}
                    className="mt-3 space-y-3"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void onUpload(item);
                    }}
                  >
                    <input
                      type="file"
                      accept={DOCUMENT_ACCEPT}
                      aria-label={`File for ${item.label}`}
                      className="block w-full min-w-0 text-sm"
                      onChange={(e) => setFiles((prev) => ({ ...prev, [item.id]: e.target.files?.[0] }))}
                    />
                    <Button type="submit" aria-label={`Upload ${item.label}`} disabled={isBusy || file === undefined}>
                      Upload
                    </Button>
                  </form>
                  {result !== undefined &&
                    (result.tone === 'good' ? (
                      <p role="status" className="mt-2 text-sm text-good">
                        {result.text}
                      </p>
                    ) : (
                      <p role="alert" className="mt-2 text-sm text-bad">
                        {result.text}
                      </p>
                    ))}
                </Card>
              );
            })}
          </div>
        )}
      </>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-panel focus:p-2">
        Skip to content
      </a>
      <header className="border-b border-line">
        <div className="mx-auto max-w-2xl px-4 py-3 font-semibold">Compliance Hub</div>
      </header>
      <main id="main" className="mx-auto w-full max-w-2xl px-4 py-6 sm:py-10">
        {content}
      </main>
    </div>
  );
}
