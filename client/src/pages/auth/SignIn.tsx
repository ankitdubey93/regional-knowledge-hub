import { useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button, Card, Field, PageHeader, TextLink, inputClass } from '../../components/ui';
import { signInEmail } from '../../lib/session';

export function SignIn() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const resetDone = params.get('reset') === '1';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const message = await signInEmail(email, password);
    setBusy(false);
    if (message !== null) {
      setError(message);
      return;
    }
    navigate('/workspace');
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Sign in" />
      {resetDone && <p role="status">Password changed. Sign in with the new one.</p>}
      <Card className="max-w-md">
        <form onSubmit={onSubmit} className="space-y-4">
          <Field label="Email">
            <input
              type="email"
              autoComplete="email"
              required
              className={inputClass}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          <Field label="Password">
            <input
              type="password"
              autoComplete="current-password"
              required
              className={inputClass}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          <TextLink to="/forgot-password">Forgot your password?</TextLink>
          {error !== null && (
            <p role="alert" className="text-sm text-bad">
              {error}
            </p>
          )}
          <Button type="submit" disabled={busy}>
            Sign in
          </Button>
        </form>
      </Card>
      <TextLink to="/sign-up">Create an account</TextLink>
    </div>
  );
}
