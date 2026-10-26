import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { organization } from 'better-auth/plugins';
import { db } from './db/client';
import * as schema from './db/schema';
import { env } from './env';

// A firm is a Better Auth organization; roles are owner, admin, member.
// Email verification is off until P5 adds SMTP (engineering/roadmap.md, "Owed").
export const auth = betterAuth({
  baseURL: env.BETTER_AUTH_URL,
  basePath: '/api/auth',
  secret: env.BETTER_AUTH_SECRET,
  trustedOrigins: [env.WEB_ORIGIN],
  database: drizzleAdapter(db, { provider: 'pg', schema }),
  emailAndPassword: { enabled: true, minPasswordLength: 8, requireEmailVerification: false },
  plugins: [organization()],
});
