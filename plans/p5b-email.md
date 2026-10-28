# Plan: P5b email (verification, password reset, invitations)

Date: 2026-10-28
Status: not started (gated on `plans/p5a-rate-limits.md`)

Source: the approved roadmap plan, Stage 2 P5b, which the Practice track moved ahead of C2.

Outcome: the API sends email over SMTP. New accounts verify their address, users can reset a forgotten password, and an owner or admin can invite people to a workspace by email. In development, mail goes to a local Mailpit container.

## Dispatch: read this before executing anything

You are executing this plan as **one tier only**. Your tier is the one named in the request
(`[Haiku]` or `[Sonnet]`). Then:

1. Work **down the dispatch manifest in step order**. If the request names a batch, run only
   that batch's steps. Do not reorder steps to group tiers.
2. Run a step only if its tier matches yours **and** every step in its `Depends on`
   is marked `done` in the manifest. Otherwise stop and report the blocking step.
3. When the next `todo` step carries the **other** tier, stop and report:
   "Step N is [other tier]: switch model and resume." Do not run it because it looks small.
4. After a step's proof command passes, set its `Status` to `done` in the manifest in the
   same edit session. That column is the only record of progress.
   (Under `plan-execute`, the orchestrator owns the manifest; runners do not edit it.)
5. If a proof fails twice, stop and report per Execution rules. Never weaken a test,
   a type, an assertion or a guardrail to get a step through, and never `npm install`
   anything the step did not name.
6. Anything this plan did not anticipate is a stop-and-report, not a judgment call.

## Starting state (verified 2026-10-28; P5a assumed landed)

- `server/src/auth.ts`:
  - `emailAndPassword: { enabled: true, minPasswordLength: 8, requireEmailVerification: false }`.
  - No `emailVerification` block.
  - The `organization()` plugin has no `sendInvitationEmail`.
- `.env.example` already has an empty `SMTP_URL=` under `# Phase P5`. `server/src/env.ts` does not read it yet.
- `docker-compose.yml` has one service, `db` (`chub-db`, host port 5437).
  - Host port 8025 is **taken** on this machine.
  - Mailpit uses host 5438 (SMTP) and 5439 (web UI).
- `dev.sh` creates `.env` from `.env.example` when missing, filling the two secrets with `sed -i.bak`.
- Web:
  - `client/src/pages/auth/SignIn.tsx` and `SignUp.tsx` exist. Routes `sign-in` and `sign-up` are at `client/src/App.tsx:80-81`.
  - There is **no members page and no invitation UI**. Workspace roles are `owner`, `admin`, `member` (Better Auth organization).
  - The web calls Better Auth endpoints with plain `fetch` (`client/src/lib/session.ts`).
- Server test helper `signUp()` (`server/src/__tests__/helpers.ts`) expects a session cookie straight after sign-up, so verification must stay off in tests.
- Registry checks on 2026-10-28:
  - `nodemailer` 10.0.16, published 2026-10-07; the newer 10.1.x/10.2.x are under two weeks old.
  - `@types/nodemailer` 8.0.2, published 2026-09-15.
  - Docker image `axllent/mailpit:v1.31.5`, published 2026-10-11.

## Gate

Platform P5, slice b. It needs P5a, so that `/request-password-reset` and sign-up are already rate-limited before they can send mail. C3 needs this plan.

## Execution rules

**If a proof command fails twice on the same step, stop and report. Do not improvise around it.**

| Symptom | Forbidden | Correct |
|---|---|---|
| Server tests fail because sign-up no longer returns a session | Turning verification off globally in code | `REQUIRE_EMAIL_VERIFICATION: 'off'` in `testEnv` only |
| Need to see a mail in a test | A real SMTP server | `setTransportForTests` (in-memory) (Hard rule 15) |
| Debug output | Logging a mail body, a link or a token | Log `{ to-domain, template, ok }` only (Hard rule 13) |
| A Better Auth endpoint path differs from this plan | Guessing another path | Stop and report |
| `npm install` of a version other than the one named | Installing it | Stop and report (Hard rule 9) |
| `[Haiku]` proof fails twice | Retrying, trimming | Escalate unchanged to Sonnet |

