import { useEffect, useState, type FormEvent } from 'react';
import { Button, Callout, Card, Field, PageHeader, TableScroll, TextLink, inputClass } from '../../components/ui';
import { ApiError } from '../../lib/api';
import { getMyRole, inviteMember, listWorkspaceMembers, type WorkspaceMember, type WorkspaceRole } from '../../lib/members';

const ROLE_LABELS: Record<WorkspaceRole, string> = { owner: 'Owner', admin: 'Admin', member: 'Member' };

export function Members() {
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [role, setRole] = useState<WorkspaceRole | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'admin' | 'member'>('member');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    Promise.all([listWorkspaceMembers(), getMyRole()])
      .then(([rows, myRole]) => {
        if (cancelled) return;
        setMembers(rows);
        setRole(myRole);
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoadError(err instanceof ApiError ? err.message : 'Could not load members');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const canInvite = role === 'owner' || role === 'admin';

  async function onInvite(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const sentTo = email;
    setBusy(true);
    setNotice(null);
    setInviteError(null);
    try {
      await inviteMember(sentTo, inviteRole);
      setNotice(`Invitation sent to ${sentTo}.`);
      setEmail('');
    } catch (err) {
      setInviteError(err instanceof ApiError ? err.message : 'Could not send the invitation');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <TextLink to="/workspace">Back to workspace</TextLink>
      <PageHeader title="Members" />
      {loadError !== null && <Callout tone="bad">{loadError}</Callout>}

      <Card>
        <h2 className="font-semibold">People in this workspace</h2>
        {loading ? (
          <p className="mt-3 text-sm text-muted">Loading…</p>
        ) : (
          <TableScroll>
            <table className="mt-3 w-full min-w-[32rem] text-left text-sm">
              <thead className="text-muted">
                <tr>
                  <th scope="col" className="py-2 pr-4 font-medium">
                    Name
                  </th>
                  <th scope="col" className="py-2 pr-4 font-medium">
                    Email
                  </th>
                  <th scope="col" className="py-2 font-medium">
                    Role
                  </th>
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.id} className="border-t border-line">
                    <td className="py-2 pr-4">{m.name}</td>
                    <td className="py-2 pr-4">{m.email}</td>
                    <td className="py-2">{ROLE_LABELS[m.role]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        )}
      </Card>

      {canInvite && (
        <Card>
          <h2 className="font-semibold">Invite someone</h2>
          <form aria-label="Invite someone" onSubmit={onInvite} className="mt-3 space-y-4">
            <Field label="Email">
              <input
                type="email"
                required
                className={inputClass}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Field>
            <Field label="Role">
              <select
                className={inputClass}
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value === 'admin' ? 'admin' : 'member')}
              >
                <option value="member">Member</option>
                <option value="admin">Admin</option>
              </select>
            </Field>
            {notice !== null && <p role="status">{notice}</p>}
            {inviteError !== null && (
              <p role="alert" className="text-sm text-bad">
                {inviteError}
              </p>
            )}
            <Button type="submit" disabled={busy}>
              Send invitation
            </Button>
          </form>
        </Card>
      )}
    </div>
  );
}
