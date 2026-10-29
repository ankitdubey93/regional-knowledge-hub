// Settings for the Playwright suite's own API and web app. Not secrets: local Docker credentials and throwaway keys.
export const WEB = 'http://localhost:5192';
export const API = 'http://localhost:5193';
export const E2E_ENV: Record<string, string> = {
  NODE_ENV: 'test',
  PORT: '5193',
  DATABASE_URL: 'postgres://chub_app:chub_app@localhost:5437/chub_e2e',
  DATABASE_ADMIN_URL: 'postgres://chub:chub@localhost:5437/chub_e2e',
  BETTER_AUTH_SECRET: 'e2e-secret-e2e-secret-e2e-secret-00000',
  BETTER_AUTH_URL: API,
  WEB_ORIGIN: WEB,
  DATA_ENCRYPTION_KEY: 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=',
  REQUIRE_EMAIL_VERIFICATION: 'off',
  // Empty keys turn both providers off, so no test reaches an AI provider (Hard rule 15).
  ANTHROPIC_API_KEY: '',
  GEMINI_API_KEY: '',
};
