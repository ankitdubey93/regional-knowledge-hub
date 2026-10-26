import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { APIError } from 'better-auth/api';
import { organization } from 'better-auth/plugins';
import { db } from './db/client';
import * as schema from './db/schema';
import { env } from './env';
import { workspaceKindSchema } from './types';

// A workspace is a Better Auth organization with a kind ('business' or 'practice', fixed at create); roles are owner, admin, member.
// Email verification is off until P5 adds SMTP (engineering/roadmap.md, "Owed").
export const auth = betterAuth({
  baseURL: env.BETTER_AUTH_URL,
  basePath: '/api/auth',
  secret: env.BETTER_AUTH_SECRET,
  trustedOrigins: [env.WEB_ORIGIN],
  database: drizzleAdapter(db, { provider: 'pg', schema }),
  emailAndPassword: { enabled: true, minPasswordLength: 8, requireEmailVerification: false },
  plugins: [
    organization({
      schema: { organization: { additionalFields: { kind: { type: 'string', required: true, input: true } } } },
      organizationHooks: {
        beforeCreateOrganization: async ({ organization: org }) => {
          if (!workspaceKindSchema.safeParse(org.kind).success) {
            throw new APIError('BAD_REQUEST', { message: 'Workspace kind must be business or practice' });
          }
        },
        beforeUpdateOrganization: async ({ organization: org }) => {
          if ('kind' in org) throw new APIError('BAD_REQUEST', { message: 'A workspace kind cannot be changed' });
        },
      },
    }),
  ],
});
