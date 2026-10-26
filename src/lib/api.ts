export class ApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function failure(res: Response): Promise<ApiError> {
  let message = `Request failed (${res.status})`;
  try {
    const body: unknown = await res.json();
    if (typeof body === 'object' && body !== null && 'error' in body && typeof body.error === 'string') {
      message = body.error;
    }
  } catch {
    // Not JSON: keep the generic message.
  }
  return new ApiError(res.status, message);
}

export async function apiJson<T>(path: string, init?: { method?: 'GET' | 'POST' | 'PATCH'; body?: unknown }): Promise<T> {
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
