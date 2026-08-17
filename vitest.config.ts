import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
    // Integration tests share one real Postgres database (DATABASE_URL);
    // running test files in parallel races each other's TRUNCATE/insert
    // fixtures against the same tables, so files run sequentially.
    fileParallelism: false,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
