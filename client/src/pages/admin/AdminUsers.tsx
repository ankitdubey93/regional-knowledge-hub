import { useEffect, useState, type FormEvent } from 'react';
import { AdminNav } from '../../components/AdminNav';
import { RequireAdmin } from '../../components/RequireAdmin';
import { Button, Callout, Card, Field, PageHeader, TableScroll, inputClass } from '../../components/ui';
import { banUser, listUsers, unbanUser, type AdminUserRow, type UserList } from '../../lib/admin';
import { ApiError } from '../../lib/api';

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function statusOf(u: AdminUserRow): string {
  if (u.isPlatformAdmin) return 'Admin';
  if (u.banned) return 'Banned';
  return 'Active';
}

// Data lives in its own component so that nothing is fetched until RequireAdmin has passed.
function UsersPanel() {
  const [draft, setDraft] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [reloadKey, setReloadKey] = useState(0);
  const [data, setData] = useState<UserList | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [banTarget, setBanTarget] = useState<AdminUserRow | null>(null);
  const [reason, setReason] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoadError(null);
    listUsers(query, page)
      .then((body) => {
        if (!cancelled) setData(body);
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoadError(err instanceof ApiError ? err.message : 'Could not load users');
      });
    return () => {
      cancelled = true;
    };
  }, [query, page, reloadKey]);

  function onSearch(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPage(1);
    setQuery(draft.trim());
  }

  function startBan(u: AdminUserRow) {
    setActionError(null);
    setReason('');
    setBanTarget(u);
  }

  async function confirmBan() {
    if (banTarget === null) return;
    setActionError(null);
    try {
      await banUser(banTarget.id, reason);
      setBanTarget(null);
      setReloadKey((k) => k + 1);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Could not ban this user');
    }
  }

  async function unban(u: AdminUserRow) {
    setActionError(null);
    try {
      await unbanUser(u.id);
      setReloadKey((k) => k + 1);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Could not unban this user');
    }
  }

  const totalPages = data === null ? 1 : Math.max(1, Math.ceil(data.total / data.pageSize));

  return (
    <div className="space-y-6">
      <PageHeader title="Users" lead="Everyone who has signed up." />
      <AdminNav />

      <form role="search" onSubmit={onSearch} className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1">
          <Field label="Search by email">
            <input type="search" className={inputClass} value={draft} onChange={(e) => setDraft(e.target.value)} />
          </Field>
        </div>
        <Button type="submit">Search</Button>
      </form>

      {loadError !== null && <Callout tone="bad">{loadError}</Callout>}
      {actionError !== null && <Callout tone="bad">{actionError}</Callout>}

      {data === null && loadError === null && <p className="text-muted">Loading…</p>}

      {data !== null && (
        <>
          <TableScroll>
            <table className="w-full min-w-[56rem] text-left text-sm">
              <thead className="border-b border-line text-muted">
                <tr>
                  <th scope="col" className="px-3 py-2 font-medium">Name</th>
                  <th scope="col" className="px-3 py-2 font-medium">Email</th>
                  <th scope="col" className="px-3 py-2 font-medium">Joined</th>
                  <th scope="col" className="px-3 py-2 font-medium">Workspaces</th>
                  <th scope="col" className="px-3 py-2 font-medium">Last active</th>
                  <th scope="col" className="px-3 py-2 font-medium">Status</th>
                  <th scope="col" className="px-3 py-2 font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {data.users.map((u) => (
                  <tr key={u.id} className="border-b border-line align-top">
                    <td className="px-3 py-2">{u.name}</td>
                    <td className="px-3 py-2">{u.email}</td>
                    <td className="px-3 py-2">{shortDate(u.createdAt)}</td>
                    <td className="px-3 py-2">{u.workspaces.length === 0 ? 'None' : u.workspaces.map((w) => w.name).join(', ')}</td>
                    <td className="px-3 py-2">{u.lastActiveAt === null ? 'Never' : shortDate(u.lastActiveAt)}</td>
                    <td className="px-3 py-2">{statusOf(u)}</td>
                    <td className="px-3 py-2">
                      {u.isPlatformAdmin ? (
                        '—'
                      ) : u.banned ? (
                        <Button variant="secondary" aria-label={`Unban ${u.email}`} onClick={() => unban(u)}>
                          Unban
                        </Button>
                      ) : (
                        <Button variant="secondary" aria-label={`Ban ${u.email}`} onClick={() => startBan(u)}>
                          Ban
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>

          {banTarget !== null && (
            <Card>
              <div className="space-y-4">
                <Field label={`Reason for banning ${banTarget.email}`}>
                  <input type="text" className={inputClass} value={reason} onChange={(e) => setReason(e.target.value)} />
                </Field>
                <div className="flex flex-wrap gap-2">
                  <Button onClick={confirmBan}>Confirm ban</Button>
                  <Button variant="ghost" onClick={() => setBanTarget(null)}>
                    Cancel
                  </Button>
                </div>
              </div>
            </Card>
          )}

          <nav aria-label="Pages" className="flex flex-wrap items-center gap-3">
            <Button variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Previous
            </Button>
            <span className="text-sm text-muted">
              Page {page} of {totalPages}
            </span>
            <Button variant="secondary" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
              Next
            </Button>
          </nav>
        </>
      )}
    </div>
  );
}

export function AdminUsers() {
  return (
    <RequireAdmin>
      <UsersPanel />
    </RequireAdmin>
  );
}
