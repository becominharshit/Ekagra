import { adminClient, signedInUser } from '../_shared/admin.ts'
import { supabaseUsageStore } from '../_shared/usage.ts'
import { handleStudioNotes } from './handler.ts'
import { supabaseNotesStore } from './store.ts'

/** Supabase's Edge Runtime keeps a task going after the answer is sent, until the function's time limit. */
const runtime = (globalThis as { EdgeRuntime?: { waitUntil(task: Promise<unknown>): void } }).EdgeRuntime

Deno.serve(
  handleStudioNotes(() => {
    const env = Deno.env.toObject()
    const admin = adminClient(env)
    return {
      env,
      authenticate: (request) => signedInUser(admin, request),
      usage: supabaseUsageStore(admin),
      store: supabaseNotesStore(admin),
      background: (task) => {
        if (runtime) runtime.waitUntil(task)
        else void task
      },
    }
  }),
)
