import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ModeSwitchEvent, ScheduledBlock } from './modes'

interface ModeState {
  /** The plan block for right now. Set by the Mode Simulator until the planner exists (Milestone 4). */
  block: ScheduledBlock | null
  /** Blocks where you already confirmed a switch, so the warning doesn't repeat. */
  acknowledgedBlockIds: string[]
  /** Confirmed switches, newest first. Milestone 4 saves these to the database. */
  switchLog: ModeSwitchEvent[]
  setBlock: (block: ScheduledBlock | null) => void
  recordSwitch: (event: ModeSwitchEvent) => void
}

// Zustand = a small shared "box" of state that any component can read.
// `persist` saves it in the browser's localStorage, so a page refresh keeps it.
export const useModeStore = create<ModeState>()(
  persist(
    (set) => ({
      block: null,
      acknowledgedBlockIds: [],
      switchLog: [],
      setBlock: (block) => set({ block }),
      recordSwitch: (event) =>
        set((state) => ({
          acknowledgedBlockIds: [...state.acknowledgedBlockIds, event.blockId].slice(-20),
          switchLog: [event, ...state.switchLog].slice(0, 50),
        })),
    }),
    { name: 'sma-mode' },
  ),
)
