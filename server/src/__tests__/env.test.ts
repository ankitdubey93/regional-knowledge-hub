import { describe, expect, it } from 'vitest';
import { envSchema } from '../env';
import { testEnv } from './testEnv';

const K9 = Buffer.alloc(32, 9).toString('base64');

function messages(r: ReturnType<typeof envSchema.safeParse>): string[] {
  return r.success ? [] : r.error.issues.map((i) => i.message);
}

describe('env', () => {
  it('EV1 production refuses the development chub_app password', () => {
    const dev = { ...testEnv, NODE_ENV: 'production', DEPLOYMENT_REGION: 'AU', DATABASE_URL: 'postgres://chub_app:chub_app@db:5432/chub' };
    const r = envSchema.safeParse(dev);
    expect(r.success).toBe(false);
    expect(messages(r)).toContain('Set a real password for chub_app in production');
    expect(envSchema.safeParse({ ...dev, NODE_ENV: 'development' }).success).toBe(true);
    expect(envSchema.safeParse({ ...dev, DATABASE_URL: 'postgres://chub_app:s3cret@db:5432/chub' }).success).toBe(true);
  });

  it('EV4 production refuses a missing DEPLOYMENT_REGION', () => {
    const prod = { ...testEnv, NODE_ENV: 'production', DATABASE_URL: 'postgres://chub_app:s3cret@db:5432/chub' };
    const r = envSchema.safeParse(prod);
    expect(r.success).toBe(false);
    expect(!r.success && r.error.issues.some((i) => i.path[0] === 'DEPLOYMENT_REGION')).toBe(true);
    expect(envSchema.safeParse({ ...prod, DEPLOYMENT_REGION: 'AU' }).success).toBe(true);
  });

  it('EV5 DEPLOYMENT_REGION takes AU or UK only', () => {
    expect(envSchema.safeParse({ ...testEnv, DEPLOYMENT_REGION: 'UK' }).success).toBe(true);
    expect(envSchema.safeParse({ ...testEnv, DEPLOYMENT_REGION: 'EU' }).success).toBe(false);
  });

  it('EV2 a previous key needs version 2 or more', () => {
    const r = envSchema.safeParse({ ...testEnv, DATA_ENCRYPTION_KEY_PREVIOUS: K9 });
    expect(r.success).toBe(false);
    expect(messages(r)).toContain('DATA_ENCRYPTION_KEY_PREVIOUS needs DATA_ENCRYPTION_KEY_VERSION of 2 or more');
    const ok = envSchema.safeParse({ ...testEnv, DATA_ENCRYPTION_KEY_PREVIOUS: K9, DATA_ENCRYPTION_KEY_VERSION: '2' });
    expect(ok.success).toBe(true);
    if (ok.success) {
      expect(Buffer.isBuffer(ok.data.DATA_ENCRYPTION_KEY_PREVIOUS)).toBe(true);
      expect(ok.data.DATA_ENCRYPTION_KEY_PREVIOUS?.length).toBe(32);
    }
    const bad = envSchema.safeParse({ ...testEnv, DATA_ENCRYPTION_KEY_PREVIOUS: 'c2hvcnQ=', DATA_ENCRYPTION_KEY_VERSION: '2' });
    expect(bad.success).toBe(false);
    expect(messages(bad)).toContain('DATA_ENCRYPTION_KEY_PREVIOUS must be base64 of 32 bytes (openssl rand -base64 32)');
  });

  it('EV3 empty optional values count as unset', () => {
    const r = envSchema.safeParse({ ...testEnv, DATA_ENCRYPTION_KEY_PREVIOUS: '', WEB_DIST_DIR: '' });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.DATA_ENCRYPTION_KEY_PREVIOUS).toBeUndefined();
      expect(r.data.WEB_DIST_DIR).toBeUndefined();
      expect(r.data.DATA_ENCRYPTION_KEY_VERSION).toBe(1);
    }
  });

  it('EV3a an empty ANTHROPIC_INFERENCE_GEO means us; a bad value is refused', () => {
    const empty = envSchema.safeParse({ ...testEnv, ANTHROPIC_INFERENCE_GEO: '' });
    expect(empty.success).toBe(true);
    if (empty.success) expect(empty.data.ANTHROPIC_INFERENCE_GEO).toBe('us');
    const global = envSchema.safeParse({ ...testEnv, ANTHROPIC_INFERENCE_GEO: 'global' });
    expect(global.success).toBe(true);
    if (global.success) expect(global.data.ANTHROPIC_INFERENCE_GEO).toBe('global');
    expect(envSchema.safeParse({ ...testEnv, ANTHROPIC_INFERENCE_GEO: 'eu' }).success).toBe(false);
  });
});
