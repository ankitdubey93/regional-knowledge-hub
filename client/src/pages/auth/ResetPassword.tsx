import { useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button, Card, Field, PageHeader, TextLink, inputClass } from '../../components/ui';
import { ApiError } from '../../lib/api';
import { resetPassword } from '../../lib/members';

export function ResetPassword() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get('token');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!token || params.get('error') === 'INVALID_TOKEN') {
    return (
      <div className="space-y-6">
        <PageHeader title="Choose a new password" />
        <p role="alert" className="text-sm text-bad">
          This reset link is incomplete or has expired. Ask for a new one.
        </p>
        <TextLink to="/forgot-password">Ask for a new link</TextLink>
      </div>
    );
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await resetPassword(token ?? '', password);
      navigate('/sign-in?reset=1');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not reset the password');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Choose a new password" />
      <Card className="max-w-md">
        <form onSubmit={onSubmit} className="space-y-4">
          <Field label="New password" hint="At least 8 characters">
            <input
              type="password"
              minLength={8}
              required
              autoComplete="new-password"
              className={inputClass}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          {error !== null && (
            <p role="alert" className="text-sm text-bad">
              {error}
            </p>
          )}
          <Button type="submit" disabled={busy}>
            Set new password
          </Button>
        </form>
      </Card>
    </div>
  );
}
