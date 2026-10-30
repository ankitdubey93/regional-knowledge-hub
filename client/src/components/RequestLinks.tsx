import { useEffect, useState, type FormEvent } from 'react';
import { formatDay } from '@chub/shared/utils/deadlines';
import { Button, Callout, Card, Field, inputClass, TableScroll } from './ui';
import { ApiError } from '../lib/api';
import type { RequestView } from '../lib/requests';
import {
  createRequestLink,
  listRequestLinks,
  LINK_STATUS_LABELS,
  parseCadence,
  revokeRequestLink,
  setRequestLinkPaused,
  type RequestLinkView,
} from '../lib/requestLinks';

// Send an upload link to the client and manage the links already sent (C3).

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

interface Sent {
  url: string;
  emailSent: boolean;
}

export function RequestLinks({ clientId, requests }: { clientId: string; requests: RequestView[] }) {
  const [links, setLinks] = useState<RequestLinkView[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [email, setEmail] = useState('');
  const [days, setDays] = useState('30');
  const [cadenceText, setCadenceText] = useState('3, 7, 14');
  const [excluded, setExcluded] = useState<Set<string>>(() => new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<Sent | null>(null);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listRequestLinks(clientId)
      .then((list) => {
        if (!cancelled) setLinks(list);
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  const openRequests = requests.filter((r) => r.status === 'open');

  function toggle(id: string) {
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function onSend(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSent(null);
    setCopyStatus(null);
    const cadenceDays = parseCadence(cadenceText);
    if (cadenceDays === null) {
      setError('Write reminder days as numbers that go up, for example 3, 7, 14');
      return;
    }
    const ticked = openRequests.filter((r) => !excluded.has(r.id));
    if (ticked.length === 0) {
      setError('Choose at least one request');
      return;
    }
    setBusy(true);
    try {
      const out = await createRequestLink(clientId, {
        recipientEmail: email,
        requestIds: ticked.map((r) => r.id),
        expiresInDays: Number(days),
        cadenceDays,
      });
      setLinks((prev) => [out.link, ...(prev ?? [])]);
      setEmail('');
      setSent({ url: out.url, emailSent: out.emailSent });
    } catch (err) {
      setError(errorMessage(err, 'Could not send the link'));
    } finally {
      setBusy(false);
    }
  }

  async function onCopy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopyStatus('Copied.');
    } catch {
      setCopyStatus('Copy the link by selecting it.');
    }
  }

  async function onPause(l: RequestLinkView) {
    setLinkError(null);
    try {
      const updated = await setRequestLinkPaused(clientId, l.id, !l.paused);
      setLinks((prev) => (prev ?? []).map((x) => (x.id === updated.id ? updated : x)));
    } catch (err) {
      setLinkError(errorMessage(err, 'Could not update the link'));
    }
  }

  async function onRevoke(l: RequestLinkView) {
    if (!window.confirm('Revoke this link? The client will no longer be able to upload.')) return;
    setLinkError(null);
    try {
      await revokeRequestLink(clientId, l.id);
      setLinks(await listRequestLinks(clientId));
    } catch (err) {
      setLinkError(errorMessage(err, 'Could not revoke the link'));
    }
  }

  return (
    <>
      <Card>
        <h2 className="font-semibold">Send to client</h2>
        <p className="mt-2 text-sm text-muted">
          The client gets an email with a private upload link and does not need an account. The email names your firm, not the items.
        </p>
        <form aria-label="Send to client" className="mt-4 space-y-3" onSubmit={(e) => void onSend(e)}>
          <Field label="Client email">
            <input
              type="email"
              required
              maxLength={254}
              className={inputClass}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          <Field label="Link works for (days)">
            <input
              type="number"
              min={1}
              max={90}
              required
              className={inputClass}
              value={days}
              onChange={(e) => setDays(e.target.value)}
            />
          </Field>
          <Field label="Reminders (days after sending)" hint="Separate with commas. Leave empty for no reminders.">
            <input type="text" className={inputClass} value={cadenceText} onChange={(e) => setCadenceText(e.target.value)} />
          </Field>
          <fieldset>
            <legend className="text-sm font-medium">Requests to include</legend>
            {openRequests.length === 0 ? (
              <p className="mt-2 text-sm text-muted">No open requests to send.</p>
            ) : (
              <div className="mt-2 space-y-2">
                {openRequests.map((r) => (
                  <label key={r.id} className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={!excluded.has(r.id)}
                      onChange={() => toggle(r.id)}
                    />
                    {`Include ${r.label}`}
                  </label>
                ))}
              </div>
            )}
          </fieldset>
          <Button type="submit" disabled={busy || openRequests.length === 0}>
            Send link
          </Button>
        </form>

        {error !== null && <Callout tone="bad">{error}</Callout>}

        {sent !== null && (
          <div className="mt-4 space-y-3">
            {sent.emailSent ? (
              <p role="status" className="text-sm text-muted">
                Link sent to the client.
              </p>
            ) : (
              <Callout tone="warn">The email could not be sent. Copy the link below and send it yourself.</Callout>
            )}
            <Field label="Upload link (shown once)">
              <input readOnly className={inputClass} value={sent.url} />
            </Field>
            <Button variant="secondary" onClick={() => void onCopy(sent.url)}>
              Copy link
            </Button>
            {copyStatus !== null && (
              <p role="status" className="text-sm text-muted">
                {copyStatus}
              </p>
            )}
          </div>
        )}
      </Card>

      <Card>
        <h2 className="font-semibold">Links sent</h2>
        {loadFailed ? (
          <p role="alert" className="mt-3 text-sm text-bad">
            Could not load the links sent.
          </p>
        ) : links === null ? (
          <p className="mt-3 text-sm text-muted">Loading…</p>
        ) : links.length === 0 ? (
          <p className="mt-3 text-sm text-muted">No links sent yet.</p>
        ) : (
          <TableScroll>
            <table className="mt-3 w-full min-w-[36rem] text-left text-sm">
              <thead>
                <tr>
                  <th scope="col" className="border-b border-line px-2 py-1 font-medium">Sent to</th>
                  <th scope="col" className="border-b border-line px-2 py-1 font-medium">Expires</th>
                  <th scope="col" className="border-b border-line px-2 py-1 font-medium">Status</th>
                  <th scope="col" className="border-b border-line px-2 py-1 font-medium">Reminders sent</th>
                  <th scope="col" className="relative border-b border-line px-2 py-1 font-medium">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {links.map((l) => (
                  <tr key={l.id}>
                    <td className="border-b border-line px-2 py-1">{l.recipientEmail}</td>
                    <td className="whitespace-nowrap border-b border-line px-2 py-1">{formatDay(l.expiresAt.slice(0, 10))}</td>
                    <td className="border-b border-line px-2 py-1">{LINK_STATUS_LABELS[l.status]}</td>
                    <td className="border-b border-line px-2 py-1">{`${l.nudgeCount} of ${l.cadenceDays.length}`}</td>
                    <td className="border-b border-line px-2 py-1">
                      {l.status !== 'revoked' && l.status !== 'expired' && (
                        <div className="flex flex-wrap items-center gap-2">
                          {l.paused ? (
                            <Button variant="secondary" aria-label={`Resume reminders to ${l.recipientEmail}`} onClick={() => void onPause(l)}>
                              Resume
                            </Button>
                          ) : (
                            <Button variant="secondary" aria-label={`Pause reminders to ${l.recipientEmail}`} onClick={() => void onPause(l)}>
                              Pause
                            </Button>
                          )}
                          <Button variant="secondary" aria-label={`Revoke link to ${l.recipientEmail}`} onClick={() => void onRevoke(l)}>
                            Revoke
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        )}
        {linkError !== null && <Callout tone="bad">{linkError}</Callout>}
      </Card>
    </>
  );
}
