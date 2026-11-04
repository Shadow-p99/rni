import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    root: './',
    include: ['test/**/*.e2e-spec.ts'],
    globalSetup: ['./test/global-setup.ts'],
    env: { NODE_ENV: 'test', RNI_MOCK_AUTH: 'true', RNI_MOCK_EXTERNAL: 'true', PG_DATABASE: process.env.PG_DATABASE ?? 'rni_e2e' },
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 60_000,
  },
});
