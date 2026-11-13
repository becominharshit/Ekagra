import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Ekagra Studio (App #2): a separate web app in this repo, run with `npm run dev:studio`
// (http://localhost:5174) and built with `npm run build:studio` (into studio/dist). It uses the
// root node_modules and the root .env (the same Supabase project as Ekagra), and reuses Ekagra's
// code: "@/..." is Ekagra's src/, "@studio/..." is Studio's own studio/src/.
const here = (path: string) => fileURLToPath(new URL(path, import.meta.url))

export default defineConfig({
  root: here('.'),
  cacheDir: here('../node_modules/.vite-studio'),
  envDir: here('..'),
  plugins: [
    react(),
    tailwindcss(),
    {
      // The installed app's service worker is Ekagra's own (public/sw.js): one file for both apps.
      name: 'ekagra-service-worker',
      apply: 'build',
      generateBundle() {
        this.emitFile({ type: 'asset', fileName: 'sw.js', source: readFileSync(here('../public/sw.js'), 'utf8') })
      },
    },
  ],
  define: {
    __APP_BUILD__: JSON.stringify(new Date().toISOString().slice(0, 16).replace('T', ' ')),
  },
  resolve: {
    alias: {
      '@studio': here('./src'),
      '@': here('../src'),
      '@shared': here('../supabase/functions/_shared'),
    },
  },
  server: { port: 5174, strictPort: true },
  preview: { port: 4174, strictPort: true },
  worker: { format: 'es' },
  build: {
    outDir: here('./dist'),
    emptyOutDir: true,
    rolldownOptions: {
      output: {
        // Like Ekagra's vite.config.ts: libraries every screen needs get files of their own.
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
})
