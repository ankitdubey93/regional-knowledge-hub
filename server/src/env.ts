import { z } from 'zod';

// The only reader of process.env in the server (CLAUDE.md Hard rule 10).
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(5191),
  DATABASE_URL: z.url(),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.url(),
  WEB_ORIGIN: z.url(),
});

export const env = schema.parse(process.env);
