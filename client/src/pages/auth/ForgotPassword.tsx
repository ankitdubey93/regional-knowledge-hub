import { useState, type FormEvent } from 'react';
import { Button, Card, Field, PageHeader, TextLink, inputClass } from '../../components/ui';
import { requestPasswordReset } from '../../lib/members';

export function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    // Whether it succeeds or fails, say the same thing: never reveal whether the account exists.
    try {
      await requestPasswordReset(email);
    } catch {
      // Ignored on purpose (see above).
    }
    setBusy(false);
    setSent(true);
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Reset your password" />
      <Card className="max-w-md">
        <form aria-label="Reset your password" onSubmit={onSubmit} className="space-y-4">
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
          {sent && <p role="status">If an account uses that address, a reset link is on its way.</p>}
          <Button type="submit" disabled={busy}>
            Send reset link
          </Button>
        </form>
      </Card>
      <TextLink to="/sign-in">Back to sign in</TextLink>
    </div>
  );
}
