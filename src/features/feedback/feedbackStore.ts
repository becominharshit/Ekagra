import { create } from 'zustand'

interface FeedbackSheetState {
  open: boolean
  /** The app address the student was on when they opened the sheet. */
  path: string
  show: (path: string) => void
  close: () => void
}

/** Whether the "Send feedback" sheet is open (it can be opened from any screen). */
export const useFeedbackStore = create<FeedbackSheetState>()((set) => ({
  open: false,
  path: '/',
  show: (path) => set({ open: true, path }),
  close: () => set({ open: false }),
}))
