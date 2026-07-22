import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    reporters: process.env.CI
      ? ['default', ['junit', { outputFile: 'reports/junit.xml' }]]
      : ['default'],
  },
});