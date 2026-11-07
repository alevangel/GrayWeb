import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['src/shared/**/*.ts'],
      thresholds: {
        'src/shared/rules/**': { lines: 95, functions: 95, branches: 90, statements: 95 },
      },
    },
  },
});
