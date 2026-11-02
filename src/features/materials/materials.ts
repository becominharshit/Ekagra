import { useQuery } from '@tanstack/react-query'
import type { SourceFile } from '@shared/schemas.ts'
import { academicsKey } from '@/features/academics/subjects'
import { dbError, need, useDataSource, type DataSource } from '@/lib/dataSource'
import { demoDb } from '@/lib/demoDb'
import { deviceFiles } from '@/lib/deviceFiles'
import type { Tables } from '@/types/database'

// The PDF library. Signed in: files in the private "materials" bucket (<user_id>/<id>.pdf) and a
// row in materials. Demo Mode: the file in this device's IndexedDB and the row in demoDb.
// Page text is read from the PDF on the device when it's needed, so nothing else is stored.
// The Add inbox also saves photos (kind image, "images" bucket) and text (kind text, its text in
// material_pages) as study material. The library lists PDFs; Ekagra Studio shows every kind.

export type Material = Tables<'materials'>

/** The bucket's own limit (001_phase1_core.sql). */
export const MAX_PDF_BYTES = 50 * 1024 * 1024

const newestFirst = (a: Material, b: Material) => Date.parse(b.created_at) - Date.parse(a.created_at)

export async function listMaterials(source: DataSource): Promise<Material[]> {
  if (source.kind === 'demo') {
    return demoDb.list('materials').filter((material) => material.kind === 'pdf' && material.purpose === 'study').sort(newestFirst)
  }
  const { data, error } = await source.client
    .from('materials')
    .select('*')
    .eq('user_id', source.userId)
    .eq('kind', 'pdf')
    .eq('purpose', 'study')
    .order('created_at', { ascending: false })
  if (error) throw dbError(error)
  return data
}

/** Adds a PDF to the library (reading its page count on the device first). Without a title it's named after the file. */
export async function addPdf(source: DataSource, { file, subjectId, title: given }: { file: File; subjectId: string | null; title?: string }): Promise<Material> {
  if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) throw new Error('Choose a PDF file.')
  if (file.size > MAX_PDF_BYTES) throw new Error(`That PDF is ${(file.size / 1024 / 1024).toFixed(0)} MB. The limit is 50 MB.`)
  const { pdfPageCount } = await import('@/lib/pdf')
  const pageCount = await pdfPageCount(await file.arrayBuffer())
  const id = crypto.randomUUID()
  const title = given?.trim() || file.name.replace(/\.pdf$/i, '').trim() || 'Untitled PDF'
  const row = { id, subject_id: subjectId, kind: 'pdf', purpose: 'study', title, page_count: pageCount, status: 'ready' }

  if (source.kind === 'demo') {
    await deviceFiles.put(id, file)
    const [saved] = demoDb.insert('materials', [{ ...row, storage_path: `device:${id}` }])
    if (!saved) throw new Error('The PDF was not saved.')
    return saved
  }
  const path = `${source.userId}/${id}.pdf`
  const upload = await source.client.storage.from('materials').upload(path, file, { contentType: 'application/pdf' })
  if (upload.error) throw new Error(`The PDF could not be uploaded: ${upload.error.message}`)
  const { data, error } = await source.client.from('materials').insert({ ...row, storage_path: path }).select().single()
  if (error) {
    await source.client.storage.from('materials').remove([path]) // don't leave a file without its row
    throw dbError(error)
  }
  return data
}

/** The biggest text kept as study material (a long chapter fits; the rest is cut). */
export const MAX_MATERIAL_TEXT = 200_000

function base64ToBlob(base64: string, type: string): Blob {
  const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0))
  return new Blob([bytes], { type })
}

/**
 * Saves a photo (notes, a whiteboard, a book page) as study material, already made smaller on the
 * device (SourceFile, as the AI got it). Signed in it goes to the private "images" bucket at
 * <user_id>/materials/<id>.jpg; Demo Mode keeps it in this device's IndexedDB.
 */
