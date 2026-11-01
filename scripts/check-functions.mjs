// Type-checks every Edge Function with Deno, the runtime Supabase uses, each with its own deno.json.
// `npm run typecheck` already checks them with Node's TypeScript; this also checks that Deno finds
// every package. The first run downloads Deno (through npx) and the packages, so it takes a while.
import { execSync } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'

const root = 'supabase/functions'
const names = readdirSync(root, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && !entry.name.startsWith('_') && existsSync(`${root}/${entry.name}/index.ts`))
  .map((entry) => entry.name)

for (const name of names) {
  console.log(`Checking ${name}`)
  // --no-lock: a lock file from this Deno may be newer than Supabase's Edge Runtime can read.
  execSync(`npx -y deno check --no-lock --config ${root}/${name}/deno.json ${root}/${name}/index.ts`, {
    stdio: 'inherit',
    env: { ...process.env, DENO_NO_UPDATE_CHECK: '1' },
  })
}
console.log(`All ${names.length} Edge Functions pass Deno's type check.`)
