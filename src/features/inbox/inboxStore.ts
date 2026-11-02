import { create } from 'zustand'

interface InboxState {
  /** Whether the Add sheet is open (it can be opened from any screen). */
  open: boolean
  /** A file dropped onto the app window, to start with. */
  file: File | null
  show: (file?: File | null) => void
  close: () => void
}

export const useInboxStore = create<InboxState>()((set) => ({
  open: false,
  file: null,
  show: (file = null) => set({ open: true, file }),
  close: () => set({ open: false, file: null }),
}))
