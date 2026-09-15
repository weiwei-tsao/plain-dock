import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(process.cwd(), 'src'),
    },
  },
  test: {
    exclude: ['**/node_modules/**', '**/.git/**', '**/.claude/**', '**/e2e/**'],
  },
});
