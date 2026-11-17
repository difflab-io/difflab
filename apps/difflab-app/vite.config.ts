import { sveltekit } from '@sveltejs/kit/vite'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [tailwindcss(), sveltekit()],
  ssr: {
    external: ['bun:sqlite', 'kysely-bun-worker', 'kysely-bun-worker/normal'],
  },
  build: {
    rollupOptions: {
      external: ['bun:sqlite'],
    },
  },
})
