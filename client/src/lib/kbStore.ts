import { z } from 'zod';
import { factsSchema, siteDocSchema } from '@chub/shared/data/schemas';
import { factsLoaded, setFacts } from '../data/facts';
import { setDocs } from '../content/docs';
import { apiJson } from './api';

const sitePayloadSchema = z.object({ facts: factsSchema, docs: z.array(siteDocSchema) });

/** GET /api/kb/site, zod-parse, then setFacts + setDocs. Throws on a network error, a non-2xx or a parse failure. */
export async function loadKb(): Promise<void> {
  const raw = await apiJson<unknown>('/kb/site');
  // Parse everything before writing either registry, so a bad payload never leaves a partial load.
  const payload = sitePayloadSchema.parse(raw);
  setFacts(payload.facts);
  setDocs(payload.docs);
}

export function isKbLoaded(): boolean {
  return factsLoaded();
}
