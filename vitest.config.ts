import { defineConfig } from 'vitest/config';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const desktopRequire = createRequire(path.resolve(__dirname, 'apps/desktop/package.json'));

export default defineConfig({
  resolve: {
    // Match desktop Vite aliases so tests do not depend on workspace hoisting.
    alias: {
      react: path.dirname(desktopRequire.resolve('react/package.json')),
      'react-dom': path.dirname(desktopRequire.resolve('react-dom/package.json')),
      sonner: desktopRequire.resolve('sonner'),
      '@tauri-apps/plugin-updater': desktopRequire.resolve('@tauri-apps/plugin-updater'),
      '@tauri-apps/plugin-process': desktopRequire.resolve('@tauri-apps/plugin-process'),
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
