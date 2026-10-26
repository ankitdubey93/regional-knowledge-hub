import { hostOf, isOfficialUrl } from './officialSites';

export const FETCH_MAX_BYTES = 10 * 1024 * 1024;
export const FETCH_TIMEOUT_MS = 20_000;
export const MAX_REDIRECTS = 5;

export class FetchError extends Error {}

let override: typeof fetch | undefined;
export function setOfficialFetchForTests(f: typeof fetch | undefined): void {
  override = f;
}

const REDIRECTS = new Set([301, 302, 303, 307, 308]);
const TOO_BIG = 'The page is larger than 10 MB';

function check(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new FetchError('That is not a valid URL');
  }
  if (parsed.protocol !== 'https:') throw new FetchError('Only https URLs can be fetched');
  if (!isOfficialUrl(url)) throw new FetchError(`Only official sites can be fetched, not ${hostOf(url)}`);
}

async function readCapped(res: Response): Promise<Uint8Array> {
  if (!res.body) return new Uint8Array(0);
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > FETCH_MAX_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw new FetchError(TOO_BIG);
      }
      chunks.push(value);
    }
  } catch (e) {
    if (e instanceof FetchError) throw e;
    throw new FetchError('Could not reach the site');
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.byteLength;
  }
  return out;
}

/** Fetches an allowlisted official page. The allowlist is checked before every request, including each redirect hop. */
export async function fetchOfficial(url: string): Promise<{ finalUrl: string; kind: 'html' | 'pdf'; bytes: Uint8Array }> {
  let current = url;
  for (let hops = 0; ; hops++) {
    check(current);
    let res: Response;
    try {
      res = await (override ?? fetch)(current, {
        redirect: 'manual',
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: {
          'User-Agent': 'ComplianceHubKB/0.1 (knowledge-base ingestion)',
          Accept: 'text/html,application/xhtml+xml,application/pdf',
        },
      });
    } catch {
      throw new FetchError('Could not reach the site');
    }
    if (REDIRECTS.has(res.status)) {
      const location = res.headers.get('location');
      if (!location) throw new FetchError(`The site answered ${res.status}`);
      if (hops >= MAX_REDIRECTS) throw new FetchError('Too many redirects');
      try {
        current = new URL(location, current).toString();
      } catch {
        throw new FetchError('That is not a valid URL');
      }
      continue;
    }
    if (res.status < 200 || res.status > 299) throw new FetchError(`The site answered ${res.status}`);
    const declared = Number(res.headers.get('content-length') ?? '');
    if (Number.isFinite(declared) && declared > FETCH_MAX_BYTES) throw new FetchError(TOO_BIG);
    const type = (res.headers.get('content-type') ?? '').split(';')[0]?.trim().toLowerCase() ?? '';
    let kind: 'html' | 'pdf';
    if (type === 'text/html' || type === 'application/xhtml+xml') kind = 'html';
    else if (type === 'application/pdf') kind = 'pdf';
    else throw new FetchError(`Unsupported content type: ${type || 'none'}`);
    return { finalUrl: current, kind, bytes: await readCapped(res) };
  }
}
