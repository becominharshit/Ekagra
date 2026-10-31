/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    // "@/..." means "src/..." (shorter imports, used by shadcn/ui too)
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    // src/** = app logic tests, tests/** = database (migration + RLS) tests
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'tests/**/*.test.ts'],
    environment: 'node',
    // Starting the in-memory Postgres for the database tests can take a few seconds.
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
})
