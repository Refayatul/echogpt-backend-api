import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    // .kilo/ holds agent scratch worktrees that contain their own copies of the
    // test files. Without this, vitest collects the duplicates and the suite
    // runs the same tests several times.
    exclude: ['**/node_modules/**', '**/dist/**', '.kilo/**'],
    // The e2e tests run against a separate database. These values are test
    // only and never used in production.
    env: {
      NODE_ENV: 'test',
      DATABASE_URL:
        'postgresql://echogpt:echogpt@localhost:5432/echogpt_test?schema=public',
      CORS_ORIGINS: '',
      ENCRYPTION_KEY: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
      JWT_ACCESS_SECRET: 'e2e-access-secret-at-least-32-characters-long',
      JWT_REFRESH_SECRET: 'e2e-refresh-secret-at-least-32-characters-long',
      JWT_ACCESS_TTL: '15m',
      JWT_REFRESH_TTL: '7d',
      ADMIN_EMAIL: 'admin@example.com',
      ADMIN_PASSWORD: 'e2e-admin-password',
      AI_MOCK_MODE: 'true',
    },
  },
});
