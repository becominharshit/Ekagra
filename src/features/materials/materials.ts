import { useQuery } from '@tanstack/react-query'
import type { SourceFile } from '@shared/schemas.ts'
import { academicsKey } from '@/features/academics/subjects'
import { dbError, need, readAll, useDataSource, type DataSource } from '@/lib/dataSource'
import { demoDb } from '@/lib/demoDb'
import { deviceFiles } from '@/lib/deviceFiles'
import type { Tables } from '@/types/database'

// Study materials. PDFs, signed in: files in the private "materials" bucket (<user_id>/<id>.pdf)
// and a row in materials; Demo Mode: the file in this device's IndexedDB and the row in demoDb.
// Page text is read from the PDF on the device when it's needed, so nothing else is stored.
// The Add inbox also saves photos (kind image, "images" bucket) and text (kind text, its text in
// material_pages), and Ekagra Studio adds YouTube videos (kind youtube, the link in source_url).
// The Library lists every kind (listStudyMaterials); Ekagra Studio uses the same functions.

export type Material = Tables<'materials'>

/** The bucket's own limit (001_phase1_core.sql). */
export const MAX_PDF_BYTES = 50 * 1024 * 1024

const newestFirst = (a: Material, b: Material) => Date.parse(b.created_at) - Date.parse(a.created_at)

/** Every study material of every kind (PDFs, photos, text, YouTube videos), from either app, newest first. Not syllabi or past papers. */
export async function listStudyMaterials(source: DataSource): Promise<Material[]> {
  if (source.kind === 'demo') return demoDb.list('materials').filter((material) => material.purpose === 'study').sort(newestFirst)
  return readAll((from, to) =>
    source.client.from('materials').select('*').eq('user_id', source.userId).eq('purpose', 'study').order('created_at', { ascending: false }).range(from, to),
  )
}

/** Where a material opens in Ekagra: a PDF in the PDF viewer, anything else on its own page. */
export function materialPath(material: Pick<Material, 'id' | 'kind'>): string {
  return material.kind === 'pdf' ? `/academics/library/${material.id}` : `/academics/materials/${material.id}`
}

/** A link to a photo's or PDF's file that works for an hour (the files are private); in Demo Mode, the copy on this device. */
export async function materialFileUrl(source: DataSource, material: Material): Promise<string | null> {
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

/** PDFs only: the PDF viewer finds its PDF here. */
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

// Ekagra Studio adds and changes materials from another app or tab, so these look again (when a
// minute-old answer would be stale) whenever the student comes back.
const FROM_OTHER_APP = { staleTime: 10_000, refetchOnWindowFocus: true } as const

/** Every study material (the Library). */
export function useStudyMaterials() {
  const { source, owner } = useDataSource()
  return useQuery({
    queryKey: [...academicsKey(owner), 'study-materials'],
    queryFn: () => listStudyMaterials(need(source)),
    enabled: source !== null,
    ...FROM_OTHER_APP,
  })
}

/** One study material of any kind, or null when there's none with that id. */
export function useStudyMaterial(materialId: string | undefined) {
  const { source, owner } = useDataSource()
  return useQuery({
    queryKey: [...academicsKey(owner), 'study-materials'],
    queryFn: () => listStudyMaterials(need(source)),
    enabled: source !== null && Boolean(materialId),
    ...FROM_OTHER_APP,
    select: (materials) => materials.find((material) => material.id === materialId) ?? null,
  })
}

/** A photo's (or PDF's) file link; fetched again well before it stops working after an hour. */
export function useMaterialFile(material: Material | null | undefined) {
  const { source, owner } = useDataSource()
  return useQuery({
    queryKey: ['material-file', owner, material?.id, material?.storage_path],
    queryFn: () => materialFileUrl(need(source), material as Material),
    enabled: source !== null && Boolean(material?.storage_path),
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

/** One PDF, for the PDF viewer. */
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
