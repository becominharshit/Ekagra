import { useQuery } from '@tanstack/react-query'
import { academicsKey } from '@/features/academics/subjects'
import { dbError, need, useDataSource, type DataSource } from '@/lib/dataSource'
import { demoDb } from '@/lib/demoDb'
import { deviceFiles } from '@/lib/deviceFiles'
import type { Tables } from '@/types/database'

// The PDF library. Signed in: files in the private "materials" bucket (<user_id>/<id>.pdf) and a
// row in materials. Demo Mode: the file in this device's IndexedDB and the row in demoDb.
// Page text is read from the PDF on the device when it's needed, so nothing else is stored.

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

/** Adds a PDF to the library (reading its page count on the device first). */
export async function addPdf(source: DataSource, { file, subjectId }: { file: File; subjectId: string | null }): Promise<Material> {
  if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) throw new Error('Choose a PDF file.')
  if (file.size > MAX_PDF_BYTES) throw new Error(`That PDF is ${(file.size / 1024 / 1024).toFixed(0)} MB. The limit is 50 MB.`)
  const { pdfPageCount } = await import('@/lib/pdf')
  const pageCount = await pdfPageCount(await file.arrayBuffer())
  const id = crypto.randomUUID()
  const title = file.name.replace(/\.pdf$/i, '').trim() || 'Untitled PDF'
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

/** Deletes the PDF with its AI Anchors (flashcards made from it are kept). */
export async function deleteMaterial(source: DataSource, material: Material): Promise<void> {
  if (source.kind === 'demo') {
    demoDb.remove('materials', [material.id])
    await deviceFiles.remove(material.id)
    return
  }
  const { error } = await source.client.from('materials').delete().eq('id', material.id)
  if (error) throw dbError(error)
  if (material.storage_path) await source.client.storage.from('materials').remove([material.storage_path])
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
