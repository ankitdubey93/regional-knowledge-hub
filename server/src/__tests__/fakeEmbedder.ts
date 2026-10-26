import { EMBED_DIMENSIONS, EmbeddingError, type Embedder } from '../ai/embed';

// Deterministic, no network (Hard rule 15): a hashed bag of words, unit length.
function fnv1a32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

function vectorFor(text: string): number[] {
  const v = Array.from({ length: EMBED_DIMENSIONS }, () => 0);
  for (const token of text.toLowerCase().match(/[a-z0-9]+/g) ?? []) {
    const i = fnv1a32(token) % EMBED_DIMENSIONS;
    v[i] = (v[i] ?? 0) + 1;
  }
  let sum = 0;
  for (const x of v) sum += x * x;
  if (sum === 0) {
    v[0] = 1;
    return v;
  }
  const norm = Math.sqrt(sum);
  return v.map((x) => x / norm);
}

export function fakeEmbedder(): Embedder {
  return { model: 'fake-embed', embed: async (texts) => texts.map(vectorFor) };
}

export function failingEmbedder(): Embedder {
  return {
    model: 'fake-embed',
    embed: async () => {
      throw new EmbeddingError('fake failure');
    },
  };
}
