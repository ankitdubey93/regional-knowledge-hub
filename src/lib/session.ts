import { useEffect, useSyncExternalStore } from 'react';
import { z } from 'zod';

export interface SessionInfo {
  userId: string;
  email: string;
  name: string;
  activeFirmId: string | null;
  activeFirmName: string | null;
}

interface Snapshot {
  session: SessionInfo | null;
  pending: boolean;
}

// Better Auth's HTTP endpoints, called with plain fetch (same origin; Vite proxies /api in dev).
const BASE = '/api/auth';

const sessionBody = z
  .object({
    session: z.object({ activeOrganizationId: z.string().nullish() }),
    user: z.object({ id: z.string(), email: z.string(), name: z.string() }),
  })
  .nullable();
const orgBody = z.object({ name: z.string() });
const idBody = z.object({ id: z.string() });
const errorBody = z.object({ message: z.string() });

let snapshot: Snapshot = { session: null, pending: true };
let started = false;
const listeners = new Set<() => void>();

function setSnapshot(next: Snapshot): void {
  snapshot = next;
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): Snapshot {
  return snapshot;
}

async function send(path: string, body: unknown): Promise<Response> {
  return fetch(`${BASE}${path}`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function messageOf(res: Response, fallback: string): Promise<string> {
  try {
    const parsed = errorBody.safeParse(await res.json());
    if (parsed.success) return parsed.data.message;
  } catch {
    // Not JSON: use the fallback.
  }
  return fallback;
}

async function refreshSession(): Promise<void> {
  try {
    const res = await fetch(`${BASE}/get-session`, { credentials: 'include' });
    if (!res.ok) return setSnapshot({ session: null, pending: false });
    const parsed = sessionBody.safeParse(await res.json());
    if (!parsed.success || parsed.data === null) return setSnapshot({ session: null, pending: false });
    const { session, user } = parsed.data;
    const activeFirmId = session.activeOrganizationId ?? null;
    let activeFirmName: string | null = null;
    if (activeFirmId) {
      try {
        const orgRes = await fetch(`${BASE}/organization/get-full-organization`, { credentials: 'include' });
        if (orgRes.ok) {
          const org = orgBody.safeParse(await orgRes.json());
          if (org.success) activeFirmName = org.data.name;
        }
      } catch {
        activeFirmName = null;
      }
    }
    setSnapshot({
      session: { userId: user.id, email: user.email, name: user.name, activeFirmId, activeFirmName },
      pending: false,
    });
  } catch {
    setSnapshot({ session: null, pending: false });
  }
}

export function useSessionInfo(): { session: SessionInfo | null; pending: boolean } {
  const snap = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  useEffect(() => {
    if (!started) {
      started = true;
      void refreshSession();
    }
  }, []);
  return snap;
}

/** Each returns null on success, or the server's error message. */
export async function signInEmail(email: string, password: string): Promise<string | null> {
  const res = await send('/sign-in/email', { email, password });
  if (!res.ok) return messageOf(res, 'Sign-in failed');
  await refreshSession();
  return null;
}

export async function signUpEmail(name: string, email: string, password: string): Promise<string | null> {
  const res = await send('/sign-up/email', { name, email, password });
  if (!res.ok) return messageOf(res, 'Sign-up failed');
  await refreshSession();
  return null;
}

export async function createFirm(name: string): Promise<string | null> {
  const fallback = 'Could not create the firm';
  const slug = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${crypto.randomUUID().slice(0, 6)}`;
  const created = await send('/organization/create', { name, slug });
  if (!created.ok) return messageOf(created, fallback);
  const org = idBody.safeParse(await created.json());
  if (!org.success) return fallback;
  const active = await send('/organization/set-active', { organizationId: org.data.id });
  if (!active.ok) return messageOf(active, fallback);
  await refreshSession();
  return null;
}

export async function signOutUser(): Promise<void> {
  await send('/sign-out', {});
  setSnapshot({ session: null, pending: false });
}