**Anything the plan didn't anticipate is a stop-and-report, not a judgment call.**

## Decisions fixed at plan time

- **Dependency.** `nodemailer` 10.0.16, exact, `-w server`. Add `@types/nodemailer` 8.0.2 as a dev dependency, but only if `node_modules/nodemailer` ships no `.d.ts`.
  - Reason for `architecture.md`: "SMTP is a protocol with TLS, auth and MIME encoding; nodemailer is the standard Node implementation with no runtime dependencies. Writing our own would be a larger security surface."
- **Env.**
  - `SMTP_URL` (optional, `smtp://` or `smtps://` URL).
  - `MAIL_FROM` (an email address, required when `SMTP_URL` is set).
  - `REQUIRE_EMAIL_VERIFICATION` (`on` | `off`, default `on`).
  - Validation: if `REQUIRE_EMAIL_VERIFICATION === 'on'` and `SMTP_URL` is unset, `env` fails to parse with the message `REQUIRE_EMAIL_VERIFICATION is on but SMTP_URL is not set`.
- **Development** uses Mailpit (a Compose service, not an npm dependency). `.env.example` gets `SMTP_URL=smtp://localhost:5438` and `MAIL_FROM=no-reply@compliance-hub.local`.
- **Tests** set `REQUIRE_EMAIL_VERIFICATION: 'off'` and swap the transport for an in-memory one.
- **Mail bodies are plain text only.** No HTML, no tracking pixels, no images (Hard rule 9: no tracking).
- **Links** point at `env.WEB_ORIGIN` pages. The pages call the Better Auth endpoints.
- **Roles.** Inviting needs `owner` or `admin`. Better Auth's organization plugin enforces this. Our web hides the form from members.

**Names: use exactly these, do not rename**

| Kind | Name |
|---|---|
| Mailer | `server/src/mail/mailer.ts` → `sendMail(msg: MailMessage): Promise<void>`, `setTransportForTests(t: TestTransport \| null)`, `type MailMessage = { to: string; subject: string; text: string; template: MailTemplate }` |
| Templates | `server/src/mail/templates.ts` → `type MailTemplate = 'verify' \| 'reset' \| 'invite'`, `verifyEmail(url)`, `resetPassword(url)`, `invitation(workspaceName, inviterName, url)`; each returns `{ subject, text, template }` |
| Compose service | `mail` (`chub-mail`), image `axllent/mailpit:v1.31.5`, ports `5438:1025`, `5439:8025` |
| Web pages | `client/src/pages/auth/ForgotPassword.tsx` (`ForgotPassword`), `ResetPassword.tsx` (`ResetPassword`), `CheckEmail.tsx` (`CheckEmail`), `client/src/pages/workspace/Members.tsx` (`Members`), `client/src/pages/auth/AcceptInvitation.tsx` (`AcceptInvitation`) |
| Routes | `forgot-password`, `reset-password`, `check-email`, `workspace/members`, `accept-invitation/:id` |
| Web lib | `client/src/lib/members.ts` → `listMembers()`, `inviteMember(email, role)`, `acceptInvitation(id)` |
| Server test | `server/src/__tests__/email.test.ts` |
| Web test | `client/src/__tests__/email-pages.test.tsx` |

## Slice 1: sending mail

### Step 1: [Sonnet] Re-verify the starting state and the Better Auth endpoints

- **Model:** [Sonnet]: diagnosis against a library's real paths
- **Depends on:** none
- **Skill:** none
- **Read first:** Starting state
- **Files:** none
- **Contract:** Confirm the Starting state. Then confirm that the endpoint paths exist in better-auth 1.7.13:
  ```bash
  grep -rhoE '"/(request-password-reset|reset-password|send-verification-email|verify-email|organization/invite-member|organization/accept-invitation|organization/list-members|organization/get-invitation)"' server/node_modules/better-auth/dist | sort -u
  ```
  Also report the parameter names of `sendVerificationEmail`, `sendResetPassword` and the organization `sendInvitationEmail` from the `.d.mts` files.
- **Guardrails:** none
- **Proof:** all 8 paths are printed, and the three callback signatures are reported.
- **If it fails:** if a path is missing, stop and report it.
- **Owes:** nothing

