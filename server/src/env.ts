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
  // Chat (P3). Same rules: server-only, keys only in headers, never logged.
  ANTHROPIC_API_KEY: z.string().optional().transform((v) => (v ? v : undefined)),
  ANTHROPIC_MODEL: z.string().optional().transform((v) => (v ? v : 'claude-opus-5-5')),
  GEMINI_MODEL: z.string().optional().transform((v) => (v ? v : undefined)),
  CHAT_PROVIDER: z.enum(['anthropic', 'gemini']).default('anthropic'),
  DAILY_SPEND_CAP_USD: z.string().regex(/^\d{1,6}(\.\d{1,2})?$/).default('5'),
  CHAT_DAILY_MESSAGES_PER_USER: z.coerce.number().int().positive().default(50),
  // P4: seals stored uploads and each conversation's redaction map. Base64 of exactly 32 bytes. Never logged.
  DATA_ENCRYPTION_KEY: z
    .string()
    .transform((v) => Buffer.from(v, 'base64'))
    .refine((b) => b.length === 32, 'DATA_ENCRYPTION_KEY must be base64 of 32 bytes (openssl rand -base64 32)'),
  // P5a: rate limits. Off only in tests (testEnv). TRUST_PROXY_HOPS = trusted reverse-proxy hops in front of the API.
  RATE_LIMITS: z.enum(['on', 'off']).default('on'),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),
});

export const env = schema.parse(process.env);
