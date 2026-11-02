import { create } from 'zustand'
import type { SourceFile } from '@shared/schemas.ts'

/** What the sheet starts with when the Add inbox hands over something it recognised as a task. */
export interface CapturePrefill {
  text: string
  file: { source: SourceFile; name: string } | null
}

interface CaptureState {
  /** Whether the + Capture sheet is open (it can be opened from any screen). */
  open: boolean
  prefill: CapturePrefill | null
  setOpen: (open: boolean) => void
  /** Opens the sheet filled in (from the Add inbox). */
  openWith: (prefill: CapturePrefill) => void
}

export const useCaptureStore = create<CaptureState>()((set) => ({
  open: false,
  prefill: null,
  setOpen: (open) => set(open ? { open } : { open, prefill: null }),
  openWith: (prefill) => set({ open: true, prefill }),
}))
