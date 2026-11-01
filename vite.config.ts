/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    // "@/..." means "src/..." (shorter imports, used by shadcn/ui too).
    // "@shared/..." is the AI request/answer shapes the app shares with the Edge Functions.
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@shared': fileURLToPath(new URL('./supabase/functions/_shared', import.meta.url)),
    },
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
