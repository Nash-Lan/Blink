import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    exclude: ['e2e/**', 'node_modules/**', 'dist/**'],
    // Windows sandbox temp files can race when forked workers transform shared imports.
    pool: 'threads',
    maxWorkers: 1,
    fileParallelism: false,
  },
});
