import { describe, expect, it, vi } from 'vitest';
import { currentEmbedder, EmbeddingError, geminiEmbedder, setEmbedderForTests } from '../ai/embed';

function okStub(fill = 1, length = 768) {
  return vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as { requests: unknown[] };
    const embeddings = body.requests.map(() => ({ values: Array.from({ length }, () => fill) }));
    return new Response(JSON.stringify({ embeddings }), { status: 200 });
  });
}

describe('embed', () => {
  it('E1 sends the key in a header, the task and 768 dimensions', async () => {
    const stub = okStub();
    await geminiEmbedder('test-key-123', 'gemini-embedding-001', stub as unknown as typeof fetch).embed(['hello'], 'RETRIEVAL_DOCUMENT');
    const call = stub.mock.calls[0];
    expect(call).toBeDefined();
    const url = String(call?.[0]);
    const init = call?.[1];
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:batchEmbedContents');
    expect(url).not.toContain('test-key-123');
    if (!init) throw new Error('fetch was called without init');
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe('test-key-123');
    const body = JSON.parse(String(init.body)) as { requests: { taskType: string; outputDimensionality: number }[] };
    expect(body.requests[0]?.taskType).toBe('RETRIEVAL_DOCUMENT');
    expect(body.requests[0]?.outputDimensionality).toBe(768);
  });

  it('E2 batches 250 texts into 3 calls', async () => {
    const stub = okStub();
    const out = await geminiEmbedder('k', 'm', stub as unknown as typeof fetch).embed(
      Array.from({ length: 250 }, (_, i) => `t${i}`),
      'RETRIEVAL_DOCUMENT',
    );
    expect(stub).toHaveBeenCalledTimes(3);
    expect(out).toHaveLength(250);
  });

  it('E3 normalises vectors', async () => {
    const out = await geminiEmbedder('k', 'm', okStub(2) as unknown as typeof fetch).embed(['a'], 'RETRIEVAL_QUERY');
    const v = out[0] ?? [];
    expect(v).toHaveLength(768);
    for (const x of v) expect(Math.abs(x - 1 / Math.sqrt(768))).toBeLessThan(1e-9);
  });

  it('E4 a 500 answer throws EmbeddingError without the response body', async () => {
    const stub = vi.fn(async () => new Response('secret detail', { status: 500 }));
    const e = geminiEmbedder('k', 'm', stub as unknown as typeof fetch);
    const err = await e.embed(['a'], 'RETRIEVAL_DOCUMENT').catch((x: unknown) => x);
    expect(err).toBeInstanceOf(EmbeddingError);
    expect((err as Error).message).toBe('Gemini embedding failed (500)');
    expect((err as Error).message).not.toContain('secret detail');
  });

  it('E5 a wrong vector length throws', async () => {
    const e = geminiEmbedder('k', 'm', okStub(1, 10) as unknown as typeof fetch);
    await expect(e.embed(['a'], 'RETRIEVAL_DOCUMENT')).rejects.toThrow('Gemini returned an unexpected embedding shape');
  });

  it('E6 currentEmbedder is null without GEMINI_API_KEY', () => {
    setEmbedderForTests(undefined);
    expect(currentEmbedder()).toBeNull();
  });
});
