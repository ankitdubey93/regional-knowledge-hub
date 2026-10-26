import { z } from 'zod';

// The only reader of process.env in the server (CLAUDE.md Hard rule 10).
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(5191),
  DATABASE_URL: z.url(),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.url(),
  WEB_ORIGIN: z.url(),
  // An empty string in .env counts as unset. Server-only (Hard rule 10): sent in a header, never in a URL, never logged.
  GEMINI_API_KEY: z.string().optional().transform((v) => (v ? v : undefined)),
  GEMINI_EMBED_MODEL: z.string().optional().transform((v) => (v ? v : 'gemini-embedding-001')),
});

export const env = schema.parse(process.env);
