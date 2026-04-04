import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/__tests__/**/*.test.ts'],
    coverage: {
      enabled: true,
      provider: 'v8',
      reporter: ['text'],
      include: ['src/lib/engine/**', 'src/lib/providers/**', 'src/lib/integrations/**', 'src/lib/crypto.ts', 'src/lib/rate-limit.ts', 'src/lib/config.ts', 'src/lib/logger.ts'],
    },
  },
});
