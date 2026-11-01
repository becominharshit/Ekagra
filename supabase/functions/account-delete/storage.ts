import type { SupabaseClient } from '@supabase/supabase-js'

// A student's files: everything under <user_id>/ in the private buckets (001_phase1_core.sql):
// PDFs in "materials", feedback screenshots in "images" (<user_id>/feedback/…). Supabase doesn't
// allow deleting storage rows with SQL, so they're listed and removed through the Storage API.

const BUCKETS = ['materials', 'images'] as const
const PAGE_SIZE = 1000

type Storage = Pick<SupabaseClient, 'storage'>

/** Every file path in a folder and the folders inside it. */
async function listFiles(client: Storage, bucket: string, folder: string): Promise<string[]> {
  const paths: string[] = []
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await client.storage.from(bucket).list(folder, { limit: PAGE_SIZE, offset })
    if (error) throw error
    for (const entry of data) {
      const path = `${folder}/${entry.name}`
      // Folders come back without an id.
      if (entry.id === null) paths.push(...(await listFiles(client, bucket, path)))
      else paths.push(path)
    }
    if (data.length < PAGE_SIZE) return paths
  }
}

/** Deletes every file of this student; returns how many there were. */
export async function removeUserFiles(client: Storage, userId: string): Promise<number> {
  let removed = 0
  for (const bucket of BUCKETS) {
    const paths = await listFiles(client, bucket, userId)
    for (let start = 0; start < paths.length; start += PAGE_SIZE) {
      const { error } = await client.storage.from(bucket).remove(paths.slice(start, start + PAGE_SIZE))
      if (error) throw error
    }
    removed += paths.length
  }
  return removed
}
