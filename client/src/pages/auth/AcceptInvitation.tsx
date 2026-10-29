import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, Card, PageHeader, TextLink } from '../../components/ui';
import { ApiError } from '../../lib/api';
import { acceptInvitation } from '../../lib/members';
import { switchWorkspace, useSessionInfo } from '../../lib/session';

export function AcceptInvitation() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { session, pending } = useSessionInfo();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onJoin() {
    setBusy(true);
    setError(null);
    try {
      const orgId = await acceptInvitation(id);
      const switchError = await switchWorkspace(orgId);
      if (switchError !== null) {
        setError(switchError);
        return;
      }
      navigate('/workspace');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not join the workspace');
    } finally {
      setBusy(false);
    }
  }

  let body;
  if (pending) {
    body = <p className="text-muted">Loading…</p>;
  } else if (session === null) {
    body = (
      <div className="space-y-4">
        <p>Sign in or create an account with the invited email address, then open this link again.</p>
        <div className="flex flex-wrap gap-4 text-sm">
          <TextLink to="/sign-in">Sign in</TextLink>
          <TextLink to="/sign-up">Create an account</TextLink>
        </div>
      </div>
    );
  } else {
    body = (
      <div className="space-y-4">
        <Button type="button" disabled={busy} onClick={() => void onJoin()}>
          Join workspace
        </Button>
        {error !== null && (
          <p role="alert" className="text-sm text-bad">
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Join a workspace" />
      <Card className="max-w-md">{body}</Card>
    </div>
  );
}