export async function addPhotoMaterial(
  source: DataSource,
  { photo, subjectId, title }: { photo: SourceFile; subjectId: string | null; title: string },
): Promise<Material> {
  if (!photo.mimeType.startsWith('image/')) throw new Error('That is not a photo.')
  const id = crypto.randomUUID()
  const blob = base64ToBlob(photo.base64, photo.mimeType)
  const row = { id, subject_id: subjectId, kind: 'image', purpose: 'study', title: title.trim() || 'Photo', status: 'ready' }

  if (source.kind === 'demo') {
    await deviceFiles.put(id, blob)
    const [saved] = demoDb.insert('materials', [{ ...row, storage_path: `device:${id}` }])
    if (!saved) throw new Error('The photo was not saved.')
    return saved
  }
  const extension = photo.mimeType === 'image/png' ? 'png' : photo.mimeType === 'image/webp' ? 'webp' : 'jpg'
  const path = `${source.userId}/materials/${id}.${extension}`
  const upload = await source.client.storage.from('images').upload(path, blob, { contentType: photo.mimeType })
  if (upload.error) throw new Error(`The photo could not be uploaded: ${upload.error.message}`)
  const { data, error } = await source.client.from('materials').insert({ ...row, storage_path: path }).select().single()
  if (error) {
    await source.client.storage.from('images').remove([path]) // don't leave a file without its row
    throw dbError(error)
  }
  return data
}

/** Saves typed or pasted text as study material: the material's one page holds the text. */
export async function addTextMaterial(source: DataSource, { text, subjectId, title }: { text: string; subjectId: string | null; title: string }): Promise<Material> {
  const body = text.trim().slice(0, MAX_MATERIAL_TEXT)
  if (!body) throw new Error('There is no text to save.')
  const id = crypto.randomUUID()
  const row = { id, subject_id: subjectId, kind: 'text', purpose: 'study', title: title.trim() || 'Notes', page_count: 1, status: 'ready' }
  const page = { material_id: id, page_no: 1, text: body }

  if (source.kind === 'demo') {
    const [saved] = demoDb.insert('materials', [row])
    if (!saved) throw new Error('The text was not saved.')
    demoDb.insert('material_pages', [page])
    return saved
  }
  const { data, error } = await source.client.from('materials').insert(row).select().single()
  if (error) throw dbError(error)
  const pages = await source.client.from('material_pages').insert(page)
  if (pages.error) {
    await source.client.from('materials').delete().eq('id', id) // don't leave a material without its text
    throw dbError(pages.error)
  }
  return data
}

/** The PDF file itself, for the viewer. */
export async function loadPdfFile(source: DataSource, material: Material): Promise<Blob> {
  if (source.kind === 'demo') {
    const file = await deviceFiles.get(material.id)
    if (!file) throw new Error('This PDF is no longer on this device. Delete it and add it again.')
    return file
  }
  if (!material.storage_path) throw new Error('This PDF has no file.')
  const { data, error } = await source.client.storage.from('materials').download(material.storage_path)
  if (error) throw new Error(`The PDF could not be downloaded: ${error.message}`)
  return data
}

/** Deletes the material with its AI Anchors (flashcards made from it are kept). Photos live in the "images" bucket. */
export async function deleteMaterial(source: DataSource, material: Material): Promise<void> {
  if (source.kind === 'demo') {
    demoDb.remove('materials', [material.id])
    await deviceFiles.remove(material.id)
    return
  }
  const { error } = await source.client.from('materials').delete().eq('id', material.id)
  if (error) throw dbError(error)
  if (material.storage_path) await source.client.storage.from(material.kind === 'image' ? 'images' : 'materials').remove([material.storage_path])
}

export function useMaterials() {
  const { source, owner } = useDataSource()
  return useQuery({
    queryKey: [...academicsKey(owner), 'materials'],
    queryFn: () => listMaterials(need(source)),
    enabled: source !== null,
  })
}

export function useMaterial(materialId: string | undefined) {
  const { source, owner } = useDataSource()
  return useQuery({
    queryKey: [...academicsKey(owner), 'materials'],
    queryFn: () => listMaterials(need(source)),
    enabled: source !== null,
    select: (materials) => materials.find((material) => material.id === materialId) ?? null,
  })
}

/** The PDF file. Kept apart from the Academics keys so saving an anchor doesn't download it again. */
export function usePdfFile(material: Material | null | undefined) {
  const { source, owner } = useDataSource()
  return useQuery({
    queryKey: ['pdf-file', owner, material?.id],
    queryFn: () => loadPdfFile(need(source), material as Material),
    enabled: source !== null && Boolean(material),
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: 5 * 60 * 1000,
  })
}
