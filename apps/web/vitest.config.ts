import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts', 'test/**/*.test.tsx'],
    passWithNoTests: true,
    // `server-only` is a Next.js runtime marker; under vitest it
    // doesn't resolve because we're not in the Next bundler. Alias it
    // to an empty stub so unit-testing server-side modules works.
    alias: {
      'server-only': path.resolve(__dirname, 'test/stubs/server-only.ts'),
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
});
