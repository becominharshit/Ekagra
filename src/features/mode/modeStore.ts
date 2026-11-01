import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface ModeState {
  /** Blocks where you already confirmed a switch, so the warning doesn't repeat during that block. */
  acknowledgedBlockIds: string[]
  acknowledge: (blockId: string) => void
}

// Zustand = a small shared "box" of state that any component can read.
// `persist` saves it in the browser's localStorage, so a page refresh keeps it.
export const useModeStore = create<ModeState>()(
  persist(
    (set) => ({
      acknowledgedBlockIds: [],
      acknowledge: (blockId) => set((state) => ({ acknowledgedBlockIds: [...state.acknowledgedBlockIds, blockId].slice(-20) })),
    }),
    {
      name: 'sma-mode',
      partialize: (state) => ({ acknowledgedBlockIds: state.acknowledgedBlockIds }),
      // Version 0 also kept the Mode Simulator's block and a switch log on the device; they're gone.
      version: 1,
      migrate: () => ({ acknowledgedBlockIds: [] }),
    },
  ),
)
