import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'shared',
          root: './packages/shared',
          environment: 'node',
          include: ['src/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'api',
          root: './apps/api',
          environment: 'node',
          include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
          globalSetup: ['./test/globalSetup.ts'],
          testTimeout: 30_000,
          hookTimeout: 120_000,
        },
      },
      './apps/web/vite.config.ts',
    ],
  },
});
