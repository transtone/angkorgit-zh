import { defineConfig } from 'vitest/config';
import fs from 'node:fs';
import path from 'node:path';

export default defineConfig({
  resolve: {
    // Match desktop Vite aliases so tests do not depend on workspace hoisting.
    alias: {
      '@angkorgit/core': path.resolve(__dirname, 'packages/core/src/index.ts'),
      '@angkorgit/design-system': path.resolve(__dirname, 'packages/design-system/src/index.ts'),
      '@': path.resolve(__dirname, 'apps/desktop/src'),
      'highlight.js': path.resolve(
        __dirname,
        fs.existsSync(path.resolve(__dirname, 'apps/desktop/node_modules/highlight.js'))
          ? 'apps/desktop/node_modules/highlight.js'
          : 'node_modules/highlight.js',
      ),
    },
  },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
});
