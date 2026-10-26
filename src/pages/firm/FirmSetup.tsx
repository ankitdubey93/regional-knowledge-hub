import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Card, Field, PageHeader, inputClass } from '../../components/ui';
import { createFirm } from '../../lib/session';

export function FirmSetup() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const message = await createFirm(name);
    setBusy(false);
    if (message !== null) {
      setError(message);
      return;
    }
    navigate('/clients');
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Set up your firm" lead="Your firm holds your team and your client headings. Other firms cannot see them." />
      <Card className="max-w-md">
        <form onSubmit={onSubmit} className="space-y-4">
          <Field label="Firm name">
            <input
              type="text"
              required
              className={inputClass}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          {error !== null && (
            <p role="alert" className="text-sm text-bad">
              {error}
            </p>
          )}
          <Button type="submit" disabled={busy}>
            Create firm
          </Button>
        </form>
      </Card>
    </div>
  );
}
