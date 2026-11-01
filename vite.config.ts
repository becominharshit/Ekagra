/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
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
    },
  },
  // The Python worker is an ES module (Pyodide needs a module worker).
  worker: {
    format: 'es',
  },
  test: {
    // src/** = app logic tests, tests/** = database (migration + RLS) tests,
    // supabase/functions/** = Edge Function tests (they run in Node with a fake AI model)
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'tests/**/*.test.ts', 'supabase/functions/**/*.test.ts'],
    environment: 'node',
    // Starting the in-memory Postgres for the database tests can take a few seconds.
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
})
