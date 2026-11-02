import { FileText, Image, SquarePlay, Type, type LucideIcon } from 'lucide-react'

// How each kind of material is named and drawn in Studio.

const KINDS: Record<string, { label: string; icon: LucideIcon }> = {
  pdf: { label: 'PDF', icon: FileText },
  image: { label: 'Photo', icon: Image },
  text: { label: 'Text', icon: Type },
  youtube: { label: 'YouTube video', icon: SquarePlay },
}

export function kindLabel(kind: string): string {
  return KINDS[kind]?.label ?? 'File'
}

export function kindIcon(kind: string): LucideIcon {
  return KINDS[kind]?.icon ?? FileText
}
