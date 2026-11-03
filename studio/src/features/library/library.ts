import { addPdf, addPhotoMaterial, addTextMaterial, listStudyMaterials, useStudyMaterials, type Material } from '@/features/materials/materials'
import { dbError, type DataSource } from '@/lib/dataSource'
import { demoDb } from '@/lib/demoDb'
import { deviceFiles } from '@/lib/deviceFiles'
import { shrinkPhoto } from '@/lib/files'
import { watchUrl, youtubeId, youtubeTitle } from './youtube'

// Studio's library: the student's study materials of every kind (PDFs, photos, text, YouTube
// videos), whichever app added them. They are rows in materials, shared with Ekagra through the same
// account. Listing them, their files and their text is Ekagra's code (src/features/materials), so
// both apps' libraries show the same. Studio needs sign-in, but these functions also take Demo
// Mode's data source, like all of Ekagra's.

export type { Material }
export { materialText, useMaterialFile, useMaterialText } from '@/features/materials/materials'

/** Every study material (not syllabi or past papers, which Ekagra keeps for its own screens), newest first. */
export const listLibrary = listStudyMaterials

/** The library, checked again when the student comes back (Ekagra may have added something meanwhile). */
export const useLibrary = useStudyMaterials

/** A PDF's or photo's file itself (to read it on the device, or send it to the AI). */
export async function downloadMaterial(source: DataSource, material: Material): Promise<Blob> {
  if (source.kind === 'demo') {
    const file = await deviceFiles.get(material.id)
    if (!file) throw new Error('This file is no longer on this device.')
    return file
  }
  if (!material.storage_path) throw new Error('This material has no file.')
  const { data, error } = await source.client.storage.from(material.kind === 'image' ? 'images' : 'materials').download(material.storage_path)
  if (error) throw new Error(`The file could not be downloaded: ${error.message}`)
  return data
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
