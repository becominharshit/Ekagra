import { FileText, Image, ListChecks, Network, SquarePlay, Type, type LucideIcon } from 'lucide-react'
import { countLabel, minutesLabel } from '@/features/academics/labels'
import type { Material } from './materials'

// How each kind of material, and of note, is named and drawn. Ekagra and Ekagra Studio both use these.

const LABELS: Record<string, string> = { pdf: 'PDF', image: 'Photo', text: 'Text', youtube: 'YouTube video' }

/** Each kind's icon. Screens draw them with MaterialIcon and NoteIcon (KindIcons.tsx). */
export const MATERIAL_ICONS: Readonly<Record<string, LucideIcon>> = { pdf: FileText, image: Image, text: Type, youtube: SquarePlay }
export const NOTE_ICONS: Readonly<Record<string, LucideIcon>> = { notes: FileText, mind_map: Network, revision_sheet: ListChecks }

export function kindLabel(kind: string): string {
  return LABELS[kind] ?? 'File'
}

export function kindIcon(kind: string): LucideIcon {
  return MATERIAL_ICONS[kind] ?? FileText
}

/** "PDF · 12 pages", "YouTube video · 1 h 59 min", "Photo". */
export function materialSummary(material: Pick<Material, 'kind' | 'page_count' | 'duration_sec'>): string {
  const size =
    material.kind === 'pdf' && material.page_count
      ? countLabel(material.page_count, 'page')
      : material.kind === 'youtube' && material.duration_sec
        ? minutesLabel(Math.max(1, Math.round(material.duration_sec / 60)))
        : null
  return [kindLabel(material.kind), size].filter(Boolean).join(' · ')
}

/** Notes, a mind map or a revision sheet. */
export function noteIcon(kind: string): LucideIcon {
  return NOTE_ICONS[kind] ?? FileText
}
