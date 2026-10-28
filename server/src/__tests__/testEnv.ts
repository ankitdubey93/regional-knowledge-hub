// Test-only settings. Not secrets: local Docker credentials and a throwaway auth secret.
export const testEnv = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgres://chub_app:chub_app@localhost:5437/chub_test',
  DATABASE_ADMIN_URL: 'postgres://chub:chub@localhost:5437/chub_test',
  BETTER_AUTH_SECRET: 'test-secret-test-secret-test-secret-0000',
  BETTER_AUTH_URL: 'http://localhost:5191',
  WEB_ORIGIN: 'http://localhost:5190',
  DATA_ENCRYPTION_KEY: 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=',
};