### Step 2: [Sonnet] Dependency, Mailpit and env

- **Model:** [Sonnet]: installs a dependency and changes env validation
- **Depends on:** Step 1
- **Skill:** none
- **Read first:** `server/src/env.ts`; `docker-compose.yml`; `dev.sh`, lines 30–45
- **Files:**
  - `server/package.json` (via npm)
  - `package-lock.json`
  - `docker-compose.yml` (edit: add `mail`)
  - `server/src/env.ts` (edit)
  - `server/src/__tests__/testEnv.ts` (edit: `REQUIRE_EMAIL_VERIFICATION: 'off'`)
  - `.env.example` (edit)
  - `dev.sh` (edit: change `docker compose up -d --wait db` to `docker compose up -d --wait db mail`)
- **Contract:**
  - Run `npm install -w server --save-exact nodemailer@10.0.16`.
  - If `ls server/node_modules/nodemailer/lib/*.d.ts node_modules/nodemailer/lib/*.d.ts 2>/dev/null` prints nothing, also run `npm install -w server --save-dev --save-exact @types/nodemailer@8.0.2`.
  - Compose:
    ```yaml
      mail:
        image: axllent/mailpit:v1.31.5
        container_name: chub-mail
        ports:
          - "5438:1025"
          - "5439:8025"
    ```
  - Env additions:
    ```ts
    SMTP_URL: z.string().optional().transform((v) => (v ? v : undefined)).pipe(z.url().optional()),
    MAIL_FROM: z.string().optional().transform((v) => (v ? v : undefined)).pipe(z.email().optional()),
    REQUIRE_EMAIL_VERIFICATION: z.enum(['on', 'off']).default('on'),
    ```
  - Add `.superRefine` on the object to enforce the two rules from Decisions.
  - In `.env.example`, replace `SMTP_URL=` with:
    ```
    # Mail. In development, Mailpit (docker compose service "mail") catches everything: web UI at http://localhost:5439
    SMTP_URL=smtp://localhost:5438
    MAIL_FROM=no-reply@compliance-hub.local
    REQUIRE_EMAIL_VERIFICATION=on
    ```
  - Add the three lines to the developer's existing `.env` only if they are missing. Tell the user in the report; never print secrets.
- **Guardrails:** Hard rule 9 (exact version; the reason is written in Step 13) · Hard rule 10
- **Proof:**
  - `docker compose up -d --wait mail && curl -s -o /dev/null -w '%{http_code}' http://localhost:5439` prints `200`.
  - `npm run typecheck -w server` exits 0.
- **If it fails:** if a port is taken, stop and report. Don't pick another port yourself.
- **Owes:** the `architecture.md` dependency reason, env names and ports, in Step 13

### Step 3: [Sonnet] Mailer and templates

- **Model:** [Sonnet]: outbound PII and secrets in links
- **Depends on:** Step 2
- **Skill:** none
- **Read first:** `node_modules/nodemailer` types (`createTransport`, `sendMail`)
- **Files:** `server/src/mail/mailer.ts` (new); `server/src/mail/templates.ts` (new)
- **Contract:**
  - `mailer.ts`:
    - Create one transport lazily with `createTransport(env.SMTP_URL)`.
    - `sendMail` sends `{ from: env.MAIL_FROM, to, subject, text }`.
    - When a test transport is set, push the message to it instead: `type TestTransport = { sent: MailMessage[] }`.
    - When `SMTP_URL` is unset and no test transport is set, throw `new Error('Email is not configured')`.
    - Log only `console.info('mail', { template: msg.template, domain: msg.to.split('@')[1], ok })`.
  - `templates.ts`, exact text:
    - `verifyEmail(url)`:
      - subject: `Confirm your email for Compliance Hub`
      - text: `Confirm your email address by opening this link:\n\n${url}\n\nIf you did not sign up, ignore this email.`
    - `resetPassword(url)`:
      - subject: `Reset your Compliance Hub password`
      - text: `Someone asked to reset the password for this email address. To choose a new password, open this link within the next hour:\n\n${url}\n\nIf it was not you, ignore this email; your password has not changed.`
    - `invitation(workspaceName, inviterName, url)`:
      - subject: `${inviterName} invited you to ${workspaceName} on Compliance Hub`
      - text: `${inviterName} invited you to join ${workspaceName} on Compliance Hub.\n\nTo accept, open this link and sign in or create an account with this email address:\n\n${url}\n\nIf you were not expecting this, ignore this email.`
