/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  cacheDir: 'node_modules/.vite-ekagra',
  plugins: [react(), tailwindcss()],
  // When this copy of the app was built (UTC), e.g. "2026-11-01 14:05". Feedback reports and the Me
  // tab show it, so the founder knows which build (web deploy or APK) a bug came from.
  define: {
    __APP_BUILD__: JSON.stringify(new Date().toISOString().slice(0, 16).replace('T', ' ')),
  },
  resolve: {
    // "@/..." means "src/..." (shorter imports, used by shadcn/ui too).
    // "@shared/..." is the AI request/answer shapes the app shares with the Edge Functions.
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@shared': fileURLToPath(new URL('./supabase/functions/_shared', import.meta.url)),
      // Ekagra Studio's code, for its tests (the app itself builds with studio/vite.config.ts).
      '@studio': fileURLToPath(new URL('./studio/src', import.meta.url)),
    },
  },
  // The Python and SQL workers are ES modules; exclude PGlite from Vite prebundling so its WASM/data assets resolve cleanly.
  optimizeDeps: {
    exclude: ['@electric-sql/pglite'],
  },
  worker: {
    format: 'es',
  },
  build: {
    rolldownOptions: {
      output: {
        // The libraries every screen needs get files of their own (Vite 8 builds with Rolldown, where
        // codeSplitting.groups replaces Rollup's manualChunks). The first download is no longer one
        // file over 500 kB, and browsers keep these cached across app updates, because their names
        // only change when the library does. Libraries that one screen needs (CodeMirror, pdf.js,
        // Markdown) stay with that screen, and Pyodide comes from a CDN, so none are listed here.
        // The first group that matches a library wins: React first, so the others don't take it.
        codeSplitting: {
          groups: [
            { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
            { name: 'router', test: /node_modules[\\/]react-router[\\/]/ },
            { name: 'supabase', test: /node_modules[\\/]@supabase[\\/]/ },
            { name: 'query', test: /node_modules[\\/]@tanstack[\\/]/ },
            { name: 'radix', test: /node_modules[\\/](radix-ui|@radix-ui|@floating-ui)[\\/]/ },
          ],
        },
      },
    },
  },
  test: {
    // src/** = app logic tests, studio/src/** = Ekagra Studio's, tests/** = database (migration + RLS)
    // tests, supabase/functions/** = Edge Function tests (they run in Node with a fake AI model)
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'studio/src/**/*.test.ts', 'studio/src/**/*.test.tsx', 'tests/**/*.test.ts', 'supabase/functions/**/*.test.ts'],
    environment: 'node',
    // Starting the in-memory Postgres for the database tests can take a few seconds.
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
})
