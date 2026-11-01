import { create } from 'zustand'

/** Whether the + Capture sheet is open (it can be opened from any screen). */
export const useCaptureStore = create<{ open: boolean; setOpen: (open: boolean) => void }>()((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}))
