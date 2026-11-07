import type { SupabaseClient } from '@supabase/supabase-js'
import { AiError } from '../_shared/aiCore.ts'
import type { NotesStore } from './handler.ts'

// The notes table, through the admin client. It skips RLS, so every row is written with the signed-in
// student's user_id; the links (subject_id, user_id) and (material_id, user_id) then only accept that
// student's own subject and material (009_studio.sql).

const PLAIN_VIDEO_TITLE = 'YouTube video'

export function supabaseNotesStore(client: SupabaseClient): NotesStore {
  return {
    async create(row) {
      const { data, error } = await client
        .from('notes')
        .insert({ user_id: row.userId, subject_id: row.subjectId, material_id: row.materialId, kind: row.kind, title: row.title, source: row.source, status: 'processing' })
        .select('id')
        .single()
      if (error) {
        // 23503: the subject or material isn't this student's (or doesn't exist); 42P01: no notes table yet.
        if (error.code === '23503') throw new AiError(400, 'bad_request', "That subject or material wasn't found. It may have been deleted.")
        if (error.code === '42P01' || error.code === 'PGRST205') throw new AiError(500, 'not_ready', 'The database needs the latest update (npm run db:push).')
        throw error
      }
      return (data as { id: string }).id
    },
    async finish(noteId, userId, result) {
      const { error } = await client
        .from('notes')
        .update({ status: 'ready', title: result.title.slice(0, 200), content: result.content, model: result.model, prompt_version: result.promptVersion, error: null })
        .eq('id', noteId)
        .eq('user_id', userId)
      if (error) throw error
    },
    async fail(noteId, userId, message) {
      const { error } = await client.from('notes').update({ status: 'failed', error: message.slice(0, 1000) }).eq('id', noteId).eq('user_id', userId)
      if (error) throw error
    },
    async describeVideo(materialId, userId, details) {
      const length = await client.from('materials').update({ duration_sec: details.durationSec }).eq('id', materialId).eq('user_id', userId)
      if (length.error) throw length.error
      const title = await client.from('materials').update({ title: details.title.slice(0, 200) }).eq('id', materialId).eq('user_id', userId).eq('title', PLAIN_VIDEO_TITLE)
      if (title.error) throw title.error
    },
    async readyNotes(materialId, userId) {
      const { data, error } = await client
        .from('notes')
        .select('content')
        .eq('user_id', userId)
        .eq('material_id', materialId)
        .eq('kind', 'notes')
        .eq('status', 'ready')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error) throw error
      const content = (data as { content: string } | null)?.content.trim()
      return content ? content : null
    },
  }
}
