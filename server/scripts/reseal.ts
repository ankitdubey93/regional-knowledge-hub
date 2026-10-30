// Re-seals every sealed column under the current DATA_ENCRYPTION_KEY (P5d key rotation; engineering/operations.md). Safe to re-run.
import { pool } from '../src/db/client';
import { resealAll } from '../src/jobs/reseal';
import { envKeyring } from '../src/privacy/crypto';

try {
  console.log('reseal done', await resealAll(envKeyring()));
} finally {
  await pool.end();
}
