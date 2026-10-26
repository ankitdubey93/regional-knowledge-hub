import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchOfficial, FetchError, MAX_REDIRECTS, setOfficialFetchForTests } from '../kb/fetchOfficial';

function stub(make: (url: string) => Response) {
  const f = vi.fn(async (input: string | URL | Request) => make(String(input)));
  setOfficialFetchForTests(f as unknown as typeof fetch);
  return f;
}

const html = (body = '<p>x</p>', headers: Record<string, string> = {}) =>
  new Response(body, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8', ...headers } });

describe('kb fetch', () => {
  afterEach(() => setOfficialFetchForTests(undefined));

  it('F1 fetches an official HTML page', async () => {
    stub(() => html());
    const url = 'https://www.legislation.gov.uk/ukpga/1994/23';
    const out = await fetchOfficial(url);
    expect(out.kind).toBe('html');
    expect(out.finalUrl).toBe(url);
  });

  it('F2 rejects http', async () => {
    const f = stub(() => html());
    await expect(fetchOfficial('http://www.gov.uk/x')).rejects.toThrow('Only https URLs can be fetched');
    expect(f).not.toHaveBeenCalled();
  });

  it('F3 rejects a non-official host without calling fetch', async () => {
    const f = stub(() => html());
    const err = await fetchOfficial('https://example.com/').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(FetchError);
    expect((err as Error).message).toContain('example.com');
    expect(f).not.toHaveBeenCalled();
  });

  it('F4 rejects a redirect to a non-official host', async () => {
    const f = stub(() => new Response(null, { status: 302, headers: { location: 'https://evil.example/' } }));
    await expect(fetchOfficial('https://www.gov.uk/start')).rejects.toThrow('evil.example');
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('F5 follows an official redirect', async () => {
    stub((url) =>
      url === 'https://www.gov.uk/'
        ? new Response(null, { status: 302, headers: { location: '/x' } })
        : new Response('%PDF-1.4', { status: 200, headers: { 'content-type': 'application/pdf' } }),
    );
    const out = await fetchOfficial('https://www.gov.uk/');
    expect(out.kind).toBe('pdf');
    expect(out.finalUrl.endsWith('/x')).toBe(true);
  });

  it('F6 rejects a page over 10 MB', async () => {
    stub(() => html('small', { 'content-length': '20000000' }));
    await expect(fetchOfficial('https://www.gov.uk/big')).rejects.toThrow('The page is larger than 10 MB');
  });

  it('F7 rejects an unsupported content type', async () => {
    stub(() => new Response('zip', { status: 200, headers: { 'content-type': 'application/zip' } }));
    await expect(fetchOfficial('https://www.gov.uk/z')).rejects.toThrow('Unsupported content type: application/zip');
  });

  it('F8 too many redirects', async () => {
    const f = stub(() => new Response(null, { status: 301, headers: { location: 'https://www.gov.uk/loop' } }));
    await expect(fetchOfficial('https://www.gov.uk/loop')).rejects.toThrow('Too many redirects');
    expect(f).toHaveBeenCalledTimes(MAX_REDIRECTS + 1);
  });
});
