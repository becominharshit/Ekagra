import type { SupabaseClient } from '@supabase/supabase-js'

export type YoutubeCacheKind = 'notes' | 'mind_map' | 'revision_sheet' | 'quiz'

export interface CachedYoutubeEntry {
  title: string
  content: string
  model: string
}

export interface YoutubeCacheStore {
  get(videoId: string, kind: YoutubeCacheKind, promptVersion: string): Promise<CachedYoutubeEntry | null>
  set(entry: CachedYoutubeEntry & { videoId: string; kind: YoutubeCacheKind; promptVersion: string }): Promise<void>
}

export function youtubeCacheKey(videoId: string, startSec?: number, endSec?: number): string {
  if (startSec === undefined && endSec === undefined) return videoId
  return `${videoId}:${startSec ?? 0}-${endSec ?? 'end'}`
}

export function supabaseYoutubeCacheStore(client: SupabaseClient): YoutubeCacheStore {
  return {
    async get(videoId, kind, promptVersion) {
      const { data, error } = await client
        .from('youtube_note_cache')
        .select('title, content, model')
        .eq('video_id', videoId)
        .eq('kind', kind)
        .eq('prompt_version', promptVersion)
        .maybeSingle()
      if (error) {
        console.warn('Could not read youtube_note_cache:', error.message)
        return null
      }
      if (!data) return null
      const row = data as { title?: unknown; content?: unknown; model?: unknown }
      if (typeof row.content !== 'string' || !row.content.trim()) return null
      return {
        title: typeof row.title === 'string' ? row.title : '',
        content: row.content,
        model: typeof row.model === 'string' ? row.model : '',
      }
    },
    async set(entry) {
      const { error } = await client
        .from('youtube_note_cache')
        .upsert(
          {
            video_id: entry.videoId,
            kind: entry.kind,
            prompt_version: entry.promptVersion,
            title: entry.title.slice(0, 200),
            content: entry.content,
            model: entry.model,
          },
          { onConflict: 'video_id,kind,prompt_version' },
        )
      if (error) console.warn('Could not store youtube_note_cache:', error.message)
    },
  }
}
