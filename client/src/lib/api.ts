export class ApiError extends Error {
  readonly status: number;
  readonly issues: { level: string; code: string; message: string }[];
  constructor(status: number, message: string, issues: ApiError['issues'] = []) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.issues = issues;
  }
}

/** 429 text the user sees. */
export function rateLimitMessage(retryAfterSeconds: number): string {
  if (retryAfterSeconds < 60) return `Too many requests. Try again in ${retryAfterSeconds} seconds.`;
  const minutes = Math.ceil(retryAfterSeconds / 60);
  return `Too many requests. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`;
}

export async function failure(res: Response): Promise<ApiError> {
  let message = `Request failed (${res.status})`;
  let issues: ApiError['issues'] = [];
  try {
    const body: unknown = await res.json();
    if (typeof body === 'object' && body !== null && 'error' in body && typeof body.error === 'string') {
      message = body.error;
    }
    if (
      typeof body === 'object' &&
      body !== null &&
      'issues' in body &&
      Array.isArray(body.issues) &&
      body.issues.every((i: unknown) => typeof i === 'object' && i !== null && 'message' in i && typeof i.message === 'string')
    ) {
      issues = body.issues;
    }
  } catch {
    // Not JSON: keep the generic message.
  }
  if (res.status === 429) {
    const retryAfter = res.headers.get('Retry-After');
    if (retryAfter !== null && /^\s*\d+\s*$/.test(retryAfter)) {
      message = rateLimitMessage(Number(retryAfter));
    }
  }
  return new ApiError(res.status, message, issues);
}

export async function apiJson<T>(path: string, init?: { method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'; body?: unknown }): Promise<T> {
  const headers: Record<string, string> = {};
  let body: string | null = null;
  if (init?.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(init.body);
  }
  const res = await fetch(`/api${path}`, { method: init?.method ?? 'GET', credentials: 'include', headers, body });
  if (!res.ok) throw await failure(res);
  // The single sanctioned cast: the JSON boundary.
  return (await res.json()) as T;
}

export async function apiDelete(path: string): Promise<void> {
  const res = await fetch(`/api${path}`, { method: 'DELETE', credentials: 'include' });
  if (!res.ok) throw await failure(res);
}
