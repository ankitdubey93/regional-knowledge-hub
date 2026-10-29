import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { APIError } from 'better-auth/api';
import { admin, organization } from 'better-auth/plugins';
import { adminAc, userAc } from 'better-auth/plugins/admin/access';
import { createHash } from 'node:crypto';
import { db } from './db/client';
import * as schema from './db/schema';
import { env } from './env';
import { sendMail } from './mail/mailer';
import { invitation, resetPassword, verifyEmail } from './mail/templates';
import { consume, LIMITS } from './services/rateLimitService';
import { workspaceKindSchema } from './types';

// A workspace is a Better Auth organization with a kind ('business' or 'practice', fixed at create); roles are owner, admin, member.
// Email (P5b): verification follows REQUIRE_EMAIL_VERIFICATION (off only in tests and e2e). Links are built by Better Auth and point at the API, which redirects to the web.
const verify = env.REQUIRE_EMAIL_VERIFICATION === 'on';

export const auth = betterAuth({
  baseURL: env.BETTER_AUTH_URL,
  basePath: '/api/auth',
  secret: env.BETTER_AUTH_SECRET,
  trustedOrigins: [env.WEB_ORIGIN],
  database: drizzleAdapter(db, { provider: 'pg', schema }),
  rateLimit: {
    enabled: env.RATE_LIMITS === 'on',
    window: LIMITS.authDefault.window,
    max: LIMITS.authDefault.max,
    customRules: { '/sign-in/email': LIMITS.signIn, '/sign-up/email': LIMITS.signUp, '/request-password-reset': LIMITS.passwordReset, '/send-verification-email': LIMITS.passwordReset },
    // Better Auth's key contains the IP, so it is hashed before it is stored.
    customStorage: { consume: (key, rule) => consume(`auth:${createHash('sha256').update(key).digest('hex').slice(0, 32)}`, rule) },
  },
  advanced: { ipAddress: { ipAddressHeaders: ['x-forwarded-for'] } },
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    requireEmailVerification: verify,
    resetPasswordTokenExpiresIn: 3600,
    sendResetPassword: async ({ user, url }) => sendMail({ to: user.email, ...resetPassword(url) }),
  },
  emailVerification: {
    sendOnSignUp: verify,
    sendOnSignIn: verify,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => sendMail({ to: user.email, ...verifyEmail(url) }),
  },
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
      requireEmailVerificationOnInvitation: verify,
      sendInvitationEmail: async (data) =>
        sendMail({ to: data.email, ...invitation(data.organization.name, data.inviter.user.name, `${env.WEB_ORIGIN}/accept-invitation/${data.id}`) }),
    }),
    // Platform admin (one for now, see migration 0007): a role on the user, separate from workspace roles. Promoted only by scripts/admin-role.ts.
    admin({ roles: { user: userAc, platform_admin: adminAc }, adminRoles: ['platform_admin'], defaultRole: 'user' }),
  ],
});
