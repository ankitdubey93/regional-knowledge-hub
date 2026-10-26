import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Card, Field, PageHeader, TextLink, inputClass } from '../../components/ui';
import { signUpEmail } from '../../lib/session';

export function SignUp() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const message = await signUpEmail(name, email, password);
    setBusy(false);
    if (message !== null) {
      setError(message);
      return;
    }
    navigate('/firm/new');
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Create an account" />
      <Card className="max-w-md">
        <form onSubmit={onSubmit} className="space-y-4">
          <Field label="Your name">
            <input
              type="text"
              autoComplete="name"
              required
              className={inputClass}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
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
          <Field label="Password" hint="At least 8 characters">
            <input
              type="password"
              minLength={8}
              autoComplete="new-password"
              required
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
            Create account
          </Button>
        </form>
      </Card>
      <TextLink to="/sign-in">Already have an account? Sign in</TextLink>
    </div>
  );
}
