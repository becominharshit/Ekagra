import { FileText, type LucideProps } from 'lucide-react'
import { MATERIAL_ICONS, NOTE_ICONS } from './kinds'

/** A material's icon by its kind (PDF, YouTube video, photo, text). */
export function MaterialIcon({ kind, ...props }: { kind: string } & LucideProps) {
  const Icon = MATERIAL_ICONS[kind] ?? FileText
  return <Icon {...props} />
}

/** A note's icon by its kind (notes, mind map, revision sheet). */
export function NoteIcon({ kind, ...props }: { kind: string } & LucideProps) {
  const Icon = NOTE_ICONS[kind] ?? FileText
  return <Icon {...props} />
}
