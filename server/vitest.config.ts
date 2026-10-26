import { defineConfig } from 'vitest/config';
import { testEnv } from './src/__tests__/testEnv';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/__tests__/**/*.test.ts'],
    env: testEnv,
    fileParallelism: false,
    globalSetup: ['./src/__tests__/globalSetup.ts'],
  },
});
