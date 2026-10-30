import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Card, Field, PageHeader, TextLink, inputClass } from '../../components/ui';
import { signUpEmail } from '../../lib/session';
import { useDeployment } from '../../lib/deployment';
import { LEGAL_VERSION, REGION_LABEL } from '@chub/shared/lib/legal';

export function SignUp() {
  const navigate = useNavigate();
  const deployment = useDeployment();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const result = await signUpEmail(name, email, password, deployment?.legalVersion ?? LEGAL_VERSION);
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    navigate(result.checkEmail ? '/check-email' : '/workspace');
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Create an account" />
      <Card className="max-w-md">
        <form onSubmit={onSubmit} className="space-y-4">
          {deployment !== null && (
            <div className="space-y-2">
              <p className="text-sm text-muted">Your firm&apos;s data will be stored in {REGION_LABEL[deployment.region]}.</p>
              {deployment.otherRegionUrl !== null && (
                <a href={deployment.otherRegionUrl} className="font-medium text-accent underline underline-offset-2 hover:text-accent-hover">
                  Firm based in {deployment.region === 'AU' ? 'the United Kingdom' : 'Australia'}? Sign up there instead
                </a>
              )}
            </div>
          )}
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
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" required checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />{' '}
            <span>
              I agree to the <TextLink to="/legal/terms">Terms of service</TextLink> and have read the <TextLink to="/legal/privacy">Privacy notice</TextLink>
            </span>
          </label>
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
