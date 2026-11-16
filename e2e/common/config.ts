import { defineConfig } from 'vitest/config'

// API -------------------------------------------------------------------------
export function suiteConfig(
  root: string,
  options: { include?: string[]; exclude?: string[] } = {},
) {
  return defineConfig({
    test: {
      root,
      tags: [
        { name: 'extended', skip: process.env.DIFFLAB_E2E_EXTENDED !== 'true' },
        ...['e2e', 'smoke', 'app', 'cli', 'daemon', 'autospec', 'autoreview', 'linear'].map(
          (name) => ({ name }),
        ),
      ],
      include: options.include ?? [process.env.DIFFLAB_E2E_SPEC ?? '**/*.spec.ts'],
      exclude: ['**/.cache/**', ...(options.exclude ?? [])],
      testTimeout: 180_000,
      hookTimeout: 60_000,
      sequence: { hooks: 'stack' },
      fileParallelism: false,
      maxWorkers: 1,
      reporters: ['verbose'],
      retry: 0,
    },
  })
}
