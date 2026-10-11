import { defineConfig, type Plugin } from 'vitest/config';

/**
 * Unit tests cover pure functions only. Fail fast if a test's import graph
 * reaches native or network modules instead of mocking them.
 */
function forbidImpureModules(): Plugin {
  const forbidden = /^@(capacitor|supabase)\//;
  return {
    name: 'forbid-impure-modules',
    enforce: 'pre',
    resolveId(source, importer) {
      if (forbidden.test(source)) {
        throw new Error(
          `${importer ?? 'a test'} imports ${source}. Unit tests must only import pure modules.`
        );
      }
      return null;
    },
  };
}

export default defineConfig({
  plugins: [forbidImpureModules()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
