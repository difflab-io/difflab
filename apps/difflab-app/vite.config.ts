import { sveltekit } from '@sveltejs/kit/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [sveltekit()],
  ssr: {
    external: ['bun:sqlite', 'kysely-bun-worker', 'kysely-bun-worker/normal'],
  },
  build: {
    rollupOptions: {
      external: ['bun:sqlite'],
    },
  },
})