- **Guardrails:** Hard rule 13 (no body, link or token in logs) · Hard rule 15
- **Proof:** `npm run typecheck -w server` exits 0, and `grep -n "console" server/src/mail/mailer.ts` shows exactly one line, the `info` above.
- **If it fails:** fix the type.
- **Owes:** nothing

## Slice 2: Better Auth wiring

### Step 4: [Sonnet] Verification, reset and invitation callbacks

- **Model:** [Sonnet]: auth configuration
- **Depends on:** Step 3
- **Skill:** none
- **Read first:** `server/src/auth.ts`; the signatures reported in Step 1
- **Files:** `server/src/auth.ts` (edit)
- **Contract:**
  ```ts
  emailAndPassword: {
    enabled: true, minPasswordLength: 8,
    requireEmailVerification: env.REQUIRE_EMAIL_VERIFICATION === 'on',
    resetPasswordTokenExpiresIn: 3600,
    sendResetPassword: async ({ user, url }) => sendMail({ to: user.email, ...resetPassword(url) }),
  },
  emailVerification: {
    sendOnSignUp: env.REQUIRE_EMAIL_VERIFICATION === 'on',
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => sendMail({ to: user.email, ...verifyEmail(url) }),
  },
  ```
  - In `organization({...})` add:
    ```ts
    sendInvitationEmail: async (data) =>
      sendMail({ to: data.email, ...invitation(data.organization.name, data.inviter.user.name, `${env.WEB_ORIGIN}/accept-invitation/${data.id}`) }),
    ```
    Use the field names Step 1 reported. If they differ from `data.email`, `data.organization.name`, `data.inviter.user.name` or `data.id`, use the reported names and record them in the report.
  - `url` for reset: the web passes `redirectTo: `${WEB_ORIGIN}/reset-password`` in the request. Better Auth builds the link.
  - Remove the comment line `// Email verification is off until P5 adds SMTP …`.
- **Guardrails:** Hard rule 10 · Hard rule 13
- **Proof:** `npm run typecheck -w server` exits 0, and the full `npm run test:server` passes with the same count (verification is off in tests).
- **If it fails:** stop if the types reject a field name.
- **Owes:** nothing

### Step 5: [Sonnet] Email tests

