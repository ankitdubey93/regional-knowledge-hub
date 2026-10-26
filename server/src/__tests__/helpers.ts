import { randomUUID } from 'node:crypto';
import { startApp } from './server';

export const ORIGIN = 'http://localhost:5190';

export async function call(method: string, path: string, opts?: { cookie?: string; body?: unknown }): Promise<Response> {
  const headers: Record<string, string> = { origin: ORIGIN };
  if (opts?.cookie) headers.cookie = opts.cookie;
  let body: string | undefined;
  if (opts?.body !== undefined) {
    headers['content-type'] = 'application/json';
    body = JSON.stringify(opts.body);
  }
  return fetch(`${await startApp()}${path}`, { method, headers, body, redirect: 'manual' });
}

export function mergeCookies(previous: string, res: Response): string {
  const jar = new Map<string, string>();
  const add = (pair: string) => {
    const trimmed = pair.trim();
    const i = trimmed.indexOf('=');
    if (i > 0) jar.set(trimmed.slice(0, i), trimmed.slice(i + 1));
  };
  for (const part of previous.split(';')) add(part);
  for (const line of res.headers.getSetCookie()) add(line.split(';')[0] ?? '');
  return [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
}

export async function signUp(): Promise<{ cookie: string; userId: string; email: string }> {
  const email = `u-${randomUUID()}@example.test`;
  const res = await call('POST', '/api/auth/sign-up/email', {
    body: { name: 'Test User', email, password: 'correct-horse-9' },
  });
  if (res.status !== 200) throw new Error(`sign-up failed: ${res.status} ${await res.text()}`);
  const body = (await res.json()) as { user: { id: string } };
  return { cookie: mergeCookies('', res), userId: body.user.id, email };
}

export async function createFirm(cookie: string, name: string): Promise<{ cookie: string; orgId: string }> {
  const created = await call('POST', '/api/auth/organization/create', {
    cookie,
    body: { name, slug: `firm-${randomUUID().slice(0, 8)}` },
  });
  if (created.status !== 200) throw new Error(`create firm failed: ${created.status} ${await created.text()}`);
  const org = (await created.json()) as { id: string };
  const active = await call('POST', '/api/auth/organization/set-active', {
    cookie: mergeCookies(cookie, created),
    body: { organizationId: org.id },
  });
  if (active.status !== 200) throw new Error(`set-active failed: ${active.status} ${await active.text()}`);
  return { cookie: mergeCookies(mergeCookies(cookie, created), active), orgId: org.id };
}
