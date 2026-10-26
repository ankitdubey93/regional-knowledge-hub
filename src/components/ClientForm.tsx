import { useState, type FormEvent } from 'react';
import { type ClientBody, type EntityProfile } from '../lib/entity';
import { EntityFields } from './EntityFields';
import { Button, Field, inputClass } from './ui';

export interface ClientFormValues {
  name: string;
  notes: string;
  profile: EntityProfile;
}

export function ClientForm({
  initial,
  nameLabel,
  submitLabel,
  onSubmit,
  resetOnSuccess = false,
}: {
  initial: ClientFormValues;
  nameLabel: string;
  submitLabel: string;
  onSubmit: (body: ClientBody) => Promise<string | null>; // null = saved, else the error message
  resetOnSuccess?: boolean; // default false
}) {
  const [name, setName] = useState(initial.name);
  const [notes, setNotes] = useState(initial.notes);
  const [profile, setProfile] = useState<EntityProfile>(initial.profile);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function onFormSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(false);
    const message = await onSubmit({ name, notes, ...profile });
    setBusy(false);
    if (message !== null) {
      setError(message);
      return;
    }
    if (resetOnSuccess) {
      setName(initial.name);
      setNotes(initial.notes);
      setProfile(initial.profile);
    } else {
      setSaved(true);
    }
  }

  return (
    <form onSubmit={onFormSubmit} className="space-y-4">
      <Field label={nameLabel}>
        <input
          type="text"
          required
          maxLength={120}
          className={inputClass}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </Field>
      <EntityFields value={profile} onChange={setProfile} />
      <Field label="Notes">
        <textarea
          rows={3}
          maxLength={2000}
          className={inputClass}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </Field>
      {error !== null && (
        <p role="alert" className="text-sm text-bad">
          {error}
        </p>
      )}
      {saved && !resetOnSuccess && (
        <p role="status" className="text-sm text-good">
          Saved.
        </p>
      )}
      <Button type="submit" disabled={busy}>
        {submitLabel}
      </Button>
    </form>
  );
}
