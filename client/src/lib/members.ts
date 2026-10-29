// Workspace members, invitations and password reset (P5b), through Better Auth with plain fetch.
import { z } from 'zod';
import { failure } from './api';

const BASE = '/api/auth';
export type WorkspaceRole = 'owner' | 'admin' | 'member';
export interface WorkspaceMember { id: string; userId: string; role: WorkspaceRole; name: string; email: string }

const roleSchema = z.enum(['owner', 'admin', 'member']);
const listBody = z.object({
  members: z.array(
    z.object({
      id: z.string(),
      userId: z.string(),
      role: roleSchema,
      user: z.object({ name: z.string(), email: z.string() }),
    }),
  ),
});
const roleBody = z.object({ role: roleSchema });
const acceptBody = z.object({ member: z.object({ organizationId: z.string() }) });

/** GET /organization/list-members → members mapped to WorkspaceMember (name and email from member.user). */
export async function listWorkspaceMembers(): Promise<WorkspaceMember[]> {
  const res = await fetch(`${BASE}/organization/list-members`, { credentials: 'include' });
  if (!res.ok) throw await failure(res);
  const body = listBody.parse(await res.json());
  return body.members.map((m) => ({ id: m.id, userId: m.userId, role: m.role, name: m.user.name, email: m.user.email }));
}

/** GET /organization/get-active-member-role → role. */
export async function getMyRole(): Promise<WorkspaceRole> {
  const res = await fetch(`${BASE}/organization/get-active-member-role`, { credentials: 'include' });
  if (!res.ok) throw await failure(res);
  return roleBody.parse(await res.json()).role;
}

/** POST /organization/invite-member { email, role }. */
export async function inviteMember(email: string, role: 'admin' | 'member'): Promise<void> {
  const res = await fetch(`${BASE}/organization/invite-member`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, role }),
  });
  if (!res.ok) throw await failure(res);
}

/** POST /organization/accept-invitation { invitationId } → the joined workspace id (member.organizationId). */
export async function acceptInvitation(id: string): Promise<string> {
  const res = await fetch(`${BASE}/organization/accept-invitation`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ invitationId: id }),
  });
  if (!res.ok) throw await failure(res);
  return acceptBody.parse(await res.json()).member.organizationId;
}

/** POST /request-password-reset { email, redirectTo: `${window.location.origin}/reset-password` }. */
export async function requestPasswordReset(email: string): Promise<void> {
  const res = await fetch(`${BASE}/request-password-reset`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, redirectTo: `${window.location.origin}/reset-password` }),
  });
  if (!res.ok) throw await failure(res);
}

/** POST /reset-password { newPassword, token }. */
export async function resetPassword(token: string, newPassword: string): Promise<void> {
  const res = await fetch(`${BASE}/reset-password`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ newPassword, token }),
  });
  if (!res.ok) throw await failure(res);
}
