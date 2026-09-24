import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    setupFiles: ['dotenv/config'],
    globalSetup: ['./test/global-setup.ts'],
    // Both suites share one test database; run them one after the other.
    fileParallelism: false,
    root: './',
    include: ['**/*.e2e-spec.ts'],
  },
});
