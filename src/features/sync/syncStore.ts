import { create } from 'zustand'

interface SyncState {
  isOnline: boolean
  pendingCount: number
  isSyncing: boolean
  lastSyncedNotice: string | null
  lastError: string | null
  demoPromptDismissed: boolean
  setOnline: (online: boolean) => void
  setPendingCount: (count: number) => void
  setSyncing: (syncing: boolean) => void
  setNotice: (notice: string | null) => void
  setError: (error: string | null) => void
  dismissDemoPrompt: () => void
  resetDemoPromptDismissed: () => void
}

export const useSyncStore = create<SyncState>()((set) => ({
  isOnline: typeof navigator === 'undefined' ? true : navigator.onLine !== false,
  pendingCount: 0,
  isSyncing: false,
  lastSyncedNotice: null,
  lastError: null,
  demoPromptDismissed: false,
  setOnline: (isOnline) => set({ isOnline }),
  setPendingCount: (pendingCount) => set({ pendingCount }),
  setSyncing: (isSyncing) => set({ isSyncing }),
  setNotice: (lastSyncedNotice) => set({ lastSyncedNotice }),
  setError: (lastError) => set({ lastError }),
  dismissDemoPrompt: () => set({ demoPromptDismissed: true }),
  resetDemoPromptDismissed: () => set({ demoPromptDismissed: false }),
}))
