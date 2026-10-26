import { z } from 'zod';
import { env } from '../env';

export const EMBED_DIMENSIONS = 768;
export const GEMINI_BATCH = 100;
export type EmbedTask = 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY';
export interface Embedder { readonly model: string; embed(texts: string[], task: EmbedTask): Promise<number[][]> }
export class EmbeddingError extends Error {}

const responseSchema = z.object({ embeddings: z.array(z.object({ values: z.array(z.number()) })) });

function normalise(v: number[]): number[] {
  let sum = 0;
  for (const x of v) sum += x * x;
  const norm = Math.sqrt(sum);
  return norm === 0 ? v : v.map((x) => x / norm);
}

/** Gemini batchEmbedContents over plain fetch. The key goes only in the x-goog-api-key header. */
export function geminiEmbedder(apiKey: string, model: string, fetchImpl: typeof fetch = fetch): Embedder {
  return {
    model,
    async embed(texts, task) {
      const out: number[][] = [];
      for (let i = 0; i < texts.length; i += GEMINI_BATCH) {
        const slice = texts.slice(i, i + GEMINI_BATCH);
        const res = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${model}:batchEmbedContents`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
          signal: AbortSignal.timeout(30_000),
          body: JSON.stringify({
            requests: slice.map((text) => ({
              model: `models/${model}`,
              content: { parts: [{ text }] },
              taskType: task,
              outputDimensionality: EMBED_DIMENSIONS,
            })),
          }),
        });
        if (!res.ok) throw new EmbeddingError(`Gemini embedding failed (${res.status})`);
        const parsed = responseSchema.safeParse(await res.json());
        if (
          !parsed.success ||
          parsed.data.embeddings.length !== slice.length ||
          parsed.data.embeddings.some((e) => e.values.length !== EMBED_DIMENSIONS)
        ) {
          throw new EmbeddingError('Gemini returned an unexpected embedding shape');
        }
        for (const e of parsed.data.embeddings) out.push(normalise(e.values));
      }
      return out;
    },
  };
}

let override: Embedder | null | undefined;
/** Tests only: a stub embedder (Hard rule 15). undefined restores the default. */
export function setEmbedderForTests(e: Embedder | null | undefined): void { override = e; }
/** The embedder to use, or null when none is configured. */
export function currentEmbedder(): Embedder | null {
  if (override !== undefined) return override;
  return env.GEMINI_API_KEY ? geminiEmbedder(env.GEMINI_API_KEY, env.GEMINI_EMBED_MODEL) : null;
}