- **Model:** [Sonnet]: auth flows against real Postgres
- **Depends on:** Step 4
- **Skill:** none
- **Read first:** `server/src/__tests__/helpers.ts`; `server/src/__tests__/workspaces.test.ts` (creating a workspace in tests)
- **Files:** `server/src/__tests__/email.test.ts` (new)
- **Contract:**
  - `beforeEach(() => setTransportForTests(outbox = { sent: [] }))`; `afterEach(() => setTransportForTests(null))`.
  - Tests:
    - `'password reset sends one mail with a link to the web page'`: POST `/api/auth/request-password-reset` with `{ email, redirectTo: 'http://localhost:5190/reset-password' }` → 200. `outbox.sent.length === 1`; `template === 'reset'`; the text contains `token=` or `/reset-password`.
    - `'reset with the emailed token changes the password'`: extract the token from the link, POST `/api/auth/reset-password` `{ newPassword: 'another-horse-9', token }` → 200. Sign-in with the new password → 200.
    - `'reset for an unknown email sends nothing and still answers 200'`: `outbox.sent.length === 0`, and the status is 200.
    - `'an owner can invite and the invitee gets a mail'`: an owner creates a practice, then POSTs `/api/auth/organization/invite-member` `{ email: invitee, role: 'member' }` → 200. One mail with `template === 'invite'` and the text contains `/accept-invitation/`.
    - `'a member cannot invite'`: a member POSTs `invite-member` → 403 (or Better Auth's forbidden status; assert `>= 400` and no mail sent).
    - `'accepting adds the member'`: the invitee signs up with the invited email, then POSTs `/api/auth/organization/accept-invitation` `{ invitationId }` → 200. The owner's `list-members` includes the invitee.
    - `'verification mail on sign-up when required'`: covered by the unit test of `verifyEmail` template text only, because the env is fixed per process. Assert the subject and that the url is included.
    - `'mail logs never include the body'`: spy on `console.info` during the reset test. No logged argument contains `token` or `http`.
- **Guardrails:** Hard rule 15 · Hard rule 11 (invite only within the inviter's own workspace)
- **Proof:** `npm run test:server -- email` shows 8 passed, and the full server suite passes.
- **If it fails:** fix the code; never loosen the 'member cannot invite' case.
- **Owes:** the server count, in Step 13

## Slice 3: web pages

### Step 6: [Haiku] Members lib

- **Model:** [Haiku]: thin fetch wrappers, specified
- **Depends on:** Step 4
- **Skill:** none
- **Read first:** `client/src/lib/session.ts` (how Better Auth is called with `fetch`)
- **Files:** `client/src/lib/members.ts` (new)
- **Contract:**
  ```ts
  export interface MemberRow { id: string; userId: string; role: 'owner' | 'admin' | 'member'; name: string; email: string }
  export async function listMembers(): Promise<MemberRow[]>;           // GET /api/auth/organization/list-members → body.members mapped to MemberRow (name/email from member.user)
  export async function inviteMember(email: string, role: 'admin' | 'member'): Promise<void>; // POST /api/auth/organization/invite-member
  export async function acceptInvitation(id: string): Promise<void>;  // POST /api/auth/organization/accept-invitation { invitationId: id }
  export async function requestPasswordReset(email: string): Promise<void>; // POST /api/auth/request-password-reset { email, redirectTo: `${location.origin}/reset-password` }
  export async function resetPassword(token: string, newPassword: string): Promise<void>; // POST /api/auth/reset-password
  ```
  - Every call uses `credentials: 'include'`.
  - A non-OK response throws `await failure(res)` from `./api`.
- **Guardrails:** Hard rule 10 (no keys)
- **Proof:** `npm run typecheck -w client` exits 0.
- **If it fails:** fix the type.
- **Owes:** nothing

### Step 7: [Haiku] Forgot, reset and check-email pages

- **Model:** [Haiku]: forms with all labels given
- **Depends on:** Step 6
- **Skill:** none
- **Read first:** `client/src/pages/auth/SignIn.tsx` (form layout to copy)
- **Files:**
  - `ForgotPassword.tsx` (new), `ResetPassword.tsx` (new), `CheckEmail.tsx` (new), all in `client/src/pages/auth/`
  - `SignIn.tsx` (edit)
  - `SignUp.tsx` (edit)
  - `client/src/App.tsx` (edit)
- **Contract:**
  - **`ForgotPassword`**:
    - `PageHeader title="Reset your password"`.
    - `Field label="Email"` with `type="email"` and `required`.
    - `Button type="submit"`: `Send reset link`.
    - After submit, always show `<p role="status">If an account uses that address, a reset link is on its way.</p>`.
  - **`ResetPassword`**:
    - Reads `token` from the query.
    - Without a token: `<p role="alert">This reset link is incomplete. Ask for a new one.</p>` plus `TextLink to="/forgot-password"` `Ask for a new link`.
    - Otherwise `Field label="New password"` (`type="password"`, `minLength={8}`) and `Button`: `Set new password`.
    - On success, navigate to `/sign-in?reset=1`.
    - On `ApiError`, show `role="alert"` with its message.
  - **`CheckEmail`**: `PageHeader title="Check your email"`, `lead="We sent a link to confirm your address. Open it to finish signing up."`.
  - **`SignIn`**:
    - Under the password field, add `TextLink to="/forgot-password"`: `Forgot your password?`.
    - When the query has `reset=1`, show `<p role="status">Password changed. Sign in with the new one.</p>`.
  - **`SignUp`**: when the sign-up response has no session (verification required), navigate to `/check-email` instead of `/workspace`. Read how `SignUp` detects success today, and branch on `body.token == null`.
  - **`App.tsx`**: add the three `page()` imports and the routes `forgot-password`, `reset-password` and `check-email` next to `sign-up`.
- **Guardrails:** Hard rule 7 (labels on every control)
- **Proof:** `npm run typecheck -w client && npm run lint` exit 0.
- **If it fails:** fix the code.
- **Owes:** nothing

### Step 8: [Haiku] Members and accept pages

- **Model:** [Haiku]: page layout and labels given
- **Depends on:** Step 6
- **Skill:** none
- **Read first:**
  - `client/src/pages/workspace/WorkspaceHome.tsx`: the role is available from `useSessionInfo()`. Read `client/src/lib/session.ts` to find the field; if it has no role, call `listMembers()` and find the current user's row.
  - `client/src/components/ui.tsx`.
- **Files:**
  - `client/src/pages/workspace/Members.tsx` (new)
  - `client/src/pages/auth/AcceptInvitation.tsx` (new)
  - `client/src/App.tsx` (edit: routes `workspace/members` and `accept-invitation/:id`)
  - `client/src/pages/workspace/WorkspaceHome.tsx` (edit: in its `PageHeader` children, add `TextLink to="/workspace/members"`: `Members`)
- **Contract:**
  - **`Members`**:
    - `PageHeader title="Members"`.
    - A `TableScroll` table with headers `Name`, `Email`, `Role`.
    - If the current user is `owner` or `admin`, show a `Card` with `<h2>Invite someone</h2>`:
      - `Field label="Email"` (`type="email"`, required).
      - `Field label="Role"`: a select with `member` (`Member`) and `admin` (`Admin`).
      - `Button`: `Send invitation`.
      - On success: `<p role="status">Invitation sent to {email}.</p>`. On error: `role="alert"`.
  - **`AcceptInvitation`**:
    - If signed out: `<p>Sign in or create an account with the invited email address, then open this link again.</p>`, with `TextLink`s to `/sign-in` and `/sign-up`.
    - If signed in: `Button`: `Join workspace`. On success, navigate to `/workspace`. On error, `role="alert"` with the message.
- **Guardrails:** Hard rule 7
- **Proof:** `npm run typecheck -w client && npm run lint` exit 0.
- **If it fails:** fix the code.
- **Owes:** nothing

### Step 9: [Haiku] Web tests

- **Model:** [Haiku]: cases listed
- **Depends on:** Steps 7, 8
- **Skill:** none
- **Read first:** `client/src/__tests__/account.test.tsx`
- **Files:** `client/src/__tests__/email-pages.test.tsx` (new)
- **Contract:**
  - `'forgot password never says whether the account exists'`: a fetch stub returns 200, and after submit the status text is shown.
  - `'reset page without a token asks for a new link'`.
  - `'reset success goes to sign-in with a notice'`.
  - `'members page hides the invite form from a member'`.
  - `'an admin can send an invitation'`: expect a POST to `/api/auth/organization/invite-member` with `{ email, role: 'member' }` and the status text `Invitation sent to a@b.test.`.
  - `'accept page asks a signed-out user to sign in'`.
- **Guardrails:** Hard rule 15
- **Proof:** `npm run test:web -- email-pages` shows 6 passed.
- **If it fails:** fix the page.
- **Owes:** the web count, in Step 13

## Spine

### Step 10: [Sonnet] Manual Mailpit check

- **Model:** [Sonnet]: drives the real stack
- **Depends on:** Step 9
- **Skill:** none
- **Read first:** none
- **Files:** none
- **Contract:**
  - With `./dev.sh` running: sign up a new address and confirm a mail appears in Mailpit (`curl -s http://localhost:5439/api/v1/messages | head -c 400`).
  - Open its link and confirm it lands on `/workspace` signed in.
  - Request a reset and confirm a second mail.
  - Report what you saw. Never print a full token.
- **Guardrails:** Hard rule 13
- **Proof:** report the two message subjects found in Mailpit.
- **If it fails:** stop and report.
- **Owes:** the CLAUDE.md line, in Step 13

### Step 11: [Sonnet] Browser check

- **Model:** [Sonnet]: layout judgment
- **Depends on:** Step 10
- **Skill:** none
- **Read first:** existing `e2e/` specs
- **Files:** `e2e/email-pages.spec.ts` (new)
- **Contract:**
  - Visit `/forgot-password`, `/reset-password?token=x`, `/check-email`, `/workspace/members` (as owner) and `/accept-invitation/abc` (signed out).
  - Check each at 375 and 1440 px, in light and dark: no overflow, no console errors, every form submit reachable by Tab.
  - The e2e server runs with `REQUIRE_EMAIL_VERIFICATION=off`, like the server tests. Set it in the e2e env the debt sprint created.
- **Guardrails:** Hard rule 7
- **Proof:** `npm run test:e2e -- email-pages` passes.
- **If it fails:** fix the layout.
- **Owes:** nothing

### Step 12: [Sonnet] Guardrail review

- **Model:** [Sonnet]: review
- **Depends on:** Step 11
- **Skill:** none
- **Read first:** CLAUDE.md, Hard rules
- **Files:** none
- **Contract:**
  - Rules 1–16 over `git diff main`.
  - Explicitly check: rule 9 (only nodemailer added, exact, reason written), rule 10, rule 13 (log lines) and rule 15.
- **Guardrails:** all
- **Proof:** a 16-line report, clean.
- **If it fails:** fix it, or stop.
- **Owes:** nothing

### Step 13: [Sonnet] Docs sync

- **Model:** [Sonnet]: docs that describe what landed
- **Depends on:** Step 12
- **Skill:** `content-sync`
- **Read first:** CLAUDE.md; `engineering/architecture.md`; `roadmap.md`; `testing.md`
- **Files:**
  - `CLAUDE.md` (State: "Platform P5b (date)"; remove "P1 ships with `requireEmailVerification: false`" from the roadmap's owed list)
  - `engineering/architecture.md` (the nodemailer reason, Mailpit, env names, ports 5438 and 5439)
  - `engineering/roadmap.md` (P5b → built)
  - `engineering/testing.md` (verification is off in tests and e2e)
- **Contract:** State the test counts as run and the Mailpit check result. Add: "Not checked: delivery through a real SMTP provider (SPF, DKIM)."
- **Guardrails:** Hard rule 2 wording
- **Proof:** `content-sync` is clean.
- **If it fails:** fix the docs.
- **Owes:** nothing

## Dispatch manifest

| Batch | Step | Tier | Title | Depends on | Blocks | Status |
|---|---|---|---|---|---|---|
| A | 1 | Sonnet | Re-verify state and endpoints | — | 2 | todo |
| A | 2 | Sonnet | Dependency, Mailpit, env | 1 | 3 | todo |
| A | 3 | Sonnet | Mailer and templates | 2 | 4 | todo |
| A | 4 | Sonnet | Better Auth callbacks | 3 | 5, 6 | todo |
| A | 5 | Sonnet | Email tests | 4 | 10 | todo |
| B | 6 | Haiku | Members lib | 4 | 7, 8 | todo |
| B | 7 | Haiku | Forgot, reset, check-email pages | 6 | 9 | todo |
| B | 8 | Haiku | Members and accept pages | 6 | 9 | todo |
| B | 9 | Haiku | Web tests | 7, 8 | 10 | todo |
| C | 10 | Sonnet | Manual Mailpit check | 5, 9 | 11 | todo |
| C | 11 | Sonnet | Browser check | 10 | 12 | todo |
| C | 12 | Sonnet | Guardrail review | 11 | 13 | todo |
| C | 13 | Sonnet | Docs sync | 12 | — | todo |

## Risks and open questions

- **Better Auth may build the reset link itself** with its own callback path. Step 1 and Step 5 confirm the shape, and the web reads `token` from the query either way.
- **Existing dev users have unverified emails.** With verification on, they cannot sign in until verified. Step 10's report says so, and the fix is the "resend verification" request (`/send-verification-email`). Do not mark existing users verified in SQL without the owner's go-ahead.
- **A production SMTP provider is the owner's choice** (Stage 3 / P5d).

## Definition of done

- Tests pass, with counts.
- Typecheck, lint and build are clean.
- The Mailpit check passed and e2e passes.
- The review is clean.
- The docs are synced.
- This plan file is deleted in the landing commit.
