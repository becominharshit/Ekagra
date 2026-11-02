import { useQuery } from '@tanstack/react-query'
import { academicsKey } from '@/features/academics/subjects'
import { addPdf, addPhotoMaterial, addTextMaterial, type Material } from '@/features/materials/materials'
import { dbError, need, readAll, useDataSource, type DataSource } from '@/lib/dataSource'
import { demoDb } from '@/lib/demoDb'
import { deviceFiles } from '@/lib/deviceFiles'
import { shrinkPhoto } from '@/lib/files'
import { watchUrl, youtubeId, youtubeTitle } from './youtube'

// Studio's library: the student's study materials of every kind (PDFs, photos, text, YouTube
// videos), whichever app added them. They are rows in materials, shared with Ekagra through the same
// account; Ekagra's own library lists only the PDFs. Studio needs sign-in, but these functions also
// take Demo Mode's data source, like all of Ekagra's.

export type { Material }

const newestFirst = (a: Material, b: Material) => Date.parse(b.created_at) - Date.parse(a.created_at)

/** Every study material (not syllabi or past papers, which Ekagra keeps for its own screens), newest first. */
export async function listLibrary(source: DataSource): Promise<Material[]> {
  if (source.kind === 'demo') return demoDb.list('materials').filter((material) => material.purpose === 'study').sort(newestFirst)
  return readAll((from, to) =>
    source.client.from('materials').select('*').eq('user_id', source.userId).eq('purpose', 'study').order('created_at', { ascending: false }).range(from, to),
  )
}

/** A link to a PDF or photo that works for an hour (the files are private). */
export async function fileUrl(source: DataSource, material: Material): Promise<string | null> {
  if (!material.storage_path) return null
  if (source.kind === 'demo') {
    const file = await deviceFiles.get(material.id)
    return file ? URL.createObjectURL(file) : null
  }
  const bucket = material.kind === 'image' ? 'images' : 'materials'
  const { data, error } = await source.client.storage.from(bucket).createSignedUrl(material.storage_path, 60 * 60)
  if (error) throw new Error(`The file could not be opened: ${error.message}`)
  return data.signedUrl
}

/** The text of a text material (its one page). */
export async function materialText(source: DataSource, materialId: string): Promise<string> {
  if (source.kind === 'demo') return demoDb.list('material_pages').find((page) => page.material_id === materialId && page.page_no === 1)?.text ?? ''
  const { data, error } = await source.client.from('material_pages').select('text').eq('material_id', materialId).eq('page_no', 1).maybeSingle()
  if (error) throw dbError(error)
  return data?.text ?? ''
}

/**
 * Adds a YouTube video by its link. The title comes from YouTube (or the student); without one the
 * video may be private, which Gemini can't read, so the caller warns about that.
 */
export async function addYoutubeLink(
  source: DataSource,
  { link, subjectId, title, fetcher }: { link: string; subjectId: string | null; title?: string; fetcher?: typeof fetch },
): Promise<{ material: Material; foundTitle: boolean }> {
  const id = youtubeId(link)
  if (!id) throw new Error("That isn't a link to a YouTube video. Copy the link from the video's Share button.")
  const found = await youtubeTitle(id, fetcher)
  const row = { subject_id: subjectId, kind: 'youtube', purpose: 'study', title: (title?.trim() || found?.title || 'YouTube video').slice(0, 200), source_url: watchUrl(id), status: 'ready' }
  if (source.kind === 'demo') {
    const [saved] = demoDb.insert('materials', [row])
    if (!saved) throw new Error('The video was not saved.')
    return { material: saved, foundTitle: found !== null }
  }
  const { data, error } = await source.client.from('materials').insert(row).select().single()
  if (error) throw dbError(error)
  return { material: data, foundTitle: found !== null }
}

export type AddInput =
  | { how: 'file'; file: File; subjectId: string | null }
  | { how: 'youtube'; link: string; title: string; subjectId: string | null }
  | { how: 'text'; text: string; title: string; subjectId: string | null }

/** Photos are kept at this size: enough to read notes, and what Gemini reads anyway. */
const PHOTO_SIDE = 1600

/** Adds one material: a PDF or photo (made smaller first), a YouTube link or text. `warning` is for the student. */
export async function addMaterial(source: DataSource, input: AddInput): Promise<{ material: Material; warning: string | null }> {
  if (input.how === 'youtube') {
    const { material, foundTitle } = await addYoutubeLink(source, { link: input.link, subjectId: input.subjectId, title: input.title })
    const warning = foundTitle
      ? null
      : "YouTube didn't show this video's details. If it's private or unlisted, Studio can't make notes from it: only public videos work."
    return { material, warning }
  }
  if (input.how === 'text') return { material: await addTextMaterial(source, input), warning: null }

  const { file, subjectId } = input
  const name = file.name.replace(/\.[a-z0-9]{2,5}$/i, '').replace(/_+/g, ' ').trim()
  if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) return { material: await addPdf(source, { file, subjectId }), warning: null }
  if (file.type.startsWith('image/')) {
    const photo = await shrinkPhoto(file, PHOTO_SIDE, 0.85)
    return { material: await addPhotoMaterial(source, { photo, subjectId, title: name || 'Photo' }), warning: null }
  }
  throw new Error('Add a PDF or a photo (JPG, PNG or WebP).')
}

/** Files a material under another subject (null = no subject). */
export async function moveMaterial(source: DataSource, { id, subjectId }: { id: string; subjectId: string | null }): Promise<void> {
  if (source.kind === 'demo') {
    demoDb.update('materials', id, { subject_id: subjectId })
    return
  }
  const { error } = await source.client.from('materials').update({ subject_id: subjectId }).eq('id', id)
  if (error) throw dbError(error)
}

export async function renameMaterial(source: DataSource, { id, title }: { id: string; title: string }): Promise<void> {
  const clean = title.trim().slice(0, 200)
  if (!clean) throw new Error('Give it a name.')
  if (source.kind === 'demo') {
    demoDb.update('materials', id, { title: clean })
    return
  }
  const { error } = await source.client.from('materials').update({ title: clean }).eq('id', id)
  if (error) throw dbError(error)
}

// Ekagra's screens don't refresh when the student comes back to them; these do, because the other
// app may have added or changed something meanwhile.
const FROM_OTHER_APP = { staleTime: 10_000, refetchOnWindowFocus: true } as const

export function useLibrary() {
  const { source, owner } = useDataSource()
  return useQuery({
    queryKey: [...academicsKey(owner), 'library'],
    queryFn: () => listLibrary(need(source)),
    enabled: source !== null,
    ...FROM_OTHER_APP,
  })
}

export function useMaterialFile(material: Material | null | undefined) {
  const { source, owner } = useDataSource()
  return useQuery({
    queryKey: ['material-file', owner, material?.id, material?.storage_path],
    queryFn: () => fileUrl(need(source), material as Material),
    enabled: source !== null && Boolean(material?.storage_path),
    // The link lasts an hour: fetch a new one well before that.
    staleTime: 45 * 60 * 1000,
    gcTime: 50 * 60 * 1000,
  })
}

export function useMaterialText(material: Material | null | undefined) {
  const { source, owner } = useDataSource()
  return useQuery({
    queryKey: [...academicsKey(owner), 'material-text', material?.id],
    queryFn: () => materialText(need(source), material?.id ?? ''),
    enabled: source !== null && material?.kind === 'text',
  })
}
